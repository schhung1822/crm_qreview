// Helper gắn utm_source vào URL cho internal link & backlink. Rút CHUNG (trước đây lặp trong
// api/optimize/interlink/route.ts và lib/publish/run.ts) để tính năng backlink dùng lại đồng nhất.

// utm_source từ baseUrl của site: bỏ scheme + "www.", slugify host → dùng làm utm_source=<site>.
// Nhờ đó click từ site A sang site B đo được nguồn "site A" trong analytics.
export function utmHost(baseUrl: string): string {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
  return host
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}

// Nối utm_source vào URL (KHÔNG nhân đôi nếu đã có). site rỗng → giữ nguyên URL.
export function withUtm(url: string, site: string): string {
  if (!site) return url;
  if (/[?&]utm_source=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + `utm_source=${site}`;
}

// Chỉ chấp nhận URL http/https hợp lệ → chặn javascript:/data: và URL rác khi chèn vào HTML bài
// trên CMS. Trả URL đã chuẩn hóa hoặc null nếu không hợp lệ.
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
