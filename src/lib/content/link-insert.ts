// Chèn 1 link NGỮ CẢNH vào giữa nội dung HTML của bài viết: bọc lần xuất hiện ĐẦU TIÊN của cụm từ
// `phrase` (trong VĂN BẢN hiển thị, không phải trong thẻ/thuộc tính) bằng <a href="...">phrase</a>.
//
// AN TOÀN (bất biến):
//  - KHÔNG chèn vào bên trong <a> có sẵn (tránh link lồng link).
//  - KHÔNG chèn trong <script>/<style>/<code>/<pre> và trong tiêu đề <h1..h6> (giữ heading sạch).
//  - KHÔNG phá vỡ thẻ: chỉ thay trong đoạn văn bản, không đụng vào thuộc tính/URL.
//  - CHỈ chèn 1 lần / 1 cụm (link tự nhiên, không nhồi).
//  - Khớp không phân biệt hoa/thường, linh hoạt khoảng trắng, và theo BIÊN TỪ (không dính vào
//    giữa một từ dài hơn). Giữ nguyên hoa/thường của đoạn văn bản gốc.
//
// Trả { html, inserted }: inserted=false nếu không tìm được cụm từ hợp lệ (caller sẽ bỏ qua chiều đó).
import { safeUrl } from './utm';

const SKIP_TAGS = new Set([
  'a', 'script', 'style', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface InsertResult {
  html: string;
  inserted: boolean;
}

// href PHẢI đã kèm sẵn utm (caller dùng withUtm) — hàm này chỉ validate + escape + chèn.
export function insertContextualLink(html: string, phrase: string, href: string): InsertResult {
  const url = safeUrl(href);
  const trimmed = (phrase || '').replace(/\s+/g, ' ').trim();
  if (!html || !url || trimmed.length < 3) return { html, inserted: false };

  // Cụm từ: escape regex, cho phép khoảng trắng linh hoạt, khớp theo biên từ (Unicode → tiếng Việt).
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  let re: RegExp;
  try {
    re = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc})(?![\\p{L}\\p{N}])`, 'iu');
  } catch {
    return { html, inserted: false };
  }

  // Tách HTML thành mảng xen kẽ đoạn-thẻ và đoạn-văn-bản (giữ nguyên delimiter).
  const parts = html.split(/(<[^>]*>)/);
  const skipStack: string[] = [];
  let inserted = false;

  for (let i = 0; i < parts.length && !inserted; i++) {
    const seg = parts[i];
    if (!seg) continue;

    if (seg[0] === '<') {
      const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(seg);
      if (m) {
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const selfClosing = /\/>\s*$/.test(seg) || tag === 'br' || tag === 'img' || tag === 'hr';
        if (SKIP_TAGS.has(tag) && !selfClosing) {
          if (closing) {
            const idx = skipStack.lastIndexOf(tag);
            if (idx >= 0) skipStack.splice(idx, 1);
          } else {
            skipStack.push(tag);
          }
        }
      }
      continue;
    }

    // Đoạn văn bản: bỏ qua nếu đang trong vùng cấm (a/heading/script...).
    if (skipStack.length) continue;
    const mm = re.exec(seg);
    if (!mm) continue;
    const lead = mm[1];
    const matched = mm[2];
    const start = mm.index + lead.length;
    const anchor = `<a href="${escapeAttr(url)}">${matched}</a>`;
    parts[i] = seg.slice(0, start) + anchor + seg.slice(start + matched.length);
    inserted = true;
  }

  return { html: parts.join(''), inserted };
}
