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

// ─── Khóa theo TÀI KHOẢN (đếm chỉ khi thất bại) ───
// Khác rateLimit (tăng đếm mỗi lần gọi): 3 hàm dưới tách "kiểm khóa" khỏi "ghi thất bại" để dùng
// cho lockout đăng nhập theo email - chỉ tăng khi SAI mật khẩu, đăng nhập đúng thì xóa bộ đếm.

// Kiểm bucket có đang bị KHÓA không (KHÔNG tăng đếm).
export function isLimited(key: string, limit: number): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return { limited: false, retryAfter: 0 };
  if (b.count >= limit) return { limited: true, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { limited: false, retryAfter: 0 };
}

// Ghi nhận 1 lần THẤT BẠI cho key (tăng đếm; tạo bucket + đặt cửa sổ nếu chưa có). Trả số lần đã đếm.
export function recordFailure(key: string, windowMs: number): number {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  b.count++;
  return b.count;
}

// Xóa bucket (vd đăng nhập THÀNH CÔNG → reset bộ đếm thất bại của tài khoản đó).
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

// Lấy IP client từ header proxy - fallback 'unknown'.
// CHỐNG SPOOF: KHÔNG lấy X-Forwarded-For[0] (client tự đặt được → giả IP để lách rate-limit).
// Ưu tiên X-Real-Ip do proxy TIN CẬY (Caddy/Nginx) đặt; nếu chỉ có XFF thì lấy phần tử CUỐI
// (hop do proxy gần nhất append) thay vì phần tử đầu.
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip');
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}
