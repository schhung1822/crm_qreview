import { describe, expect, it } from 'vitest';
import {
  clearRateLimit,
  clientIp,
  isLimited,
  rateLimit,
  recordFailure,
} from '@/lib/security/rate-limit';
import {
  readLockout,
  sharedClearRateLimit,
  sharedIsLimited,
  sharedRateLimit,
  sharedRecordFailure,
  stepClear,
  stepRateLimit,
  stepRecordFailure,
  sweepBuckets,
  type Buckets,
} from '@/lib/security/rate-limit-shared';

// ─────────────────────── rate-limit.ts (in-memory, có trạng thái) ───────────────────────
// Dùng key DUY NHẤT mỗi test vì các hàm chia sẻ một Map cấp module.
describe('rateLimit (in-memory)', () => {
  it('cho qua tới đúng limit rồi chặn, retryAfter > 0', () => {
    const k = `t:allow-then-block:${Math.random()}`;
    expect(rateLimit(k, 3, 60_000).ok).toBe(true); // 1
    expect(rateLimit(k, 3, 60_000).ok).toBe(true); // 2
    expect(rateLimit(k, 3, 60_000).ok).toBe(true); // 3
    const blocked = rateLimit(k, 3, 60_000); // 4 → chặn
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('cửa sổ hết hạn → đếm lại từ đầu', () => {
    const k = `t:window:${Math.random()}`;
    expect(rateLimit(k, 1, 1).ok).toBe(true); // mở cửa sổ 1ms
    expect(rateLimit(k, 1, 1).ok).toBe(false); // ngay lập tức: chặn
    // Sau khi cửa sổ 1ms trôi qua, phải cho qua lại.
    return new Promise<void>((res) => {
      setTimeout(() => {
        expect(rateLimit(k, 1, 60_000).ok).toBe(true);
        res();
      }, 5);
    });
  });
});

describe('lockout theo tài khoản (isLimited / recordFailure / clearRateLimit)', () => {
  it('chỉ khóa sau khi ĐỦ số lần recordFailure; clear thì mở lại', () => {
    const k = `t:lockout:${Math.random()}`;
    expect(isLimited(k, 3).limited).toBe(false); // chưa có lần sai nào
    recordFailure(k, 60_000); // 1
    recordFailure(k, 60_000); // 2
    expect(isLimited(k, 3).limited).toBe(false); // 2 < 3
    recordFailure(k, 60_000); // 3 → đạt ngưỡng
    expect(isLimited(k, 3).limited).toBe(true);
    clearRateLimit(k); // đăng nhập đúng
    expect(isLimited(k, 3).limited).toBe(false);
  });

  it('isLimited KHÔNG tăng đếm (không tự khóa vì kiểm nhiều lần)', () => {
    const k = `t:noincrement:${Math.random()}`;
    recordFailure(k, 60_000); // 1
    for (let i = 0; i < 10; i++) isLimited(k, 2);
    expect(isLimited(k, 2).limited).toBe(false); // vẫn chỉ 1 lần sai
    recordFailure(k, 60_000); // 2 → khóa
    expect(isLimited(k, 2).limited).toBe(true);
  });
});

describe('clientIp (chống spoof)', () => {
  const mk = (h: Record<string, string>) => new Request('https://x/', { headers: h });
  it('ưu tiên X-Real-Ip do proxy tin cậy đặt', () => {
    expect(clientIp(mk({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
  });
  it('không có X-Real-Ip → lấy hop CUỐI của XFF (không phải phần tử đầu client tự đặt)', () => {
    expect(clientIp(mk({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe('3.3.3.3');
  });
  it('không có header nào → "unknown"', () => {
    expect(clientIp(mk({}))).toBe('unknown');
  });
});

// ─────────────────────── rate-limit-shared.ts (reducer THUẦN, không cần DB) ───────────────────────
describe('reducer chia sẻ (thuần)', () => {
  const NOW = 1_000_000;

  it('stepRateLimit: đếm tới limit rồi chặn, cửa sổ hết hạn thì mở lại', () => {
    const s: Buckets = {};
    let r = stepRateLimit(s, 'k', 2, 10_000, NOW);
    expect(r[1].ok).toBe(true); // 1
    r = stepRateLimit(r[0], 'k', 2, 10_000, NOW);
    expect(r[1].ok).toBe(true); // 2
    r = stepRateLimit(r[0], 'k', 2, 10_000, NOW);
    expect(r[1].ok).toBe(false); // 3 → chặn
    expect(r[1].retryAfter).toBe(10); // 10_000ms → 10s
    // Sau khi cửa sổ trôi qua (now vượt resetAt) → cho qua lại.
    const later = stepRateLimit(r[0], 'k', 2, 10_000, NOW + 10_001);
    expect(later[1].ok).toBe(true);
  });

  it('readLockout: chỉ limited khi count >= limit và cửa sổ còn hiệu lực', () => {
    const s: Buckets = { k: { count: 5, resetAt: NOW + 5_000 } };
    expect(readLockout(s, 'k', 5, NOW).limited).toBe(true);
    expect(readLockout(s, 'k', 6, NOW).limited).toBe(false); // 5 < 6
    expect(readLockout(s, 'k', 5, NOW + 6_000).limited).toBe(false); // đã hết hạn
    expect(readLockout(s, 'missing', 1, NOW).limited).toBe(false);
  });

  it('stepRecordFailure: tăng đếm, mở cửa sổ mới nếu hết hạn', () => {
    let r = stepRecordFailure({}, 'k', 10_000, NOW);
    expect(r[1]).toBe(1);
    r = stepRecordFailure(r[0], 'k', 10_000, NOW);
    expect(r[1]).toBe(2);
    // cửa sổ cũ hết hạn → đếm lại về 1
    r = stepRecordFailure(r[0], 'k', 10_000, NOW + 10_001);
    expect(r[1]).toBe(1);
  });

  it('stepClear: xóa bucket của key', () => {
    const s: Buckets = { a: { count: 3, resetAt: NOW + 1 }, b: { count: 1, resetAt: NOW + 1 } };
    const out = stepClear(s, 'a');
    expect(out.a).toBeUndefined();
    expect(out.b).toBeDefined();
  });

  it('sweepBuckets: dọn key đã hết hạn, giữ key còn hạn', () => {
    const s: Buckets = {
      expired: { count: 9, resetAt: NOW - 1 },
      live: { count: 1, resetAt: NOW + 10_000 },
    };
    sweepBuckets(s, NOW);
    expect(s.expired).toBeUndefined();
    expect(s.live).toBeDefined();
  });
});

// ─── API async ở chế độ 1-instance (STORAGE_DRIVER != prisma → ủy quyền in-memory) ───
// Xác nhận wrapper async trả đúng shape và giữ nguyên ngữ nghĩa khóa brute-force (đường dùng thật
// của deploy 1-instance hiện tại; đường Postgres tái dùng mutateJson đã được test riêng).
describe('API async chia sẻ — chế độ file (delegate in-memory)', () => {
  it('sharedRateLimit: cho qua tới limit rồi 429', async () => {
    const k = `t:shared-rl:${Math.random()}`;
    expect((await sharedRateLimit(k, 2, 60_000)).ok).toBe(true);
    expect((await sharedRateLimit(k, 2, 60_000)).ok).toBe(true);
    expect((await sharedRateLimit(k, 2, 60_000)).ok).toBe(false);
  });

  it('sharedIsLimited/RecordFailure/Clear: vòng đời lockout tài khoản', async () => {
    const k = `t:shared-lock:${Math.random()}`;
    expect((await sharedIsLimited(k, 2)).limited).toBe(false);
    await sharedRecordFailure(k, 60_000);
    await sharedRecordFailure(k, 60_000);
    expect((await sharedIsLimited(k, 2)).limited).toBe(true);
    await sharedClearRateLimit(k);
    expect((await sharedIsLimited(k, 2)).limited).toBe(false);
  });
});
