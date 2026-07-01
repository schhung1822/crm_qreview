// Sinh & bản địa hóa nội dung. Có provider AI (key trong Settings/env) → gọi thật;
// không có → trả mock có cấu trúc. Provider chọn theo định tuyến task "writing".
import { z } from 'zod';
import type { Locale } from '../../i18n/config';
import { extractKeywordHeuristic } from '../content/keyword-extract';
import { generatePlanItems } from '../plan/generate';
import type { PlanItem } from '../store/plans';
import { extractJson } from './json';
import { complete, completeJson, type AiOverride } from './providers';
import {
  BLUEPRINT_SYSTEM,
  CONTENT_PLAN_SYSTEM,
  EXTRACT_KW_SYSTEM,
  GEO_LOCALIZE_SYSTEM,
  KEYWORD_RESEARCH_SYSTEM,
  OPTIMIZE_SYSTEM,
  RESEARCH_SYSTEM,
  WRITER_SYSTEM,
  blueprintPrompt,
  contentPlanPrompt,
  extractKeywordPrompt,
  keywordResearchPrompt,
  localizePrompt,
  optimizePrompt,
  researchPrompt,
  writeArticlePrompt,
} from './prompts';

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
      const r = await complete(
        'writing',
        {
          system: RESEARCH_SYSTEM,
          prompt: researchPrompt({
            title: input.title,
            targetKeyword: input.targetKeyword,
            locale: input.locale,
          }),
          maxTokens: 1200,
        },
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

  const basePrompt = writeArticlePrompt({
    ...input,
    secondaryKeywords,
    outline,
    internalLinks: input.internalLinks,
    research,
  });
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về một object JSON hợp lệ, bắt đầu bằng "{" và kết thúc bằng "}". TUYỆT ĐỐI không kèm markdown (```), không lời dẫn, không giải thích.';

  let error: string | undefined;
  // Thử tối đa 2 lần (lần 2 ép JSON thuần) để giảm lỗi parse khi đổi AI/model.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: WRITER_SYSTEM,
          prompt: attempt === 0 ? basePrompt : basePrompt + STRICT,
          maxTokens, // trần người dùng đặt, hoặc mặc định 16000 (provider tự hạ nếu vượt giới hạn model)
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) break; // không có key
      const val = extractJson(res.text);
      const parsed = GeneratedArticleSchema.safeParse(val);
      if (parsed.success) return { article: ensureFaqInMarkdown(parsed.data), usedAi: true };
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
  const auto = Math.min(16000, Math.max(8192, Math.round(estIn * 1.6)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);
  const raw = await completeJson<unknown>(
    'writing',
    {
      system: GEO_LOCALIZE_SYSTEM,
      prompt: localizePrompt(input),
      maxTokens,
    },
    'writer',
    input.override,
  );
  const parsed = LocalizedSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  return {
    title: `[${input.targetLocale}] ${input.sourceTitle}`,
    metaDescription: '',
    slug: slugify(input.sourceTitle),
    markdown: input.sourceMarkdown,
  };
}

// ─── Tối ưu/sửa bài có sẵn để tăng SEO + GEO ───
export const OptimizedSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  markdown: z.string(),
  tags: z.array(z.string()).default([]),
  changes: z
    .array(z.object({ field: z.string(), note: z.string() }))
    .default([]),
});
export type Optimized = z.infer<typeof OptimizedSchema>;

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
  const base = optimizePrompt(input);
  const STRICT = '\n\nQUAN TRỌNG: CHỈ trả về một object JSON hợp lệ (bắt đầu "{", kết thúc "}"), không markdown, không giải thích.';
  // Output ≈ độ dài bài (viết lại) → cấp trần token theo kích thước ĐẦU VÀO để bài dài không
  // bị cắt cụt khiến JSON hỏng. ~3 ký tự/token; ×1.6 dư cho phần bổ sung. Trần 16000 (provider
  // tự hạ nếu model không hỗ trợ). max_tokens là TRẦN, tính tiền theo token thực → rộng không phí.
  const estIn = Math.ceil(((input.markdown?.length ?? 0) + (input.title?.length ?? 0)) / 3);
  const auto = Math.min(16000, Math.max(8192, Math.round(estIn * 1.6)));
  const maxTokens = resolveMaxTokens(input.maxTokens, auto);
  let error = 'AI trả về không đúng định dạng. Thử lại hoặc đổi model.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        {
          system: OPTIMIZE_SYSTEM,
          prompt: attempt === 0 ? base : base + STRICT,
          maxTokens,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return { result: null, error: 'Chưa có API key AI.' };
      const val = extractJson(res.text);
      const parsed = OptimizedSchema.safeParse(val);
      if (parsed.success) return { result: parsed.data };
      // Ghi rõ LÝ DO hỏng để chẩn đoán (rỗng? không có JSON? thiếu field? cắt cụt?).
      logAiParseFail('optimizeArticle', attempt, res, val, parsed);
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Lỗi gọi AI' };
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
  const raw = await completeJson<Record<string, unknown>>(
    'analysis',
    {
      system:
        'Bạn viết MÔ TẢ NGẮN (tối đa ~120 ký tự) cho từng bài viết để đưa vào llms.txt: súc tích, đúng nội dung, ' +
        'KHÔNG sáo rỗng/marketing, KHÔNG bịa. Trả về DUY NHẤT JSON dạng {"<id>":"<mô tả>"}.',
      prompt: `Viết mô tả bằng đúng ngôn ngữ có mã "${locale}". Mỗi bài 1 câu mô tả theo đúng id:\n${list}\n\nCHỈ trả JSON {id: mô tả}.`,
      maxTokens: 2200,
    },
    'fast',
    override,
  );
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
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
  const res = await complete(
    'analysis',
    {
      system:
        'Bạn là chuyên gia SEO/AEO/GEO kỹ thuật. Viết HƯỚNG DẪN KHẮC PHỤC chi tiết, từng bước, ' +
        'cụ thể và khả thi cho ĐÚNG MỘT vấn đề audit website. Dùng Markdown: các bước đánh số; ' +
        'kèm ví dụ code/thẻ trong khối ``` khi phù hợp; nêu cách làm trên WordPress và Wix nếu liên quan. ' +
        'Ngắn gọn (≤ ~250 từ), không lan man, KHÔNG bịa số liệu hay nguồn.',
      prompt:
        `Ngôn ngữ trả lời: dùng đúng ngôn ngữ có mã "${input.locale}".\n` +
        `Website: ${input.url}\n` +
        `Nhóm: ${input.group}\n` +
        `Vấn đề cần khắc phục: ${input.label}\n` +
        (input.value ? `Dữ liệu phát hiện: ${input.value}\n` : '') +
        (input.shortFix ? `Gợi ý ngắn hiện có: ${input.shortFix}\n` : '') +
        `\nHãy viết hướng dẫn khắc phục chi tiết, theo từng bước, cho đúng vấn đề trên.`,
      maxTokens: 1100,
    },
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
  const raw = await completeJson<unknown>(
    'analysis',
    {
      system: EXTRACT_KW_SYSTEM,
      prompt: extractKeywordPrompt(input),
      maxTokens: 64,
    },
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
  const base = contentPlanPrompt({ seed: input.seed, locale: input.locale, keywords: input.keywords });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';

  let error: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'writing',
        { system: CONTENT_PLAN_SYSTEM, prompt: attempt === 0 ? base : base + STRICT, maxTokens: 2048, json: true },
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
const IMAGE_SCENE_SYSTEM = `You are an art director for blog hero images. Read the article and describe,
in ONE concise English sentence, a CONCRETE visual scene/subject that ACCURATELY represents the
article's main topic - real objects, setting, or a clear visual metaphor grounded in the content.
Do NOT include any text/words/letters/UI in the scene. Output ONLY the description, nothing else.`;

// Trả mô tả cảnh (tiếng Anh, ngắn) hoặc null nếu không có key/không gọi được.
export async function describeImageScene(input: {
  title: string;
  content?: string;
  override?: AiOverride;
}): Promise<string | null> {
  const body = (input.content ?? '').slice(0, 2000);
  if (!input.title && !body) return null;
  try {
    const res = await complete(
      'analysis',
      {
        system: IMAGE_SCENE_SYSTEM,
        prompt: `Article title: ${input.title}\n\nArticle content (excerpt):\n"""\n${body}\n"""\n\nDescribe the cover scene:`,
        maxTokens: 120,
      },
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

// ─── Gợi ý internal link theo NỘI DUNG (AI đọc bài, không chỉ so từ khóa tiêu đề) ───
const RELATED_LINK_SYSTEM = `You are an internal-linking strategist for a content website.
You receive a numbered list of articles (index, title, content excerpt). Find pairs where the SOURCE
article should add an internal link to the TARGET article because their CONTENT is genuinely topically
related and a reader of the source would benefit from the target. Judge relatedness from the actual
topic/content, NOT merely from words shared in the titles. For each source pick AT MOST 3 strongest
targets and skip weak or generic matches. Reply with JSON only.`;

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
  const prompt =
    `Ngôn ngữ nội dung: ${input.locale}. Danh sách bài viết (index, tiêu đề, trích nội dung):\n\n${list}\n\n` +
    `Dựa trên NỘI DUNG (không chỉ từ trùng ở tiêu đề), trả về JSON: ` +
    `{"pairs":[{"from":<index>,"to":<index>,"reason":"<lý do ngắn, cùng ngôn ngữ với bài>"}]}. ` +
    `Mỗi bài nguồn tối đa 3 cặp. CHỈ JSON, không markdown, không giải thích ngoài JSON.`;
  // Thử 2 lần (lần 2 ép JSON thuần) để giảm lỗi parse khi đổi model.
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: RELATED_LINK_SYSTEM,
          prompt: attempt === 0 ? prompt : prompt + STRICT,
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
  const base = keywordResearchPrompt({ seed: input.seed, locale: input.locale });
  const STRICT = '\n\nCHỈ trả về JSON hợp lệ (bắt đầu "{"), không markdown/giải thích.';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await complete(
        'analysis',
        {
          system: KEYWORD_RESEARCH_SYSTEM,
          prompt: attempt === 0 ? base : base + STRICT,
          maxTokens: 2048,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return null; // không có key
      const parsed = KeywordIdeasSchema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
    } catch {
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
  const base = blueprintPrompt({
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
          system: BLUEPRINT_SYSTEM,
          prompt: attempt === 0 ? base : base + STRICT,
          maxTokens: 1500,
          json: true,
        },
        'writer',
        input.override,
      );
      if (!res) return null;
      const parsed = BlueprintSchema.safeParse(extractJson(res.text));
      if (parsed.success) return parsed.data;
    } catch {
      return null;
    }
  }
  return null;
}

export { slugify };
