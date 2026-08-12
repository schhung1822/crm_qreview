// Tạo ảnh bằng AI: OpenAI (gpt-image-1) hoặc Gemini (Imagen). Server-only.
// Trả base64 PNG; tầng route sẽ lưu file vào public/generated và trả URL.
import { getActiveKey } from '../secrets/store';
import type { ImageConfig, ImageSize as CfgImageSize } from '../store/image-config';
import { recordUsage } from './usage';
import { renderUser } from './prompt-store';

export type ImageSize = CfgImageSize;

// CHỐT GÓI + HẠN MỨC cho tạo ẢNH. Trước đây chỉ lời gọi TEXT (qua callProvider) mới bị chốt, còn
// ảnh đi thẳng REST → lách được quota. Đưa chốt vào đây để MỌI đường tạo ảnh đều qua kiểm tra.
// Không có ngữ cảnh biz (worker/test) → bỏ qua (giống assertPlanAndBudget của providers.ts).
async function assertImageQuota(_provider: 'openai' | 'gemini'): Promise<void> {
  // Không còn quota theo gói cước trong dự án single-workspace.
}

// Ghi nhận 1 lần tạo ảnh: token (nếu API trả) + đếm 1 ảnh (để tính phí theo ảnh cho
// model không trả token như Imagen/DALL·E). Không chặn lỗi ghi.
async function recordImageUsage(
  provider: string,
  model: string,
  inTokens?: number,
  outTokens?: number,
): Promise<void> {
  try {
    await recordUsage(provider, model, inTokens ?? 0, outTokens ?? 0, 1);
  } catch {
    /* lỗi ghi usage không ảnh hưởng kết quả */
  }
}

const SIZE_TO_ASPECT: Record<ImageSize, string> = {
  '1024x1024': '1:1',
  '1536x1024': '16:9',
  '1024x1536': '9:16',
};

// Provider có khả năng tạo ảnh đang có key. preferred (nếu có key) được ưu tiên,
// nếu không có thì OpenAI rồi Gemini.
export async function resolveImageProvider(
  preferred?: 'openai' | 'gemini' | '',
): Promise<{ provider: 'openai' | 'gemini'; key: string } | null> {
  if (preferred) {
    const k = await getActiveKey(preferred);
    if (k) return { provider: preferred, key: k };
  }
  const oa = await getActiveKey('openai');
  if (oa) return { provider: 'openai', key: oa };
  const gm = await getActiveKey('gemini');
  if (gm) return { provider: 'gemini', key: gm };
  return null;
}

export async function imageProviderAvailable(): Promise<boolean> {
  return (await resolveImageProvider()) !== null;
}

// Danh sách model ảnh khả dụng theo provider (curated - API không liệt kê model ảnh rõ).
export const IMAGE_MODELS: Record<'openai' | 'gemini', string[]> = {
  openai: ['gpt-image-1', 'dall-e-3'],
  gemini: [
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-ultra-generate-001',
    'gemini-2.5-flash-image',
  ],
};

export async function generateImageB64(opts: {
  prompt: string;
  size: ImageSize;
  provider?: 'openai' | 'gemini' | '';
  model?: string;
}): Promise<{ b64: string }> {
  const p = await resolveImageProvider(opts.provider);
  if (!p) {
    throw new Error('Cần API key OpenAI hoặc Gemini (có hỗ trợ tạo ảnh) - nhập ở API Keys & AI.');
  }

  // CHỐT gói + hạn mức TRƯỚC khi gọi API tạo ảnh (mọi đường tạo ảnh đều đi qua đây).
  await assertImageQuota(p.provider);

  if (p.provider === 'openai') {
    const model = opts.model && IMAGE_MODELS.openai.includes(opts.model) ? opts.model : 'gpt-image-1';
    // dall-e-3 chỉ nhận size 1024x1024 / 1792x1024 / 1024x1792.
    const size =
      model === 'dall-e-3'
        ? opts.size === '1536x1024'
          ? '1792x1024'
          : opts.size === '1024x1536'
            ? '1024x1792'
            : '1024x1024'
        : opts.size;
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: opts.prompt,
        size,
        n: 1,
        ...(model === 'gpt-image-1' ? {} : { response_format: 'b64_json' }),
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI image ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI không trả về ảnh.');
    await recordImageUsage('openai', model, data.usage?.input_tokens, data.usage?.output_tokens);
    return { b64 };
  }

  const aspect = SIZE_TO_ASPECT[opts.size];
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  let lastErr = 'Gemini không tạo được ảnh';

  // Model người dùng chọn (nếu là gemini-*-image → đi nhánh generateContent; nếu là
  // imagen → thử trước tiên). Mặc định: Imagen 4 (đúng tỉ lệ, bám prompt tốt).
  const chosen = opts.model?.trim();
  const useGcFirst = !!chosen && /image$/i.test(chosen) && !/^imagen/i.test(chosen);
  const imagenModels =
    chosen && /^imagen/i.test(chosen)
      ? [chosen, 'imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001']
      : ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001'];

  // 1) Imagen (:predict) - hỗ trợ aspectRatio. Bỏ qua nếu người dùng chọn model *-image.
  for (const model of useGcFirst ? [] : imagenModels) {
    const res = await fetch(`${base}/${model}:predict?key=${p.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: { sampleCount: 1, aspectRatio: aspect },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
      const b64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (b64) {
        await recordImageUsage('gemini', model, 0, 0); // Imagen tính phí theo ảnh
        return { b64 };
      }
      lastErr = 'Imagen không trả về dữ liệu ảnh';
    } else {
      lastErr = `Imagen ${res.status}: ${(await res.text()).slice(0, 140)}`;
    }
  }

  // 2) gemini-*-image (generateContent). Truyền aspectRatio qua imageConfig để ra
  //    đúng tỉ lệ. Ưu tiên model người dùng chọn nếu thuộc nhóm này.
  const gcModels = [
    ...(useGcFirst ? [chosen as string] : []),
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
  ];
  const prompt = `${opts.prompt} (aspect ratio ${aspect})`;
  for (const model of gcModels) {
    const res = await fetch(`${base}/${model}:generateContent?key=${p.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: aspect },
        },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          thoughtsTokenCount?: number;
        };
      };
      const part = data.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
      if (part?.inlineData?.data) {
        await recordImageUsage(
          'gemini',
          model,
          data.usageMetadata?.promptTokenCount,
          // Cộng token "suy nghĩ" (nếu có) vào token ra cho khớp cách Google tính phí.
          (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
        );
        return { b64: part.inlineData.data };
      }
      lastErr = 'Gemini không trả về dữ liệu ảnh';
    } else {
      lastErr = `Gemini image ${res.status}: ${(await res.text()).slice(0, 140)}`;
    }
  }
  throw new Error(lastErr);
}

// Quy tắc CHỐNG rò rỉ: model hay vẽ luôn mô tả style (tên font, mã màu, px, button)
// thành chữ trên ảnh. Bộ luật này cấm tuyệt đối điều đó - dùng cho cả bìa & minh họa.
const NO_TEXT_RULES = [
  'STRICT RULES - the image is a clean visual illustration only:',
  'Do NOT render ANY text, letters, words, numbers, captions or labels on the image.',
  'Do NOT draw hex color codes (e.g. #0f172a), font names (e.g. "Inter"), pixel/size values (e.g. 38px, 700 weight), or any typography spec.',
  'Do NOT draw UI elements: buttons, badges, chips, cards, sliders, color swatches, style-guide panels, mockups or design-system sheets.',
  'The style description is INTERNAL guidance for choosing colors/mood/composition ONLY - never copy or display any of its words on the image.',
].join(' ');

// Chuyển system design thành CHỈ DẪN màu/mood (không phải nội dung để vẽ chữ).
function styleGuidance(config: ImageConfig): string {
  const s = config.systemDesign?.trim();
  return s
    ? `Use this brand design system ONLY as a reference for art style, color palette, lighting, mood and composition. IGNORE any typography, UI/component or layout-spec text in it, and NEVER display any of its words on the image:\n${s}`
    : 'Use a clean, modern, professional palette and composition.';
}

// Dựng prompt ảnh bìa - chủ đề lấy từ bài viết; system design chỉ định màu/mood.
// Mặc định KHÔNG chữ (chữ AI render thường méo/sai); chỉ vẽ minh họa sạch.
export async function buildCoverPrompt(input: {
  title: string;
  summary?: string;
  content?: string;
  sceneBrief?: string; // mô tả cảnh do AI rút từ nội dung bài → ảnh bám sát nội dung
  userBrief?: string; // mô tả người dùng muốn ảnh trông thế nào → ưu tiên CAO NHẤT
  config: ImageConfig;
}): Promise<string> {
  const topic = [input.summary, input.content].filter(Boolean).join(' - ').slice(0, 500);
  // Ưu tiên sceneBrief (AI đã đọc bài) làm CHỦ THỂ chính; nếu không có thì dựa topic.
  const subject = input.sceneBrief?.trim()
    ? `SCENE TO DEPICT (must match the article's content): ${input.sceneBrief.trim()}.`
    : `A scene that visually represents the topic of this article: "${input.title}".${topic ? ` Depict concepts from: ${topic}.` : ''}`;
  // Yêu cầu của người dùng (nếu có) là chỉ dẫn QUAN TRỌNG NHẤT về nội dung/bố cục/phong cách.
  const userWish = input.userBrief?.trim()
    ? `USER REQUEST (HIGHEST priority — the image MUST follow this): ${input.userBrief.trim()}.`
    : '';
  return renderUser('image_cover', {
    yeu_cau_nguoi_dung: userWish,
    chu_the: subject,
    chi_dan_style: styleGuidance(input.config),
    quy_tac_khong_chu: NO_TEXT_RULES,
  });
}

// Dựng prompt ảnh minh họa trong bài - cùng nguyên tắc (không chữ, style tham chiếu).
// userBrief = mô tả người dùng muốn ảnh trông thế nào (áp cho MỌI ảnh minh họa của lần tạo này).
export async function buildIllustrationPrompt(alt: string, config: ImageConfig, userBrief?: string): Promise<string> {
  const userWish = userBrief?.trim()
    ? `USER REQUEST for the style/look (HIGHEST priority): ${userBrief.trim()}.`
    : '';
  return renderUser('image_illustration', {
    mo_ta: alt,
    yeu_cau_nguoi_dung: userWish,
    chi_dan_style: styleGuidance(config),
    quy_tac_khong_chu: NO_TEXT_RULES,
  });
}
