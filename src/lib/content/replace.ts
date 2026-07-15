// Áp dụng các QUY TẮC THAY THẾ do người dùng cấu hình lên văn bản bài viết.
// Ví dụ: "-" → "-", hoặc "ai" → "AI" (bật "cả từ" để không đụng "available").
export interface ReplaceRule {
  from: string;
  to: string;
  wholeWord?: boolean; // chỉ thay khi đứng độc lập (ranh giới từ)
  caseSensitive?: boolean; // phân biệt hoa/thường
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Thay thế tuần tự theo từng quy tắc, KÈM số lần thay. `to` chèn NGUYÊN VĂN (không hiểu $1, $&…).
export function applyReplacementsCounted(
  text: string,
  rules: ReplaceRule[],
): { text: string; count: number } {
  if (!text || !rules.length) return { text, count: 0 };
  let out = text;
  let count = 0;
  for (const r of rules) {
    if (!r.from) continue;
    const flags = (r.caseSensitive ? 'g' : 'gi') + 'u';
    const body = escapeRe(r.from);
    // wholeWord: bao quanh bằng ranh giới chữ/số (hỗ trợ Unicode).
    const pattern = r.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
    try {
      out = out.replace(new RegExp(pattern, flags), () => {
        count += 1;
        return r.to;
      });
    } catch {
      // Quy tắc lỗi (vd from rỗng sau escape) → bỏ qua, không làm hỏng bài.
    }
  }
  return { text: out, count };
}

// Thay thế và chỉ trả về văn bản (giữ nguyên chữ ký cũ cho các nơi không cần đếm).
export function applyReplacements(text: string, rules: ReplaceRule[]): string {
  return applyReplacementsCounted(text, rules).text;
}
