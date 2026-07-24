// Cấu hình bài viết (toàn cục, 1 bản) - lưu .data/article-config.json. Server-only.
// Hiện chứa: danh sách QUY TẮC THAY THẾ keyword/ký tự áp dụng khi AI viết/tối ưu bài.
import { applyReplacements, applyReplacementsCounted, type ReplaceRule } from '../content/replace';
import { mutateBizConfig, readBizConfig } from '../data/config-store';

export type { ReplaceRule };

// Cấu hình JSON-LD structured data chèn khi đăng (Article/FAQ/HowTo + Author/Organization).
export interface JsonLdConfig {
  enabled: boolean; // mặc định bật
  organizationName?: string; // publisher
  authorName?: string; // author mặc định
  logoUrl?: string; // logo tổ chức (http(s))
}

export interface ArticleConfig {
  replacements: ReplaceRule[];
  // Bật quy trình AI 2 bước (lập khung → viết) trong trình soạn thảo. Mặc định bật.
  pipelineEnabled: boolean;
  jsonLd: JsonLdConfig;
  // Trần token đầu ra khi AI viết/tối ưu/bản địa hóa bài. 0 = TỰ ĐỘNG (hệ thống tự tính
  // theo độ dài bài). >0 = trần cố định do người dùng đặt (kẹp trong [2000, 16000]).
  maxTokens: number;
  // Bắt buộc bài phải được người có quyền đăng PHÊ DUYỆT trước khi đăng lên CMS. Khi bật,
  // người KHÔNG phải chủ/quản trị chỉ đăng được bài đã có approved=true. Mặc định tắt.
  requireApproval: boolean;
  // Giọng thương hiệu (brand voice): tông giọng/thuật ngữ/điều cấm - nhét vào prompt AI khi
  // viết/tối ưu/bản địa hóa để nội dung đồng nhất giọng. Rỗng = không áp.
  brandVoice: string;
}

const NAME = 'article-config.json'; // CÔ LẬP THEO BIZ

// Chuẩn hóa trần token: <=0 → 0 (tự động); ngược lại kẹp [2000, 16000] để tránh giá trị vô lý.
export function normMaxTokens(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  if (n <= 0) return 0;
  return Math.min(16000, Math.max(2000, n));
}

function normJsonLd(j?: Partial<JsonLdConfig>): JsonLdConfig {
  return {
    enabled: j?.enabled !== false, // mặc định bật
    organizationName: j?.organizationName?.trim() || undefined,
    authorName: j?.authorName?.trim() || undefined,
    logoUrl: j?.logoUrl?.trim() || undefined,
  };
}

export async function getArticleConfig(): Promise<ArticleConfig> {
  const saved = await readBizConfig<Partial<ArticleConfig>>(NAME, {});
  return {
    replacements: Array.isArray(saved.replacements) ? saved.replacements : [],
    pipelineEnabled: saved.pipelineEnabled !== false, // mặc định true
    jsonLd: normJsonLd(saved.jsonLd),
    maxTokens: normMaxTokens(saved.maxTokens),
    requireApproval: saved.requireApproval === true, // mặc định tắt
    brandVoice: typeof saved.brandVoice === 'string' ? saved.brandVoice.slice(0, 4000) : '',
  };
}

export async function saveArticleConfig(patch: Partial<ArticleConfig>): Promise<ArticleConfig> {
  return mutateBizConfig<Partial<ArticleConfig>, ArticleConfig>(NAME, {}, (cur) => {
    const next: ArticleConfig = {
      replacements: patch.replacements ?? cur.replacements ?? [],
      pipelineEnabled: patch.pipelineEnabled ?? cur.pipelineEnabled ?? true,
      jsonLd: normJsonLd(patch.jsonLd ?? cur.jsonLd),
      maxTokens: normMaxTokens(patch.maxTokens ?? cur.maxTokens),
      requireApproval: patch.requireApproval ?? cur.requireApproval ?? false,
      brandVoice:
        (typeof patch.brandVoice === 'string' ? patch.brandVoice : cur.brandVoice ?? '').slice(
          0,
          4000,
        ),
    };
    return [next, next];
  });
}

// Danh sách quy tắc thay thế ĐẦY ĐỦ áp cho 1 bài — NGUỒN CHÂN LÝ DUY NHẤT.
// QUY TẮC BẮT BUỘC của sản phẩm: LUÔN chuyển dấu gạch dài (em-dash, U+2014) thành gạch
// ngang (-) trong mọi nội dung. Dùng escape U+2014 để chính mã nguồn cũng KHÔNG chứa ký tự
// em-dash. Quy tắc bắt buộc chạy trước, rồi tới quy tắc của người dùng.
export async function getReplaceRules(): Promise<ReplaceRule[]> {
  const { replacements } = await getArticleConfig();
  const emDash = String.fromCharCode(0x2014); // em-dash (U+2014) - không viết literal trong mã
  return [{ from: emDash, to: '-' }, ...replacements];
}

// Áp quy tắc thay thế lên các trường văn bản của 1 bài (KHÔNG đụng slug để khỏi vỡ URL).
export async function applyArticleRules<
  T extends { title?: string; metaDescription?: string; markdown?: string; tags?: string[] },
>(a: T): Promise<T> {
  const rules = await getReplaceRules();
  const f = (s?: string) => (s === undefined ? s : applyReplacements(s, rules));
  return {
    ...a,
    title: f(a.title),
    metaDescription: f(a.metaDescription),
    markdown: f(a.markdown),
    tags: a.tags?.map((t) => applyReplacements(t, rules)),
  };
}

// Như applyArticleRules nhưng trả kèm TỔNG số lần thay — dùng cho nút "Thay thế" thủ công
// ở trình soạn bài để báo cho người dùng đã thay bao nhiêu chỗ.
export async function applyArticleRulesCounted<
  T extends { title?: string; metaDescription?: string; markdown?: string; tags?: string[] },
>(a: T): Promise<{ result: T; count: number }> {
  const rules = await getReplaceRules();
  let count = 0;
  const f = (s?: string) => {
    if (s === undefined) return s;
    const r = applyReplacementsCounted(s, rules);
    count += r.count;
    return r.text;
  };
  const result = {
    ...a,
    title: f(a.title),
    metaDescription: f(a.metaDescription),
    markdown: f(a.markdown),
    tags: a.tags?.map((t) => {
      const r = applyReplacementsCounted(t, rules);
      count += r.count;
      return r.text;
    }),
  };
  return { result, count };
}
