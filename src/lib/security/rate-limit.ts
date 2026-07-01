// Rate limit đơn giản trong bộ nhớ (cửa sổ trượt cố định) - chống lạm dụng đăng ký /
// brute-force đăng nhập. Đủ cho 1 instance; nhiều instance nên dùng Redis.
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

// Dọn định kỳ để map không phình mãi.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

// Trả { ok, retryAfter } - ok=false nếu vượt `limit` lần trong `windowMs`.
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true, retryAfter: 0 };
}

// Lấy IP client từ header proxy (Vercel/Nginx) - fallback 'unknown'.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
