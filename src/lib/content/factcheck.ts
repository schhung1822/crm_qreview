// Kiểm tra "sức khỏe" các link trích dẫn trong bài (link còn sống / chết / bị chặn). Server-only.
// Dùng safeFetch (chống SSRF) - KHÔNG tự fetch trực tiếp URL do model/nội dung sinh ra.
import { safeFetch } from '../security/safe-fetch';

export interface LinkCheck {
  url: string;
  ok: boolean; // true nếu phản hồi < 400
  status?: number; // mã HTTP (nếu có)
  error?: string; // lý do không kiểm được (timeout, SSRF, DNS...)
}

const MAX_URLS = 25; // chặn bài nhồi quá nhiều link → tốn thời gian/quota

// Rút các URL http(s) trong markdown. Bỏ qua placeholder ảnh và template {{...}} (utm sẽ thay khi đăng).
export function extractUrls(markdown: string): string[] {
  const re = /https?:\/\/[^\s)<>\]"']+/gi;
  const found = markdown.match(re) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let raw of found) {
    raw = raw.replace(/[.,;:]+$/, ''); // bỏ dấu câu dính cuối
    if (raw.includes('{{') || raw.includes('image-placeholder')) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

// Kiểm 1 URL: GET nhẹ qua safeFetch, không tải hết body. Trả trạng thái sống/chết.
async function checkOne(url: string): Promise<LinkCheck> {
  try {
    const res = await safeFetch(url, { method: 'GET', timeoutMs: 8000 });
    await res.body?.cancel().catch(() => {}); // không đọc body, giải phóng kết nối
    return { url, ok: res.status < 400, status: res.status };
  } catch (e) {
    return { url, ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// Kiểm tất cả URL trong bài (song song). Trả danh sách kết quả.
export async function checkArticleLinks(markdown: string): Promise<LinkCheck[]> {
  const urls = extractUrls(markdown);
  return Promise.all(urls.map(checkOne));
}
