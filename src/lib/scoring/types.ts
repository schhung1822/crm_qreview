// Kiểu dùng chung cho chấm điểm SEO & GEO. Xem docs/SEO-GEO-CHECKLIST.md.

export type CheckState = 'pass' | 'warn' | 'fail';

export interface ScoreCheck {
  id: string;
  label: string;
  weight: number;
  state: CheckState;
  detail?: string;
}

export interface ScoreResult {
  score: number; // 0-100
  checks: ScoreCheck[];
}

// Đầu vào tối thiểu để chấm điểm một bài.
export interface ArticleInput {
  title: string;
  metaDescription?: string;
  slug?: string;
  markdown: string;
  locale: string;
  targetKeyword?: string;
  secondaryKeywords?: string[];
  internalLinkCount?: number;
  hasFaqSchema?: boolean;
  inTranslationGroup?: boolean;
  // hreflang đã xác minh đối xứng? undefined = chưa rõ (mặc định coi như OK vì publish
  // tự sinh); false = caller biết thiếu/sai → cảnh báo.
  hreflangOk?: boolean;
}

// Dựng đầu vào chấm điểm THỐNG NHẤT từ nội dung bài.
// QUAN TRỌNG: mọi nơi (editor, quét bài cũ, sinh bài) đều phải dùng hàm này để
// điểm số khớp nhau - tránh tình trạng quét ra điểm A nhưng vào editor ra điểm B.
export function buildScoreInput(a: {
  title: string;
  metaDescription?: string;
  slug?: string;
  markdown: string;
  locale: string;
  targetKeyword?: string;
  inTranslationGroup?: boolean;
}): ArticleInput {
  return {
    title: a.title,
    metaDescription: a.metaDescription,
    slug: a.slug,
    markdown: a.markdown,
    locale: a.locale,
    targetKeyword: a.targetKeyword,
    internalLinkCount: countInternalLinks(a.markdown),
    hasFaqSchema: /(^|\n)#{2,3}\s*FAQ\b/i.test(a.markdown),
    inTranslationGroup: a.inTranslationGroup ?? false,
  };
}

// Bỏ dấu + thường hóa để SO KHỚP keyword NHẤT QUÁN giữa SEO/AEO (trước đây SEO khớp
// dấu, AEO bỏ dấu → cùng bài lệch điểm). Mọi module nên dùng chung hàm này.
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Đếm số lần keyword xuất hiện theo RANH GIỚI TỪ (Unicode) - tránh đếm "test" trong
// "testing"/"greatest". Cụm nhiều từ cho phép khoảng trắng linh hoạt. Đầu vào & keyword
// nên được fold() trước khi gọi.
export function countKeyword(text: string, kw: string): number {
  if (!kw) return 0;
  const pat = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  try {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${pat}(?![\\p{L}\\p{N}])`, 'giu');
    return (text.match(re) ?? []).length;
  } catch {
    return text.split(kw).length - 1; // fallback nếu môi trường không hỗ trợ \p{L}
  }
}

// Đếm internal link: link markdown [text](/path) hoặc (#anchor) - KHÔNG tính ảnh ![]().
function countInternalLinks(md: string): number {
  // Lookbehind (?<!!) để không tính ảnh ![](...) mà KHÔNG nuốt ký tự phía trước → 2 link
  // dán liền nhau [a](/x)[b](/y) vẫn đếm đủ 2.
  const matches = md.match(/(?<!!)\[[^\]]+\]\((\/[^)]*|#[^)]*)\)/g);
  return matches ? matches.length : 0;
}

// Quy đổi check → điểm 0-100 theo trọng số (pass=1, warn=0.5, fail=0).
export function computeScore(checks: ScoreCheck[]): ScoreResult {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = checks.reduce((s, c) => {
    const f = c.state === 'pass' ? 1 : c.state === 'warn' ? 0.5 : 0;
    return s + c.weight * f;
  }, 0);
  return { score: Math.round((earned / totalWeight) * 100), checks };
}
