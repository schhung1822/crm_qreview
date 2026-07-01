// Lớp đa provider AI: gọi Anthropic / OpenAI / Gemini / DeepSeek qua REST (fetch).
// Key + định tuyến task lấy từ src/lib/secrets/store. Server-only.
import {
  PROVIDER_META,
  getActiveKey,
  getProviderModel,
  getRouting,
  type AiProviderId,
  type AiTask,
} from '../secrets/store';
import { extractJson } from './json';
import { recordUsage } from './usage';

export interface CompleteInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  json?: boolean;
}

// Kết quả 1 lần gọi provider: text + token tiêu thụ (nếu provider trả về).
interface ProviderResult {
  text: string;
  inTokens: number;
  outTokens: number;
}

// Timeout chống treo (gọi AI đôi khi 30–90s; quá 180s coi như lỗi để không "xoay" mãi).
const AI_TIMEOUT_MS = 180_000;

async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error('Hết thời gian chờ phản hồi từ AI (timeout). Thử lại hoặc đổi model.');
    }
    throw new Error(`Không gọi được API (mạng): ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

// Gọi 1 provider cụ thể với key + model cho sẵn. Trả text + token tiêu thụ.
async function callProvider(
  provider: AiProviderId,
  key: string,
  model: string,
  input: CompleteInput,
): Promise<ProviderResult> {
  // Trần output an toàn theo provider → không xin quá giới hạn model (gây 400). Lưu ý:
  // max_tokens chỉ là TRẦN, tính tiền theo token THỰC sinh ra → đặt rộng KHÔNG tốn thêm.
  const PROVIDER_MAX: Record<AiProviderId, number> = {
    anthropic: 8192,
    gemini: 8192,
    deepseek: 8192,
    openai: 16000,
  };
  const maxTokens = Math.min(input.maxTokens ?? 4096, PROVIDER_MAX[provider] ?? 8192);

  if (provider === 'anthropic') {
    const res = await aiFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: data.content?.map((b) => b.text ?? '').join('') ?? '',
      inTokens: data.usage?.input_tokens ?? 0,
      outTokens: data.usage?.output_tokens ?? 0,
    };
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await aiFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(input.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
      inTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  // OpenAI & DeepSeek đều dùng schema chat/completions tương thích nhau.
  const baseUrl =
    provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
  // Model suy luận của OpenAI (o-series, gpt-5) yêu cầu max_completion_tokens thay vì
  // max_tokens (gửi sai → 400). Tự nhận diện theo tên model.
  const isReasoning = provider === 'openai' && /^(o\d|gpt-5)/.test(model);
  // Reasoning model tiêu tốn nhiều token cho suy luận ẩn → nới trần để CÒN chỗ cho JSON
  // output (nếu không, output bị cắt cụt/rỗng → parse hỏng khi đổi sang các model này).
  const tokenBudget = isReasoning ? Math.max(maxTokens, 16000) : maxTokens;

  const callOnce = (useJsonFormat: boolean, budget: number) =>
    aiFetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        ...(isReasoning ? { max_completion_tokens: budget } : { max_tokens: budget }),
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
        ...(useJsonFormat && input.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

  let res = await callOnce(true, tokenBudget);
  // Tự chữa 400: (a) model KHÔNG hỗ trợ response_format=json_object → bỏ ép JSON mode
  // (prompt đã yêu cầu JSON + extractJson tự cứu); (b) trần token xin quá giới hạn model
  // → hạ về mức an toàn. Nhờ vậy đổi model/nâng maxTokens không làm cả tác vụ thất bại.
  if (!res.ok && res.status === 400) {
    const errText = await res.text();
    const jsonFmtIssue = !!input.json && /response_format|json/i.test(errText);
    const tokenIssue = /max_tokens|max_completion_tokens|maximum.*token|token.*maximum|less than or equal|too large/i.test(errText);
    if (jsonFmtIssue || tokenIssue) {
      const safeBudget = tokenIssue ? Math.min(tokenBudget, 4096) : tokenBudget;
      res = await callOnce(jsonFmtIssue ? false : true, safeBudget);
    } else {
      throw new Error(`${provider} 400: ${errText.slice(0, 300)}`);
    }
  }
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    inTokens: data.usage?.prompt_tokens ?? 0,
    outTokens: data.usage?.completion_tokens ?? 0,
  };
}

// Chọn provider cho task: ưu tiên routing; nếu provider đó không có key → provider đầu tiên có key.
async function resolveForTask(
  task: AiTask,
): Promise<{ provider: AiProviderId; key: string } | null> {
  const routing = await getRouting();
  const preferred = routing[task];
  const candidates: AiProviderId[] = [
    preferred,
    ...(Object.keys(PROVIDER_META) as AiProviderId[]).filter((p) => p !== preferred),
  ];
  for (const provider of candidates) {
    const key = await getActiveKey(provider);
    if (key) return { provider, key };
  }
  return null;
}

// Cho phép chỉ định cứng provider + model (vd người dùng chọn ở trình soạn thảo).
export interface AiOverride {
  provider?: AiProviderId;
  model?: string;
}

// Hoàn thành 1 prompt cho task; trả { text, provider } hoặc null nếu không có key nào.
// override.provider/model (nếu có) ưu tiên hơn định tuyến mặc định.
export async function complete(
  task: AiTask,
  input: CompleteInput,
  tier: 'writer' | 'fast' = 'writer',
  override?: AiOverride,
): Promise<{ text: string; provider: AiProviderId } | null> {
  let provider: AiProviderId;
  let key: string;
  if (override?.provider) {
    const k = await getActiveKey(override.provider);
    if (!k) return null; // người dùng chọn provider chưa có key
    provider = override.provider;
    key = k;
  } else {
    const resolved = await resolveForTask(task);
    if (!resolved) return null;
    provider = resolved.provider;
    key = resolved.key;
  }
  const model = override?.model?.trim() || (await getProviderModel(provider, tier));
  const result = await callProvider(provider, key, model, input);
  // Ghi nhận token đã dùng (cho bộ đếm + bảng chi phí ở Tổng quan). Không chặn lỗi ghi.
  try {
    await recordUsage(provider, model, result.inTokens, result.outTokens);
  } catch {
    /* lỗi ghi usage không ảnh hưởng kết quả AI */
  }
  return { text: result.text, provider };
}

// Như complete nhưng ép parse JSON; trả object T hoặc null.
export async function completeJson<T>(
  task: AiTask,
  input: CompleteInput,
  tier: 'writer' | 'fast' = 'writer',
  override?: AiOverride,
): Promise<T | null> {
  // Trả null khi: (a) không có key, (b) lỗi provider, (c) JSON không parse được.
  // KHÔNG nuốt im lặng - log lý do để chẩn đoán (tránh "âm thầm rơi về mock").
  let result: Awaited<ReturnType<typeof complete>>;
  try {
    result = await complete(task, { ...input, json: true }, tier, override);
  } catch (e) {
    console.error(
      `[completeJson] lỗi provider (task=${task}):`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
  if (!result) return null; // không có key
  const val = extractJson(result.text);
  if (val == null) {
    console.error(`[completeJson] JSON không parse được (task=${task}, provider=${result.provider}).`);
    return null;
  }
  return val as T;
}

// Có ít nhất 1 provider đang bật + có key không? (để UI biết bật/tắt nút AI)
export async function aiReady(): Promise<boolean> {
  for (const provider of Object.keys(PROVIDER_META) as AiProviderId[]) {
    if (await getActiveKey(provider)) return true;
  }
  return false;
}

export type ModelKind = 'text' | 'image';

// Mẫu nhận diện model TẠO ẢNH theo provider (để lọc gọn danh sách).
const IMAGE_ID = {
  openai: /^(gpt-image|dall-e)/i,
  gemini: /imagen|image$/i,
};

// Lấy danh sách model khả dụng từ API của provider (dùng key đã nhập).
// kind='text' → chỉ model viết bài; kind='image' → chỉ model tạo ảnh. Danh sách gọn.
export async function listProviderModels(
  provider: AiProviderId,
  key: string,
  kind: ModelKind = 'text',
): Promise<string[]> {
  if (provider === 'anthropic') {
    if (kind === 'image') return []; // Anthropic không tạo ảnh
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return (data.data ?? []).map((m) => m.id).filter((id) => /claude/i.test(id));
  }

  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=400`,
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = (await res.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };
    const all = (data.models ?? []).map((m) => ({
      id: m.name.replace(/^models\//, ''),
      methods: m.supportedGenerationMethods ?? [],
    }));
    if (kind === 'image') {
      return all
        .filter((m) => IMAGE_ID.gemini.test(m.id))
        .map((m) => m.id)
        .sort();
    }
    // Viết bài: model gemini text, loại ảnh/imagen/tts/embedding/aqa.
    return all
      .filter((m) => m.methods.includes('generateContent'))
      .map((m) => m.id)
      .filter((id) => /gemini/i.test(id) && !/(image|imagen|tts|embedding|aqa|vision)/i.test(id))
      .sort();
  }

  if (provider === 'deepseek' && kind === 'image') return []; // DeepSeek không tạo ảnh

  // OpenAI & DeepSeek: GET /models (Bearer), schema tương thích.
  const url =
    provider === 'deepseek'
      ? 'https://api.deepseek.com/models'
      : 'https://api.openai.com/v1/models';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${provider} ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  let ids = (data.data ?? []).map((m) => m.id);
  if (provider === 'openai') {
    if (kind === 'image') {
      ids = ids.filter((id) => IMAGE_ID.openai.test(id));
    } else {
      // chỉ giữ model sinh văn bản dạng chat
      ids = ids.filter(
        (id) =>
          /^(gpt-|o1|o3|o4|chatgpt)/.test(id) &&
          !/(audio|realtime|transcribe|tts|image|embedding|moderation|search)/.test(id),
      );
    }
  }
  return ids.sort();
}

function statusFromError(msg: string): number | null {
  const m = msg.match(/\b(400|401|403|404|429|500|502|503)\b/);
  return m ? Number(m[1]) : null;
}

// Diễn giải lỗi cho người dùng (tiếng Việt, có gợi ý xử lý).
export function friendlyProviderError(provider: AiProviderId, err: unknown): string {
  const raw = err instanceof Error ? err.message : 'unknown';
  const s = statusFromError(raw);
  if (s === 401 || (provider === 'gemini' && s === 400)) {
    return 'API key không hợp lệ (sai key hoặc đã bị thu hồi).';
  }
  if (s === 403) {
    return provider === 'gemini'
      ? 'Key bị từ chối (403): kiểm tra lại key và bật "Generative Language API" trong Google AI Studio.'
      : 'Key không đủ quyền (403) - kiểm tra phạm vi/permission của key.';
  }
  if (s === 429) return 'Vượt hạn mức hoặc tài khoản chưa có credit (429).';
  if (s === 404) return 'Không tìm thấy endpoint/model (404).';
  return `Lỗi: ${raw.slice(0, 200)}`;
}

// Test key - XÁC THỰC bằng cách gọi danh sách model (KHÔNG tốn quota, không cần credit).
// Nhờ vậy key hợp lệ nhưng chưa nạp tiền vẫn Test thành công.
export async function testProviderKey(
  provider: AiProviderId,
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await listProviderModels(provider, key);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyProviderError(provider, err) };
  }
}
