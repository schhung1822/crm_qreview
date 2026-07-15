// Tự điền alt (văn bản thay thế) cho ảnh còn THIẾU alt — phục vụ trợ năng (screen reader)
// và SEO. Thuần logic, KHÔNG gọi AI, KHÔNG tốn token → chạy tức thì.
//
// Suy ra alt theo thứ tự ưu tiên:
//   1) Tên file ảnh nếu có nghĩa (vd "ca-phe-sua-da.jpg" → "Ca phe sua da")
//   2) Tiêu đề mục (#..######) gần nhất phía trên ảnh
//   3) Từ khóa mục tiêu → tiêu đề bài → "Hình minh họa"
//
// Có 2 bản: cho Markdown (trong trình soạn) và cho HTML (chốt chặn khi đăng CMS).

export interface AltContext {
  title?: string;
  keyword?: string;
}

// Token vô nghĩa hay xuất hiện trong tên file ảnh (máy ảnh, ảnh sinh tự động…) → bỏ đi.
const NOISE =
  /\b(img|image|images|photo|photos|pic|pics|picture|generated|gen|download|downloaded|untitled|screenshot|screen[-_ ]?shot|dsc|dscf|scaled|final|copy|edited|export|output|file|upload|uploaded|\d{6,})\b/gi;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Chuẩn hóa 1 chuỗi alt: bỏ ký tự phá cú pháp markdown/HTML, gọn khoảng trắng, giới hạn độ dài.
function normalizeAlt(s: string): string {
  const out = clean(
    s
      .replace(/[[\]<>"'`]/g, ' ') // ] phá ![](), < > " ' phá thuộc tính HTML
      .replace(/[|]/g, ' '),
  );
  return out.length > 120 ? clean(out.slice(0, 120)) : out;
}

// Nguyên âm (gồm cả tiếng Việt có dấu) → dùng để nhận diện "từ thật" vs mảnh hash.
const VOWEL = /[aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

// Suy alt từ tên file trong URL. Trả '' nếu tên file không có nghĩa (hash/uuid/toàn số).
// "Có nghĩa" = còn ít nhất 1 token ≥3 ký tự và chứa nguyên âm (loại "9f8c2a1b…" → f c a b …).
export function altFromFilename(src: string): string {
  try {
    const noQuery = src.split(/[?#]/)[0];
    const seg = noQuery.split('/').filter(Boolean).pop() ?? '';
    const base = decodeURIComponent(seg).replace(/\.[a-z0-9]{1,5}$/i, ''); // bỏ đuôi mở rộng
    const stripped = clean(clean(base.replace(/[-_+.%0-9]+/g, ' ')).replace(NOISE, ' '));
    const tokens = stripped.split(' ').filter(Boolean);
    if (!tokens.some((w) => w.length >= 3 && VOWEL.test(w))) return '';
    const words = tokens.filter((w) => w.length >= 2).join(' '); // bỏ mảnh 1 ký tự lẻ
    if (!words) return '';
    return normalizeAlt(words.charAt(0).toUpperCase() + words.slice(1));
  } catch {
    return '';
  }
}

// Tiêu đề mục Markdown (#..) gần nhất TRƯỚC vị trí offset.
function lastMarkdownHeading(md: string, offset: number): string {
  const prefix = md.slice(0, offset);
  const all = [...prefix.matchAll(/^#{1,6}\s+(.+)$/gm)];
  if (!all.length) return '';
  return normalizeAlt(all[all.length - 1][1].replace(/[#*`_~]/g, ' '));
}

// Tiêu đề <h1..h6> gần nhất TRƯỚC vị trí offset (bản HTML).
function lastHtmlHeading(html: string, offset: number): string {
  const prefix = html.slice(0, offset);
  const all = [...prefix.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  if (!all.length) return '';
  return normalizeAlt(all[all.length - 1][1].replace(/<[^>]+>/g, ' '));
}

function fallbackAlt(ctx: AltContext): string {
  return (
    normalizeAlt(ctx.keyword ?? '') ||
    normalizeAlt(ctx.title ?? '') ||
    'Hình minh họa'
  );
}

// ─── Markdown: điền alt cho ảnh ![](url) rỗng/chỉ khoảng trắng ───
export function fillMissingAltMarkdown(
  markdown: string,
  ctx: AltContext = {},
): { markdown: string; fixed: number } {
  let fixed = 0;
  // Chỉ khớp alt RỖNG hoặc toàn khoảng trắng: ![](url) hoặc ![   ](url). Ảnh đã có alt → bỏ qua.
  const re = /!\[[ \t]*\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
  const out = markdown.replace(re, (match, src: string, titlePart: string | undefined, offset: number) => {
    const alt =
      altFromFilename(src) || lastMarkdownHeading(markdown, offset) || fallbackAlt(ctx);
    if (!alt) return match;
    fixed++;
    return `![${alt}](${src}${titlePart ?? ''})`;
  });
  return { markdown: out, fixed };
}

// Đếm số ảnh markdown còn thiếu alt (không sửa).
export function countMissingAltMarkdown(markdown: string): number {
  return (markdown.match(/!\[[ \t]*\]\([^)\s]+(\s+"[^"]*")?\)/g) ?? []).length;
}

// ─── HTML: điền alt cho <img> thiếu alt hoặc alt="" (chốt chặn khi đăng lên CMS) ───
export function fillMissingAltHtml(
  html: string,
  ctx: AltContext = {},
): { html: string; fixed: number } {
  let fixed = 0;
  const out = html.replace(/<img\b[^>]*>/gi, (tag, offset: number) => {
    const altMatch = tag.match(/\balt\s*=\s*(["'])([\s\S]*?)\1/i);
    if (altMatch && altMatch[2].trim()) return tag; // đã có alt có nghĩa → giữ nguyên
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
    const src = srcMatch ? srcMatch[2] : '';
    const alt = altFromFilename(src) || lastHtmlHeading(html, offset) || fallbackAlt(ctx);
    if (!alt) return tag;
    const safeAlt = alt.replace(/"/g, '&quot;');
    fixed++;
    if (altMatch) {
      // alt="" rỗng → thay bằng alt có nội dung.
      return tag.replace(altMatch[0], `alt="${safeAlt}"`);
    }
    // Chưa có thuộc tính alt → chèn ngay sau <img.
    return tag.replace(/^<img\b/i, `<img alt="${safeAlt}"`);
  });
  return { html: out, fixed };
}
