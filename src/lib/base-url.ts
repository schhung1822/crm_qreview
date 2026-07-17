// Base URL CÔNG KHAI của app để dựng URL TUYỆT ĐỐI (redirect link chia sẻ, thẻ OG, link
// trong email, OAuth callback...). Thứ tự ưu tiên:
//   1. APP_URL (env) - nguồn đáng tin nhất, self-host NÊN đặt (vd https://demo.noti.vn).
//   2. X-Forwarded-Proto/Host - app chạy sau reverse-proxy (Caddy/Nginx đặt sẵn 2 header này);
//      thiếu bước này thì origin của request là địa chỉ bind nội bộ (vd 0.0.0.0:3000) → link sai.
//      (auth/current.ts cũng đã tin x-forwarded-host khi kiểm Origin - cùng mức tin cậy.)
//   3. Origin của chính request (chạy trực tiếp không qua proxy, vd npm run dev).
// Lưu ý chống Host-header injection: bảo vệ THẬT là đặt APP_URL; 2 fallback sau đều suy từ
// header request nên chỉ an toàn khi cổng app không phơi trực tiếp ra Internet (đúng kiến trúc
// self-host đã tài liệu: chỉ proxy 443 ra ngoài).
import { env } from './env';

export function requestBaseUrl(req: Request): string {
  if (env.appUrl) return env.appUrl;
  const xfh = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (xfh) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    return `${proto}://${xfh}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}
