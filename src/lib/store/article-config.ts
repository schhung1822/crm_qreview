// Cấu hình bài viết (toàn cục, 1 bản) - lưu .data/article-config.json. Server-only.
// Hiện chứa: danh sách QUY TẮC THAY THẾ keyword/ký tự áp dụng khi AI viết/tối ưu bài.
import path from 'node:path';
import { applyReplacements, type ReplaceRule } from '../content/replace';
import { mutateJson, readJson } from '../data/json-store';

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
}

export const DEFAULT_ARTICLE_CONFIG: ArticleConfig = {
  replacements: [],
  pipelineEnabled: true,
  jsonLd: { enabled: true },
  maxTokens: 0,
};

const FILE = path.join(process.cwd(), '.data', 'article-config.json');

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
  const saved = await readJson<Partial<ArticleConfig>>(FILE, {});
  return {
    replacements: Array.isArray(saved.replacements) ? saved.replacements : [],
    pipelineEnabled: saved.pipelineEnabled !== false, // mặc định true
    jsonLd: normJsonLd(saved.jsonLd),
    maxTokens: normMaxTokens(saved.maxTokens),
  };
}

export async function saveArticleConfig(patch: Partial<ArticleConfig>): Promise<ArticleConfig> {
  return mutateJson<Partial<ArticleConfig>, ArticleConfig>(FILE, {}, (cur) => {
    const next: ArticleConfig = {
      replacements: patch.replacements ?? cur.replacements ?? [],
      pipelineEnabled: patch.pipelineEnabled ?? cur.pipelineEnabled ?? true,
      jsonLd: normJsonLd(patch.jsonLd ?? cur.jsonLd),
      maxTokens: normMaxTokens(patch.maxTokens ?? cur.maxTokens),
    };
    return [next, next];
  });
}

// Áp quy tắc thay thế lên các trường văn bản của 1 bài (KHÔNG đụng slug để khỏi vỡ URL).
export async function applyArticleRules<
  T extends { title?: string; metaDescription?: string; markdown?: string; tags?: string[] },
>(a: T): Promise<T> {
  const { replacements } = await getArticleConfig();
  // QUY TẮC BẮT BUỘC của sản phẩm: LUÔN chuyển dấu gạch dài (em-dash, U+2014) thành gạch
  // ngang (-) trong mọi nội dung AI sinh ra. Dùng escape U+2014 để chính mã nguồn cũng
  // KHÔNG chứa ký tự em-dash. Quy tắc bắt buộc chạy trước, rồi tới quy tắc của người dùng.
  const emDash = String.fromCharCode(0x2014); // em-dash (U+2014) - không viết literal trong mã
  const rules: ReplaceRule[] = [{ from: emDash, to: '-' }, ...replacements];
  const f = (s?: string) => (s === undefined ? s : applyReplacements(s, rules));
  return {
    ...a,
    title: f(a.title),
    metaDescription: f(a.metaDescription),
    markdown: f(a.markdown),
    tags: a.tags?.map((t) => applyReplacements(t, rules)),
  };
}
