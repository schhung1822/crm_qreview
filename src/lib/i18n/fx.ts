// Tỷ giá USD → tiền tệ khác, lấy THẬT từ API công khai (open.er-api.com, không cần key),
// cache lại .data/fx-rates.json (làm mới sau 12h) để không gọi mạng mỗi lần. Server-only.
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../data/json-store';
import { safeFetch } from '../security/safe-fetch';

interface FxCache {
  rates: Record<string, number>; // 1 USD = rates[CODE] đơn vị
  asOf: string; // thời điểm tỷ giá (theo nhà cung cấp)
  fetchedAt: number; // epoch ms khi ta tải về
}

const FILE = path.join(process.cwd(), '.data', 'fx-rates.json');
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 giờ

export interface FxResult {
  rates: Record<string, number>;
  asOf: string;
  live: boolean; // true nếu là tỷ giá tải về (không phải fallback rỗng)
}

// Lấy tỷ giá hiện tại (ưu tiên cache còn mới; hết hạn → tải mới; lỗi mạng → dùng cache cũ).
export async function getUsdRates(): Promise<FxResult> {
  const cached = await readJson<FxCache | null>(FILE, null);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < MAX_AGE_MS && cached.rates?.USD) {
    return { rates: cached.rates, asOf: cached.asOf, live: true };
  }

  try {
    const res = await safeFetch('https://open.er-api.com/v6/latest/USD', {
      headers: { accept: 'application/json' },
      timeoutMs: 8000,
    });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (data.result === 'success' && data.rates && typeof data.rates.USD === 'number') {
      const fresh: FxCache = {
        rates: data.rates,
        asOf: data.time_last_update_utc ?? new Date(now).toISOString(),
        fetchedAt: now,
      };
      await writeJsonAtomic(FILE, fresh);
      return { rates: fresh.rates, asOf: fresh.asOf, live: true };
    }
    throw new Error('fx payload không hợp lệ');
  } catch {
    if (cached?.rates?.USD) {
      // Lỗi mạng nhưng còn cache cũ → vẫn dùng (tốt hơn không có).
      return { rates: cached.rates, asOf: cached.asOf, live: true };
    }
    return { rates: {}, asOf: '', live: false }; // không có tỷ giá → client dùng fallback tĩnh
  }
}
