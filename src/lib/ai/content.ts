// Sinh & bản địa hóa nội dung. Có provider AI (key trong Settings/env) → gọi thật;
// không có → trả mock có cấu trúc. Provider chọn theo định tuyến task "writing".
import { z } from 'zod';
import type { Locale } from '../../i18n/config';
import { dedash } from '../content/dedash';
import { extractKeywordHeuristic } from '../content/keyword-extract';
import { generatePlanItems } from '../plan/generate';
import { getArticleConfig } from '../store/article-config';
import type { PlanItem } from '../store/plans';
import { extractJson } from './json';
import { complete, completeJson, type AiOverride } from './providers';
import {
  blueprintPrompt,
  contentPlanPrompt,
  extractKeywordPrompt,
  factCheckPrompt,
  humanizePrompt,
  keywordResearchPrompt,
  localizePrompt,
  optimizePrompt,
  researchPrompt,
  writeArticlePrompt,
} from './prompts';
import { renderPrompt, renderUser } from './prompt-store';

// Giọng thương hiệu của biz đang hoạt động (brand voice) - nhét vào prompt viết/tối ưu/bản địa
// hóa. Đọc lỗi/không có biz → undefined (không áp), không làm hỏng luồng sinh nội dung.
async function currentBrandVoice(): Promise<string | undefined> {
  try {
    const cfg = await getArticleConfig();
    return cfg.brandVoice?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export const GeneratedArticleSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  markdown: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  tags: z.array(z.string()).default([]),
  seoNotes: z.string().default(''),
});
export type GeneratedArticle = z.infer<typeof GeneratedArticleSchema>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

export interface GenerateResult {
  article: GeneratedArticle;
  usedAi: boolean; // true nếu nội dung do AI sinh (không phải mock)
  error?: string; // lỗi provider (nếu có) để hiển thị cho người dùng
}

// Trần token do người dùng đặt ở Cài đặt bài viết (0/undefined = tự động dùng mặc định đã
// tính theo độ dài bài). Kẹp [2000, 16000] cho an toàn (provider vẫn tự hạ nếu vượt model).
function resolveMaxTokens(configured: number | undefined, autoDefault: number): number {
  if (configured && configured > 0) return Math.min(16000, Math.max(2000, Math.round(configured)));
  return autoDefault;
}

// Ghi log LÝ DO khi parse/validate output AI thất bại → chẩn đoán được nguyên nhân thật:
// output rỗng? model không trả JSON? JSON thiếu field (cắt cụt/sai định dạng)?
function logAiParseFail(
  tag: string,
  attempt: number,
  res: { text: string; provider: string },
  extracted: unknown,
  parsed: { success: boolean; error?: { issues: Array<{ path: Array<string | number>; message: string }> } },
): void {
  const text = res.text ?? '';
  console.error(`[${tag}] parse/validate FAIL`, {
    attempt,
    provider: res.provider,
    textLen: text.length,
    empty: !text.trim(),
    jsonExtracted: extracted != null,
    zodIssues:
      extracted != null && parsed.error
        ? parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        : undefined,
    head: text.slice(0, 160),
    tail: text.length > 160 ? text.slice(-80) : undefined,
  });
}

// Đổi lỗi thô của provider (vd 'openai 429: {json…}') thành thông báo NGẮN, DỄ HIỂU, có
// hướng xử lý cho người dùng. Giữ nguyên nếu không khớp mẫu nào (cắt bớt cho gọn).
export function humanizeAiError(msg: string): string {
  const m = msg || '';
  const provider = /^(\w+)\s/.exec(m)?.[1] ?? '';
  const who = provider ? `${provider[0].toUpperCase()}${provider.slice(1)}` : 'AI';
  if (/\b429\b|quota|rate.?limit|insufficient|billing/i.test(m))
    return `${who} đã hết hạn mức / quá tải (429). Đổi sang AI khác (Gemini, DeepSeek, Claude) ở ô chọn AI, hoặc kiểm tra gói/billing của provider.`;
  if (/\b40[13]\b|invalid.*key|unauthor|permission|api key/i.test(m))
    return `Khóa API của ${who} không hợp lệ hoặc thiếu quyền. Kiểm tra lại ở "API Keys & AI", hoặc đổi sang AI khác.`;
  if (/\b5\d\d\b|timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(m))
    return `${who} lỗi tạm thời (server bận/timeout). Thử lại sau ít phút hoặc đổi sang AI khác.`;
  return m.length > 200 ? m.slice(0, 200) + '…' : m;
}

export async function generateArticle(input: {
  title: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  outline?: string[];
  locale: Locale;
  override?: AiOverride;
  research?: string; // tóm tắt research để model viết đúng thông tin
  internalLinks?: Array<{ anchor: string; url: string }>; // pillar ↔ cluster
  maxTokens?: number; // trần token do người dùng đặt (0/undefined = tự động)
}): Promise<GenerateResult> {
  const maxTokens = resolveMaxTokens(input.maxTokens, 16000);
  const secondaryKeywords = input.secondaryKeywords ?? [];
  const outline = input.outline ?? [];

  // Bước 1: NGHIÊN CỨU trước khi viết (nếu chưa truyền sẵn) → bài bám đúng thông tin.
  // Lỗi/không có key thì bỏ qua, vẫn viết bình thường.
  let research = input.research;
  if (!research) {
    try {
      const rp = await researchPrompt({
        title: input.title,
        targetKeyword: input.targetKeyword,
        locale: input.locale,
      });
      const r = await complete(
        'writing',
        { system: rp.system, prompt: rp.user, maxTokens: 1200 },
        'writer',
        input.override,
      );
      research = r?.text ?? undefined;
    } catch (e) {
      // Research lỗi (timeout/provider) → vẫn viết được, nhưng KHÔNG im lặng: log để
      // biết bài có thể thiếu dữ liệu nền (tăng rủi ro bịa).
      console.error('[generateArticle] bước research lỗi, viết không có research:', e instanceof Error ? e.message : e);
      research = undefined;
    }
  }

  const basePrompt = await writeArticlePrompt({
    ...input,
    secondaryKeywords,
    outline,
    internalLinks: input.internalLinks,
    research,
    brandVoice: await currentBrandVoice(),
  });
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về một object JSON hợp lệ, bắt đầu bằng "{" và kết thúc bằng "}". TUYỆT ĐỐI không kèm markdown (```), không lời dẫn, không giải thích.';

  let error: string | undefined;
  // Thử tối đa 2 lần (lần 2 ép JSON thuần) để giảm lỗi parse khi đổi AI/model.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: basePrompt.system,
          prompt: attempt === 0 ? basePrompt.user : basePrompt.user + STRICT,
          maxTokens, // trần người dùng đặt, hoặc mặc định 16000 (provider tự hạ nếu vượt giới hạn model)
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) break; // không có key
      const val = extractJson(res.text);
      const parsed = GeneratedArticleSchema.safeParse(val);
      if (parsed.success) return { article: dedashGenerated(ensureFaqInMarkdown(parsed.data)), usedAi: true };
      logAiParseFail('generateArticle', attempt, res, val, parsed);
      error = 'AI trả về không đúng định dạng JSON. Thử lại hoặc đổi model.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Lỗi gọi AI';
      break; // lỗi provider (timeout/401…) → không retry vô ích
    }
  }

  // Fallback mock (không có key, lỗi provider, hoặc parse lỗi).
  const mock: GeneratedArticle = {
    title: input.title,
    metaDescription: '',
    slug: slugify(input.title),
    markdown: [
      `**Trả lời nhanh:** ${input.targetKeyword} là chủ đề trọng tâm của bài viết này. ` +
        `Dưới đây là giải thích ngắn gọn, trích-dẫn-được cho cả người đọc và engine AI.`,
      '',
      `## ${input.title}`,
      '',
      'Nội dung nháp mẫu (chưa gọi được AI). Kiểm tra API key / model rồi thử lại.',
      '',
      ...(outline.length ? outline.map((h) => `## ${h}\n\nNội dung cho mục "${h}"…`) : []),
    ].join('\n'),
    faq: [{ q: `${input.targetKeyword} là gì?`, a: 'Định nghĩa ngắn gọn, dễ được AI trích.' }],
    tags: [input.targetKeyword, ...secondaryKeywords].filter(Boolean).slice(0, 5),
    seoNotes: 'Bản nháp mock.',
  };
  return { article: mock, usedAi: false, error };
}

// Chuẩn hóa gạch dài "—/–" → "-" trên MỌI trường text của bài (xử lý dứt điểm ngay khi sinh).
function dedashGenerated(a: GeneratedArticle): GeneratedArticle {
  return {
    ...a,
    title: dedash(a.title),
    metaDescription: dedash(a.metaDescription),
    markdown: dedash(a.markdown),
    faq: a.faq.map((f) => ({ q: dedash(f.q), a: dedash(f.a) })),
    tags: a.tags.map(dedash),
    seoNotes: dedash(a.seoNotes),
  };
}

// Điểm GEO chấm trên markdown. Nếu model trả FAQ ở mảng `faq` riêng mà markdown
// chưa có heading "## FAQ", gộp vào markdown để không mất điểm schema/Q&A.
function ensureFaqInMarkdown(a: GeneratedArticle): GeneratedArticle {
  const hasFaqHeading = /(^|\n)#{2,3}\s*FAQ\b/i.test(a.markdown);
  if (hasFaqHeading || !a.faq.length) return a;
  const block = ['', '## FAQ', '', ...a.faq.map((f) => `### ${f.q}\n\n${f.a}`)].join('\n');
  return { ...a, markdown: `${a.markdown.trimEnd()}\n${block}\n` };
}

export const LocalizedSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  markdown: z.string(),
});
export type Localized = z.infer<typeof LocalizedSchema>;

export async function localizeArticle(input: {
  sourceMarkdown: string;
  sourceTitle: string;
  sourceLocale: string;
  targetLocale: Locale;
  localKeyword?: string;
  override?: AiOverride;
  maxTokens?: number; // trần token do người dùng đặt (0/undefined = tự động theo độ dài bài)
}): Promise<Localized> {
  // Bản địa hóa ≈ độ dài bài nguồn → cấp trần token theo kích thước nguồn để không cắt cụt.
  const estIn = Math.ceil((input.sourceMarkdown.length + input.sourceTitle.length) / 3);
  const auto = Math.min(32000, Math.max(12000, Math.round(estIn * 1.8)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);
  const lp = await localizePrompt({ ...input, brandVoice: await currentBrandVoice() });
  const raw = await completeJson<unknown>(
    'writing',
    { system: lp.system, prompt: lp.user, maxTokens },
    'writer',
    input.override,
  );
  const parsed = LocalizedSchema.safeParse(raw);
  if (parsed.success) {
    const d = parsed.data;
    return { ...d, title: dedash(d.title), metaDescription: dedash(d.metaDescription), markdown: dedash(d.markdown) };
  }

  return {
    title: `[${input.targetLocale}] ${input.sourceTitle}`,
    metaDescription: '',
    slug: slugify(input.sourceTitle),
    markdown: input.sourceMarkdown,
  };
}

// ─── Tối ưu/sửa bài có sẵn để tăng SEO + GEO ───
// Schema PARSE nới lỏng: CHỈ `markdown` bắt buộc (là cốt lõi). title/meta/slug model hay thiếu
// hoặc trả null → coi như "giữ nguyên bản gốc" thay vì báo lỗi "sai định dạng". Nhờ vậy tối ưu
// ít fail hơn hẳn. Các trường thiếu được điền lại từ bài gốc sau khi parse.
const OptimizedRawSchema = z.object({
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  slug: z.string().optional(),
  markdown: z.string().min(1),
  tags: z.array(z.string()).default([]),
  changes: z.array(z.object({ field: z.string(), note: z.string() })).default([]),
});
export interface Optimized {
  title: string;
  metaDescription: string;
  slug: string;
  markdown: string;
  tags: string[];
  changes: Array<{ field: string; note: string }>;
}

// Trả null nếu không có provider AI hợp lệ hoặc output không parse được.
export async function optimizeArticle(input: {
  title: string;
  markdown: string;
  metaDescription?: string;
  targetKeyword?: string;
  locale: Locale;
  weakPoints?: string[];
  override?: AiOverride;
  internalLinks?: Array<{ anchor: string; url: string }>;
  maxTokens?: number; // trần token do người dùng đặt (0/undefined = tự động theo độ dài bài)
}): Promise<{ result: Optimized | null; error?: string }> {
  const base = await optimizePrompt({ ...input, brandVoice: await currentBrandVoice() });
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về một object JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown, không giải thích.';
  // Output ≈ độ dài bài (viết lại) → cấp trần token theo kích thước ĐẦU VÀO để bài dài KHÔNG bị
  // cắt cụt khiến JSON hỏng. Sàn 12000 (chừa chỗ cho "thinking" của Gemini 2.5+), trần 32000.
  // callProvider tự kẹp lại theo giới hạn từng provider. max_tokens là TRẦN, tính tiền theo token
  // THỰC sinh ra → đặt rộng KHÔNG tốn thêm.
  const estIn = Math.ceil(((input.markdown?.length ?? 0) + (input.title?.length ?? 0)) / 3);
  const auto = Math.min(32000, Math.max(12000, Math.round(estIn * 1.8)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);
  let error = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: base.system,
          prompt: attempt === 0 ? base.user : base.user + STRICT,
          maxTokens,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { result: null, error: 'Chưa có API key AI.' };
      const val = extractJson(res.text);
      const parsed = OptimizedRawSchema.safeParse(val);
      if (parsed.success) {
        const r = parsed.data;
        // Trường thiếu → điền lại từ bài gốc (tối ưu = giữ nguyên rồi thêm).
        const title = (r.title ?? '').trim() || input.title;
        return {
          result: {
            title: dedash(title),
            metaDescription: dedash((r.metaDescription ?? input.metaDescription ?? '').trim()),
            slug: (r.slug ?? '').trim() || slugify(title),
            markdown: dedash(r.markdown),
            tags: r.tags.map(dedash),
            changes: r.changes,
          },
        };
      }
      // Ghi rõ LÝ DO hỏng để chẩn đoán (rỗng? không có JSON? thiếu field? cắt cụt?).
      logAiParseFail('optimizeArticle', attempt, res, val, parsed);
    } catch (e) {
      return { result: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
    }
  }
  return { result: null, error };
}

// ─── Kiểm chứng số liệu: liệt kê phát biểu định lượng THIẾU nguồn (dùng AI) ───
const ClaimsSchema = z.object({
  claims: z.array(z.object({ claim: z.string(), note: z.string().default('') })).default([]),
});
export interface ClaimFlag {
  claim: string;
  note: string;
}
export async function checkClaims(input: {
  markdown: string;
  locale: Locale;
  override?: AiOverride;
}): Promise<ClaimFlag[]> {
  const fp = await factCheckPrompt(input);
  const raw = await completeJson<unknown>(
    'analysis',
    { system: fp.system, prompt: fp.user, maxTokens: 1500 },
    'fast',
    input.override,
  );
  const parsed = ClaimsSchema.safeParse(raw);
  return parsed.success ? parsed.data.claims : [];
}

// ─── Nhân hóa: viết lại bài cho tự nhiên hơn, bớt "giọng AI" ───
const HumanizeSchema = z.object({ markdown: z.string().min(1) });
export async function humanizeArticle(input: {
  markdown: string;
  locale: Locale;
  override?: AiOverride;
}): Promise<{ markdown: string | null; error?: string }> {
  const estIn = Math.ceil(input.markdown.length / 3);
  const maxTokens = Math.min(32000, Math.max(12000, Math.round(estIn * 1.8)));
  try {
    const hp = await humanizePrompt(input);
    const raw = await completeJson<unknown>(
      'writing',
      { system: hp.system, prompt: hp.user, maxTokens },
      'writer',
      input.override,
    );
    const parsed = HumanizeSchema.safeParse(raw);
    if (parsed.success) return { markdown: dedash(parsed.data.markdown) };
    return { markdown: null, error: 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.' };
  } catch (e) {
    return { markdown: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
  }
}

// ─── AI sửa bài theo yêu cầu tự nhiên (chat trong trình soạn — "Cursor cho bài viết") ───
// Nếu có `selection`: chỉ viết lại ĐÚNG đoạn đó (trả về phần thay thế). Nếu không: sửa cả bài.
export const EditResultSchema = z.object({
  text: z.string(),
  note: z.string().default(''),
});
export type EditResult = z.infer<typeof EditResultSchema>;

export async function editContent(input: {
  instruction: string;
  selection?: string; // đoạn được bôi đen (nếu có) — chỉ sửa đúng đoạn này
  fullMarkdown: string; // toàn bài để AI có ngữ cảnh
  title: string;
  targetKeyword?: string;
  locale: Locale;
  override?: AiOverride;
  maxTokens?: number;
}): Promise<{ result: EditResult | null; error?: string }> {
  const hasSel = !!input.selection?.trim();
  const ctx = input.fullMarkdown.slice(0, 24000); // giới hạn ngữ cảnh gửi lên
  const p = await renderPrompt('edit_selection', {
    ma_ngon_ngu: input.locale,
    tieu_de: input.title,
    dong_tu_khoa: input.targetKeyword ? `Target keyword: ${input.targetKeyword}\n` : '',
    noi_dung: ctx,
    khoi_chon: hasSel
      ? `SELECTED passage to rewrite:\n"""\n${input.selection}\n"""\n\n`
      : `No selection — edit the WHOLE article.\n\n`,
    yeu_cau: input.instruction,
  });
  const STRICT =
    '\n\nQUAN TRỌNG: CHỈ trả về JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown fence, không giải thích.';
  // Sửa đoạn nhỏ → cần ít token; sửa cả bài → cấp theo độ dài bài để không cắt cụt.
  const estIn = hasSel
    ? Math.ceil((input.selection?.length ?? 0) / 3)
    : Math.ceil((input.fullMarkdown.length + input.title.length) / 3);
  const auto = hasSel
    ? Math.min(8000, Math.max(1000, Math.round(estIn * 2 + 500)))
    : Math.min(32000, Math.max(12000, Math.round(estIn * 1.8)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);

  let error = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: p.system,
          prompt: attempt === 0 ? p.user : p.user + STRICT,
          maxTokens,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { result: null, error: 'Chưa có API key AI.' };
      const val = extractJson(res.text);
      const parsed = EditResultSchema.safeParse(val);
      if (parsed.success) return { result: { ...parsed.data, text: dedash(parsed.data.text) } };
      logAiParseFail('editContent', attempt, res, val, parsed);
    } catch (e) {
      return { result: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
    }
  }
  return { result: null, error };
}

// ─── AI sửa TOÀN BỘ bài theo yêu cầu (panel "Nhập yêu cầu chỉnh sửa") ───
// Trả về mọi trường đã cập nhật đồng bộ: tiêu đề, từ khóa, slug, meta, thẻ, nội dung.
export const ArticleEditSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  markdown: z.string(),
  tags: z.array(z.string()).default([]),
  targetKeyword: z.string().default(''),
  note: z.string().default(''),
});
export type ArticleEdit = z.infer<typeof ArticleEditSchema>;

export async function editArticleFull(input: {
  instruction: string;
  title: string;
  metaDescription?: string;
  slug?: string;
  markdown: string;
  tags?: string[];
  targetKeyword?: string;
  locale: Locale;
  override?: AiOverride;
  maxTokens?: number;
}): Promise<{ result: ArticleEdit | null; error?: string }> {
  const p = await renderPrompt('edit_full', {
    ma_ngon_ngu: input.locale,
    tieu_de: input.title,
    tu_khoa: input.targetKeyword ?? '',
    slug: input.slug ?? '',
    meta: input.metaDescription ?? '',
    the_tags: (input.tags ?? []).join(', '),
    noi_dung: input.markdown.slice(0, 40000),
    yeu_cau: input.instruction,
  });
  const STRICT =
    '\n\nQUAN TRỌNG: CHỈ trả về JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown fence, không giải thích.';
  // Viết lại cả bài → cấp trần token theo độ dài bài để không cắt cụt JSON.
  const estIn = Math.ceil((input.markdown.length + input.title.length) / 3);
  const auto = Math.min(32000, Math.max(12000, Math.round(estIn * 1.8)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);

  let error = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        { system: p.system, prompt: attempt === 0 ? p.user : p.user + STRICT, maxTokens, json: true },
        'writer',
        input.override,
      );
      if (!res) return { result: null, error: 'Chưa có API key AI.' };
      const val = extractJson(res.text);
      const parsed = ArticleEditSchema.safeParse(val);
      if (parsed.success) {
        const data = parsed.data;
        // Chuẩn hóa slug cho an toàn (AI đôi khi trả slug có dấu/khoảng trắng) + đổi gạch dài → "-".
        return {
          result: {
            ...data,
            title: dedash(data.title),
            metaDescription: dedash(data.metaDescription),
            markdown: dedash(data.markdown),
            tags: data.tags.map(dedash),
            targetKeyword: dedash(data.targetKeyword),
            slug: slugify(data.slug || data.title),
          },
        };
      }
      logAiParseFail('editArticleFull', attempt, res, val, parsed);
    } catch (e) {
      return { result: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
    }
  }
  return { result: null, error };
}

// ─── AI viết MÔ TẢ NGẮN cho từng bài (dùng cho llms.txt + trang đã chấm điểm khi audit) ───
// Nhận [{id,title,context?}] → trả { id: "mô tả 1 câu" }. Trả {} nếu không có key/lỗi.
export async function describeArticles(
  items: Array<{ id: string; title: string; context?: string }>,
  locale: string,
  override?: AiOverride,
): Promise<Record<string, string>> {
  if (!items.length) return {};
  const list = items
    .slice(0, 40)
    .map(
      (it, i) =>
        `${i + 1}. id="${it.id}" | ${it.title}${it.context ? ` | ${it.context.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`,
    )
    .join('\n');
  const dp = await renderPrompt('describe_articles', { ma_ngon_ngu: locale, danh_sach: list });
  const raw = await completeJson<Record<string, unknown>>(
    'analysis',
    { system: dp.system, prompt: dp.user, maxTokens: 2200 },
    'fast',
    override,
  );
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.trim()) out[k] = dedash(v.trim().slice(0, 200));
    }
  }
  return out;
}

// ─── Hướng dẫn KHẮC PHỤC chi tiết cho 1 lỗi/cảnh báo audit (popup) ───
// Trả Markdown từng bước cho đúng vấn đề; null nếu không có key AI nào.
export async function auditFixGuide(input: {
  label: string; // tên kiểm tra (vd "Thiếu meta description")
  shortFix: string; // gợi ý ngắn sẵn có
  group: string; // ai | seo | aeo | onpage | perf
  value?: string; // dữ liệu phát hiện (URL, số, danh sách…)
  url: string; // website đang kiểm tra
  locale: string; // ngôn ngữ đầu ra
  aiProvider?: string; // provider người dùng chọn ở form ('' auto · tên provider)
  aiModel?: string;
}): Promise<string | null> {
  const override: AiOverride | undefined =
    input.aiProvider && input.aiProvider !== 'none'
      ? { provider: input.aiProvider as AiOverride['provider'], model: input.aiModel || undefined }
      : undefined;
  const ap = await renderPrompt('audit_fix', {
    ma_ngon_ngu: input.locale,
    website: input.url,
    nhom: input.group,
    van_de: input.label,
    dong_du_lieu: input.value ? `Dữ liệu phát hiện: ${input.value}\n` : '',
    dong_goi_y: input.shortFix ? `Gợi ý ngắn hiện có: ${input.shortFix}\n` : '',
  });
  const res = await complete(
    'analysis',
    { system: ap.system, prompt: ap.user, maxTokens: 1100 },
    'fast',
    override,
  );
  return res?.text?.trim() || null;
}

// ─── Trích target keyword từ nội dung bài (AI nếu có key, fallback heuristic) ───
const KeywordSchema = z.object({ keyword: z.string() });

export async function extractTargetKeyword(
  input: {
    title: string;
    markdown: string;
  },
  override?: AiOverride,
): Promise<string> {
  const ep = await extractKeywordPrompt(input);
  const raw = await completeJson<unknown>(
    'analysis',
    { system: ep.system, prompt: ep.user, maxTokens: 64 },
    'fast',
    override,
  );
  const parsed = KeywordSchema.safeParse(raw);
  const aiKw = parsed.success ? parsed.data.keyword.trim() : '';
  if (aiKw && aiKw.length <= 60) return aiKw.toLowerCase();
  return extractKeywordHeuristic(input.title, input.markdown);
}

// ─── Sinh Content Plan bằng AI (bám sát từ khóa đã nghiên cứu) ───
const PlanAiSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        target: z.string(),
        type: z.string().default('Hướng dẫn'),
        priority: z.enum(['high', 'medium', 'low']).default('medium'),
        cluster: z.string().optional(),
        isPillar: z.boolean().optional(),
      }),
    )
    .min(1),
});

export interface PlanKeyword {
  term: string;
  cluster: string;
  volume: number;
  difficulty: number;
  intent: string;
  type: string;
}

// Trả về danh sách PlanItem. Dùng AI nếu có key; fallback heuristic khi lỗi/không key.
export async function generatePlanWithAI(input: {
  seed: string;
  locale: Locale;
  keywords: PlanKeyword[];
  override?: AiOverride;
}): Promise<{ items: PlanItem[]; usedAi: boolean; error?: string }> {
  const fallback = () => ({
    // generatePlanItems nhận StoredKeyword[]; PlanKeyword tương thích về field cần dùng.
    items: generatePlanItems(input.seed, input.keywords as never),
    usedAi: false,
  });

  const validTerms = new Map(input.keywords.map((k) => [k.term.trim().toLowerCase(), k]));
  const base = await contentPlanPrompt({ seed: input.seed, locale: input.locale, keywords: input.keywords });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';

  let error: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        { system: base.system, prompt: attempt === 0 ? base.user : base.user + STRICT, maxTokens: 2048, json: true },
        'writer',
        input.override,
      );
      if (!res) return fallback(); // không có key
      const parsed = PlanAiSchema.safeParse(extractJson(res.text));
      if (!parsed.success) {
        error = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
        continue;
      }

      // Lọc & chuẩn hóa: target PHẢI là từ khóa CÓ trong bộ (bám chính xác).
      const seen = new Set<string>();
      const sats: PlanItem[] = [];
      let pillar: PlanItem | null = null;
      for (const it of parsed.data.items) {
        const key = it.target.trim().toLowerCase();
        if (it.isPillar && !pillar) {
          pillar = {
            title: it.title,
            target: validTerms.has(key) ? validTerms.get(key)!.term : input.seed,
            type: 'Pillar',
            priority: 'high',
            isPillar: true,
            slug: slugify(input.seed),
            cluster: 'pillar',
          };
          continue;
        }
        if (!validTerms.has(key) || seen.has(key)) continue; // bỏ từ khóa bịa / trùng
        seen.add(key);
        const kw = validTerms.get(key)!;
        sats.push({
          title: it.title,
          target: kw.term,
          type: it.type || 'Hướng dẫn',
          priority: it.priority,
          slug: slugify(kw.term),
          cluster: it.cluster || kw.cluster,
        });
      }

      if (sats.length === 0) {
        error = 'AI không tạo được bài vệ tinh hợp lệ.';
        continue;
      }
      if (!pillar) {
        // Không có bài trụ → chọn từ khóa volume cao nhất làm trụ.
        const top = [...input.keywords].sort((a, b) => b.volume - a.volume)[0];
        pillar = {
          title: `Hướng dẫn toàn diện về ${input.seed}`,
          target: top?.term ?? input.seed,
          type: 'Pillar',
          priority: 'high',
          isPillar: true,
          slug: slugify(input.seed),
          cluster: 'pillar',
        };
      }
      return { items: [pillar, ...sats], usedAi: true };
    } catch (e) {
      error = e instanceof Error ? e.message : 'Lỗi gọi AI';
      break; // lỗi provider → không retry
    }
  }
  return { ...fallback(), error };
}

// ─── Mô tả CẢNH ảnh bìa bám sát nội dung bài (cho AI tạo ảnh) ───
// Trả mô tả cảnh (tiếng Anh, ngắn) hoặc null nếu không có key/không gọi được.
export async function describeImageScene(input: {
  title: string;
  content?: string;
  override?: AiOverride;
}): Promise<string | null> {
  const body = (input.content ?? '').slice(0, 2000);
  if (!input.title && !body) return null;
  try {
    const sp = await renderPrompt('image_scene', { tieu_de: input.title, noi_dung: body });
    const res = await complete(
      'analysis',
      { system: sp.system, prompt: sp.user, maxTokens: 120 },
      'fast',
      input.override,
    );
    const text = res?.text?.trim();
    if (!text) return null;
    // Lấy 1 dòng, bỏ ngoặc kép thừa.
    return text.split('\n')[0].replace(/^["']|["']$/g, '').slice(0, 300);
  } catch {
    return null;
  }
}

// ─── Tối ưu "System Design" (mô tả brand/thiết kế) thành cấu trúc chuẩn, thân thiện cho AI sinh ảnh ───
const DesignSystemSchema = z.object({
  visualStyle: z.string().default(''),
  colorPalette: z.string().default(''),
  typography: z.string().default(''),
  effects: z.string().default(''),
  components: z.string().default(''),
  layout: z.string().default(''),
  rules: z.string().default(''),
});
type DesignSystemFields = z.infer<typeof DesignSystemSchema>;

// Nhãn 7 mục chuẩn (đúng yêu cầu người dùng). Text có nhãn rõ ràng → vừa cho người đọc,
// vừa dễ để prompt sinh ảnh trích phần màu/mood/style.
const DESIGN_LABELS: Array<[keyof DesignSystemFields, string]> = [
  ['visualStyle', 'Visual Style'],
  ['colorPalette', 'Color Palette'],
  ['typography', 'Typography'],
  ['effects', 'Hiệu ứng'],
  ['components', 'Components'],
  ['layout', 'Layout'],
  ['rules', 'Quy tắc bắt buộc'],
];

function formatDesignSystem(f: DesignSystemFields): string {
  return DESIGN_LABELS.map(([k, label]) => `## ${label}\n${(f[k] ?? '').trim() || '-'}`).join('\n\n');
}

export interface DesignSystemResult {
  design?: string; // text có cấu trúc 7 mục (đưa vào ô System Design)
  error?: string;
}

export async function optimizeDesignSystem(input: {
  notes: string;
  locale: Locale;
  override?: AiOverride;
}): Promise<DesignSystemResult> {
  const notes = input.notes.trim();
  try {
    const dp = await renderPrompt('design_system', {
      ma_ngon_ngu: input.locale,
      ghi_chu: notes.slice(0, 4000) || '(no notes provided — infer a modern, professional brand design system)',
    });
    const parsed = await completeJson<unknown>(
      'analysis',
      { system: dp.system, prompt: dp.user, maxTokens: 2000 },
      'writer',
      input.override,
    );
    if (!parsed) return { error: 'AI không trả về kết quả hợp lệ. Thử lại hoặc đổi model.' };
    const fields = DesignSystemSchema.parse(parsed);
    return { design: formatDesignSystem(fields) };
  } catch (e) {
    return { error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
  }
}

// ─── Gợi ý internal link theo NỘI DUNG (AI đọc bài, không chỉ so từ khóa tiêu đề) ───
const RelatedLinksSchema = z.object({
  pairs: z
    .array(
      z.object({
        from: z.number().int(),
        to: z.number().int(),
        reason: z.string().default(''),
      }),
    )
    .default([]),
});

export interface RelatedLinksResult {
  pairs?: Array<{ from: number; to: number; reason: string }>;
  noKey?: boolean; // không có provider/key nào → để UI báo đúng (không nói nhầm "chưa có key")
  error?: string; // lỗi provider hoặc parse → hiển thị lý do thật
}

// Gợi ý cặp internal link theo NỘI DUNG. Phân biệt rõ: thiếu key / lỗi / thành công.
export async function suggestRelatedLinks(input: {
  posts: Array<{ title: string; excerpt: string }>;
  locale: Locale;
  override?: AiOverride;
}): Promise<RelatedLinksResult> {
  if (input.posts.length < 2) return { pairs: [] };
  const list = input.posts.map((p, i) => `[${i}] ${p.title}\n${p.excerpt}`).join('\n\n');
  const rp = await renderPrompt('related_link', { ma_ngon_ngu: input.locale, danh_sach_bai: list });
  // Thử 2 lần (lần 2 ép JSON thuần) để giảm lỗi parse khi đổi model.
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: rp.system,
          prompt: attempt === 0 ? rp.user : rp.user + STRICT,
          maxTokens: 4096,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { noKey: true }; // provider được chọn / mặc định không có key
      const parsed = RelatedLinksSchema.safeParse(extractJson(res.text));
      if (parsed.success) return { pairs: parsed.data.pairs };
      lastErr = 'AI trả về không đúng định dạng JSON. Thử lại hoặc đổi model.';
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
    }
  }
  return { error: lastErr ?? 'Lỗi gọi AI' };
}

// ─── Gợi ý BACKLINK chéo site (giữa bài trên các CMS khác nhau) ───
const BacklinkPairsSchema = z.object({
  pairs: z
    .array(
      z.object({
        a: z.number().int(),
        b: z.number().int(),
        score: z.number().min(0).max(100).default(0),
        reason: z.string().default(''),
        anchorA: z.string().default(''),
        anchorB: z.string().default(''),
      }),
    )
    .default([]),
});

export interface BacklinkPair {
  a: number;
  b: number;
  score: number;
  reason: string;
  anchorA: string;
  anchorB: string;
}
export interface BacklinkSuggestResult {
  pairs?: BacklinkPair[];
  noKey?: boolean;
  error?: string;
}

// Ghép cặp bài KHÁC SITE thật sự liên quan để đi backlink 2 chiều. Mỗi bài kèm nhãn site + trích
// nội dung ĐỦ DÀI để AI chọn được cụm neo (anchor) có sẵn trong bài. Lọc chặt: chỉ cặp mạnh.
export async function suggestBacklinks(input: {
  posts: Array<{ site: string; title: string; excerpt: string }>;
  locale: Locale;
  override?: AiOverride;
}): Promise<BacklinkSuggestResult> {
  if (input.posts.length < 2) return { pairs: [] };
  const list = input.posts
    .map((p, i) => `[${i}] (${p.site}) ${p.title}\n${p.excerpt}`)
    .join('\n\n');
  const rp = await renderPrompt('backlink_relate', { ma_ngon_ngu: input.locale, danh_sach_bai: list });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: rp.system,
          prompt: attempt === 0 ? rp.user : rp.user + STRICT,
          maxTokens: 4096,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { noKey: true };
      const parsed = BacklinkPairsSchema.safeParse(extractJson(res.text));
      if (parsed.success) return { pairs: parsed.data.pairs };
      lastErr = 'AI trả về không đúng định dạng JSON. Thử lại hoặc đổi model.';
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
    }
  }
  return { error: lastErr ?? 'Lỗi gọi AI' };
}

// ─── Nghiên cứu từ khóa bằng AI (sinh danh sách thật, đúng ngôn ngữ; metrics ước lượng) ───
const KeywordIdeasSchema = z.object({
  clusters: z.array(z.string()).default([]),
  keywords: z
    .array(
      z.object({
        term: z.string().min(1),
        cluster: z.string().default('General'),
        intent: z
          .enum(['informational', 'commercial', 'transactional', 'navigational'])
          .default('informational'),
        isQuestion: z.boolean().default(false),
        type: z.enum(['seo', 'geo']).default('seo'),
      }),
    )
    .min(1),
});
export type KeywordIdeas = z.infer<typeof KeywordIdeasSchema>;

// Trả về danh sách ý tưởng từ khóa hoặc null nếu không có key / lỗi / không parse được.
export async function researchKeywordsWithAI(input: {
  seed: string;
  locale: Locale;
  override?: AiOverride;
}): Promise<KeywordIdeas | null> {
  const base = await keywordResearchPrompt({ seed: input.seed, locale: input.locale });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: base.system,
          prompt: attempt === 0 ? base.user : base.user + STRICT,
          maxTokens: 2048,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return null; // không có key
      const parsed = KeywordIdeasSchema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
    } catch (e) {
      console.error('[researchKeywordsWithAI] lỗi gọi AI:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}

// ─── Lên KHUNG nội dung (blueprint) bằng AI - bước 1 của quy trình 2 bước ───
export const BlueprintSchema = z.object({
  title: z.string().min(1),
  targetKeyword: z.string().default(''),
  secondaryKeywords: z.array(z.string()).default([]),
  outline: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  brief: z.string().default(''),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

// Trả về khung nội dung hoặc null nếu không có key / lỗi / không parse được.
export async function generateBlueprint(input: {
  topic: string;
  targetKeyword?: string;
  locale: Locale;
  source?: string;
  override?: AiOverride;
}): Promise<Blueprint | null> {
  const base = await blueprintPrompt({
    topic: input.topic,
    targetKeyword: input.targetKeyword,
    locale: input.locale,
    source: input.source,
  });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: base.system,
          prompt: attempt === 0 ? base.user : base.user + STRICT,
          maxTokens: 1500,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return null;
      const parsed = BlueprintSchema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
    } catch (e) {
      console.error('[generateBlueprint] lỗi gọi AI:', e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}

// ─── AI ĐỌC nội dung landing → hiểu sản phẩm/dịch vụ → đề xuất chỉnh sửa cụ thể ───
// Khác với auditFixGuide (hướng dẫn từng lỗi rời rạc): đây là phân tích TỔNG THỂ, bám vào
// đúng sản phẩm/dịch vụ trong trang, giống "tối ưu bằng AI" của bài viết.
export const LandingSuggestionSchema = z.object({
  summary: z.string().default(''), // 1-2 câu: AI hiểu trang bán/giới thiệu gì
  suggestions: z
    .array(
      z.object({
        area: z.string().min(1), // vùng cần sửa (Tiêu đề, CTA, Nội dung, Schema…)
        recommendation: z.string().min(1), // đề xuất cụ thể, kèm ví dụ nếu hợp lý
        priority: z.enum(['high', 'medium', 'low']).default('medium'),
        snippet: z.string().default(''), // NỘI DUNG DÁN ĐƯỢC thực hiện đề xuất (code/text chuẩn), rỗng nếu không áp dụng
        snippetLang: z.string().default(''), // nhãn ngôn ngữ khối: html / json-ld / text …
      }),
    )
    .default([]),
});
export type LandingSuggestion = z.infer<typeof LandingSuggestionSchema>;

export async function suggestLandingEdits(input: {
  title?: string;
  content: string; // văn bản trích từ landing (htmlToMarkdown)
  weakPoints: string[]; // nhãn các check fail/warn từ audit
  locale: Locale;
  override?: AiOverride;
}): Promise<{ result: LandingSuggestion | null; error?: string }> {
  const content = input.content.replace(/\s+\n/g, '\n').trim().slice(0, 12000);
  if (!content) return { result: null, error: 'Trang không có đủ nội dung văn bản để phân tích.' };
  const lp = await renderPrompt('landing_suggest', {
    ma_ngon_ngu: input.locale,
    dong_tieu_de: input.title ? `Title: ${input.title}\n` : '',
    noi_dung: content,
    khoi_diem_yeu: input.weakPoints.length
      ? `Weak points from the automated SEO/AEO/GEO audit (address the relevant ones):\n- ${input.weakPoints
          .slice(0, 30)
          .join('\n- ')}\n\n`
      : '',
  });
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown, không giải thích.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        { system: lp.system, prompt: attempt === 0 ? lp.user : lp.user + STRICT, maxTokens: 1800, json: true },
        'writer',
        input.override,
      );
      if (!res) return { result: null, error: 'Chưa có API key AI.' };
      const parsed = LandingSuggestionSchema.safeParse(extractJson(res.text));
      if (parsed.success) {
        const d = parsed.data;
        return {
          result: {
            summary: dedash(d.summary),
            suggestions: d.suggestions.map((s) => ({
              area: dedash(s.area),
              recommendation: dedash(s.recommendation),
              priority: s.priority,
              snippet: dedash(s.snippet),
              snippetLang: s.snippetLang,
            })),
          },
        };
      }
    } catch (e) {
      return { result: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
    }
  }
  return { result: null, error: 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.' };
}

// ── Đề xuất câu hỏi GEO cho trang "Lượt AI trích dẫn" ──
// AI đọc nội dung bài viết + từ khóa → sinh các câu hỏi tự nhiên mà người dùng hỏi engine AI
// (ChatGPT/Perplexity/Gemini) mà bài viết này XỨNG ĐÁNG được trích dẫn.
const GeoQuestionsSchema = z.object({ questions: z.array(z.string().max(300)).max(12) });

export async function suggestGeoQuestions(input: {
  title?: string;
  keyword?: string;
  content: string;
  locale: Locale;
  override?: AiOverride;
  // Dữ liệu THẬT từ Google SERP (DataForSEO): câu hỏi "People Also Ask" + cụm từ liên quan.
  realQuestions?: string[];
  relatedTerms?: string[];
}): Promise<{ questions: string[] | null; error?: string }> {
  const content = input.content.replace(/\s+\n/g, '\n').trim().slice(0, 10000);
  if (!content) return { questions: null, error: 'Bài viết không có đủ nội dung văn bản để phân tích.' };
  const realBlock =
    input.realQuestions && input.realQuestions.length
      ? `\nReal "People Also Ask" questions from Google for this topic (already in the search language):\n` +
        input.realQuestions.map((q) => `- ${q}`).join('\n') +
        `\nUse these as ground truth of real demand. You MAY keep the most relevant ones, but focus on ADDING complementary GEO questions that these do not already cover.\n`
      : '';
  const relatedBlock =
    input.relatedTerms && input.relatedTerms.length
      ? `\nRelated search terms from Google (topic hints, not questions):\n` +
        input.relatedTerms.map((r) => `- ${r}`).join('\n') +
        `\n`
      : '';
  const gp = await renderPrompt('geo_questions', {
    ma_ngon_ngu: input.locale,
    dong_tieu_de: input.title ? `Title: ${input.title}\n` : '',
    dong_tu_khoa: input.keyword ? `Main keyword: ${input.keyword}\n` : '',
    khoi_paa: realBlock,
    khoi_lien_quan: relatedBlock,
    noi_dung: content,
  });
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown, không giải thích.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        { system: gp.system, prompt: attempt === 0 ? gp.user : gp.user + STRICT, maxTokens: 1200, json: true },
        'writer',
        input.override,
      );
      if (!res) return { questions: null, error: 'Chưa có API key AI.' };
      const parsed = GeoQuestionsSchema.safeParse(extractJson(res.text));
      if (parsed.success) {
        const seen = new Set<string>();
        const questions = parsed.data.questions
          .map((q) => dedash(q).trim())
          .filter((q) => {
            const k = q.toLowerCase();
            if (!q || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        if (questions.length) return { questions };
      }
    } catch (e) {
      return { questions: null, error: humanizeAiError(e instanceof Error ? e.message : 'Lỗi gọi AI') };
    }
  }
  return { questions: null, error: 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.' };
}

// ── Suy ra tiêu đề + từ khóa từ "Yêu cầu của bạn" khi người dùng chưa nhập ──
// Cho phép "Viết bằng AI" chỉ với 1 đoạn yêu cầu (không bắt buộc nhập tiêu đề/từ khóa trước).
const BriefSchema = z.object({ title: z.string().max(200), keyword: z.string().max(120) });
export async function proposeBrief(input: {
  request: string;
  locale: Locale;
  override?: AiOverride;
}): Promise<{ title: string; keyword: string } | null> {
  const req = input.request.replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!req) return null;
  try {
    const bp = await renderPrompt('brief', { ma_ngon_ngu: input.locale, yeu_cau: req });
    const res = await complete(
      'analysis',
      { system: bp.system, prompt: bp.user, maxTokens: 300, json: true },
      'fast',
      input.override,
    );
    if (!res) return null;
    const parsed = BriefSchema.safeParse(extractJson(res.text));
    if (!parsed.success) return null;
    const title = dedash(parsed.data.title).trim();
    const keyword = dedash(parsed.data.keyword).trim();
    if (!title && !keyword) return null;
    return { title, keyword };
  } catch {
    return null;
  }
}

export { slugify };
