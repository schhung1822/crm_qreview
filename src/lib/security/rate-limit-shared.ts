// Rate-limit CHIA SẺ ĐA-INSTANCE cho các endpoint brute-force (đăng nhập / đặt lại mật khẩu / đăng
// ký / kích hoạt email). Vì sao tách khỏi rate-limit.ts (in-memory):
//   Bộ đếm in-memory chỉ đúng trong MỘT process. Chạy nhiều replica sau load-balancer thì kẻ tấn công
//   xoay vòng qua từng replica để nhân số lần thử lên ~N×limit → vô hiệu hóa khóa brute-force. Đây là
//   lỗ hổng mở rộng theo chiều ngang duy nhất còn lại (kho dữ liệu đã atomic đa-instance qua JsonBlob).
//
// CÁCH LÀM (không thêm hạ tầng/dependency — tái dùng đúng tầng Postgres đã có):
//   - STORAGE_DRIVER=prisma  → bộ đếm sống trong Postgres (JsonBlob) qua mutateJson (SELECT … FOR UPDATE
//     trong transaction ⇒ atomic đa-instance). MỌI replica chia sẻ CÙNG bộ đếm.
//   - STORAGE_DRIVER=file (1 instance, mặc định) → ỦY QUYỀN cho rate-limit.ts in-memory: hành vi và độ
//     trễ y HỆT bản cũ, KHÔNG thêm I/O. Deploy 1-instance hiện tại vì thế không đổi gì.
//
// CHỐNG NGHẼN: KHÔNG dồn mọi key vào 1 hàng — mỗi lần thử là 1 transaction FOR UPDATE; nếu chung 1 hàng
// thì toàn bộ auth bị serialize (chính lúc bị brute-force lại càng nghẽn). Băm key ra SHARDS hàng để
// giảm tranh chấp. Mỗi lần ghi tự dọn (sweep) key hết hạn để blob không phình vô hạn.
//
// Các endpoint throttle TÀI NGUYÊN (AI/scrape đắt) CỐ Ý giữ rate-limit.ts in-memory: mục tiêu ở đó là
// chặn quá tải THEO TỪNG instance (gần đúng là đủ), không phải khóa bảo mật — dùng DB chỉ thêm độ trễ.
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';
import {
  clearRateLimit as memClear,
  isLimited as memIsLimited,
  rateLimit as memRateLimit,
  recordFailure as memRecordFailure,
} from './rate-limit';

export interface Bucket {
  count: number;
  resetAt: number;
}
export type Buckets = Record<string, Bucket>;

// ─────────────────────── Bước logic THUẦN (export để test không cần DB) ───────────────────────
// Dọn key đã hết hạn (mutate tại chỗ) — giữ blob gọn.
export function sweepBuckets(store: Buckets, now: number): void {
  for (const k of Object.keys(store)) if (store[k].resetAt <= now) delete store[k];
}

// Rate-limit: đếm MỌI lần gọi. ok=false nếu đã đạt `limit` trong cửa sổ hiện tại.
export function stepRateLimit(
  store: Buckets,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): [Buckets, { ok: boolean; retryAfter: number }] {
  const b = store[key];
  if (!b || b.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return [store, { ok: true, retryAfter: 0 }];
  }
  if (b.count >= limit) {
    return [store, { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) }];
  }
  b.count++;
  return [store, { ok: true, retryAfter: 0 }];
}

// Kiểm khóa (KHÔNG tăng đếm) — cho lockout theo tài khoản.
export function readLockout(
  store: Buckets,
  key: string,
  limit: number,
  now: number,
): { limited: boolean; retryAfter: number } {
  const b = store[key];
  if (!b || b.resetAt <= now) return { limited: false, retryAfter: 0 };
  if (b.count >= limit) return { limited: true, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { limited: false, retryAfter: 0 };
}

// Ghi 1 lần THẤT BẠI (tăng đếm; mở cửa sổ nếu chưa có). Trả số lần đã đếm.
export function stepRecordFailure(
  store: Buckets,
  key: string,
  windowMs: number,
  now: number,
): [Buckets, number] {
  const b = store[key];
  if (!b || b.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return [store, 1];
  }
  b.count++;
  return [store, b.count];
}

// Xóa bucket của key (đăng nhập ĐÚNG → reset bộ đếm thất bại của tài khoản).
export function stepClear(store: Buckets, key: string): Buckets {
  delete store[key];
  return store;
}

// ─────────────────────── Chọn backend + băm shard ───────────────────────
const SHARDS = 8;

function isPrismaDriver(): boolean {
  return process.env.STORAGE_DRIVER === 'prisma';
}

// Băm FNV-1a (ổn định, không phụ thuộc runtime) → chọn 1 trong SHARDS hàng. Đường dẫn .data/security/…
// được json-store quy đổi thành JsonBlob(scope='_global', name='security/ratelimit-<n>.json').
function shardPath(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % SHARDS;
  return path.join(process.cwd(), '.data', 'security', `ratelimit-${idx}.json`);
}

// ─────────────────────── API async (song ánh với rate-limit.ts) ───────────────────────
export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  if (!isPrismaDriver()) return memRateLimit(key, limit, windowMs);
  return mutateJson<Buckets, { ok: boolean; retryAfter: number }>(shardPath(key), {}, (store) => {
    const now = Date.now();
    sweepBuckets(store, now);
    return stepRateLimit(store, key, limit, windowMs, now);
  });
}

export async function sharedIsLimited(
  key: string,
  limit: number,
): Promise<{ limited: boolean; retryAfter: number }> {
  if (!isPrismaDriver()) return memIsLimited(key, limit);
  // Chỉ ĐỌC → readJson (không mở transaction ghi) cho nhẹ.
  const store = await readJson<Buckets>(shardPath(key), {});
  return readLockout(store, key, limit, Date.now());
}

export async function sharedRecordFailure(key: string, windowMs: number): Promise<number> {
  if (!isPrismaDriver()) return memRecordFailure(key, windowMs);
  return mutateJson<Buckets, number>(shardPath(key), {}, (store) => {
    const now = Date.now();
    sweepBuckets(store, now);
    return stepRecordFailure(store, key, windowMs, now);
  });
}

export async function sharedClearRateLimit(key: string): Promise<void> {
  if (!isPrismaDriver()) return memClear(key);
  await mutateJson<Buckets, void>(shardPath(key), {}, (store) => [stepClear(store, key), undefined]);
}
