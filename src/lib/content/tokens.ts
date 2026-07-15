// Token hóa tiêu đề/chuỗi để chấm ĐỘ LIÊN QUAN giữa các bài (VI + EN).
// DÙNG CHUNG cho server (api/optimize/graph) và client (optimize page) → hai bên KHÔNG lệch nhau
// khi tính link nội bộ gợi ý. Trước đây mỗi nơi tự khai báo STOP riêng và đã drift.

export const TITLE_STOP = new Set([
  'và', 'của', 'các', 'cho', 'khi', 'một', 'những', 'được', 'là', 'với', 'trong', 'về', 'có', 'để',
  'theo', 'như', 'này', 'đó', 'thì', 'từ', 'bài', 'cách', 'hướng', 'dẫn', 'top', 'tốt', 'nhất',
  '2024', '2025', '2026',
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'how', 'what', 'why',
  'best', 'guide', 'vs', 'your', 'you',
]);

export function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu (combining diacritics)
    .replace(/[^a-z0-9đ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TITLE_STOP.has(w));
}
