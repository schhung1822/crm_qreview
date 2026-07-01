// Theo dõi lượng token AI đã dùng (in/out) theo provider + model. Lưu .data/ai-usage.json.
// Dùng để hiện bộ đếm + bảng chi phí dự kiến ở trang Tổng quan. Server-only.
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';

export interface UsageRow {
  provider: string;
  model: string;
  inTokens: number;
  outTokens: number;
  calls: number;
  images: number; // số ảnh đã tạo (model ảnh tính phí theo ảnh, có thể không có token)
}

type Store = Record<string, UsageRow>; // khóa: `${provider}::${model}`

// Chuỗi thời gian: theo NGÀY → theo provider::model → token/ảnh dùng trong ngày đó.
type SeriesRow = { provider: string; model: string; inTokens: number; outTokens: number; images: number };
type SeriesStore = Record<string, Record<string, SeriesRow>>; // date(YYYY-MM-DD) → key → row

const FILE = path.join(process.cwd(), '.data', 'ai-usage.json');
const SERIES_FILE = path.join(process.cwd(), '.data', 'ai-usage-series.json');
const keyOf = (provider: string, model: string) => `${provider}::${model}`;
const today = () => new Date().toISOString().slice(0, 10);

// Cộng dồn token (và số ảnh) cho 1 lần gọi. Bỏ qua nếu không có gì để ghi.
export async function recordUsage(
  provider: string,
  model: string,
  inTokens: number,
  outTokens: number,
  images = 0,
): Promise<void> {
  if (!model) return;
  const i = Math.max(0, Math.round(inTokens || 0));
  const o = Math.max(0, Math.round(outTokens || 0));
  const im = Math.max(0, Math.round(images || 0));
  if (i === 0 && o === 0 && im === 0) return;
  const k = keyOf(provider, model);
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    const row = cur[k] ?? { provider, model, inTokens: 0, outTokens: 0, calls: 0, images: 0 };
    row.inTokens += i;
    row.outTokens += o;
    row.images = (row.images ?? 0) + im;
    row.calls += 1;
    cur[k] = row;
    return [cur, undefined];
  });
  // Ghi thêm vào chuỗi thời gian theo ngày (cho biểu đồ token theo thời gian).
  const day = today();
  await mutateJson<SeriesStore, void>(SERIES_FILE, {}, (cur) => {
    const bucket = cur[day] ?? {};
    const row = bucket[k] ?? { provider, model, inTokens: 0, outTokens: 0, images: 0 };
    row.inTokens += i;
    row.outTokens += o;
    row.images += im;
    bucket[k] = row;
    cur[day] = bucket;
    return [cur, undefined];
  });
}

export interface SeriesDay {
  date: string;
  inTokens: number;
  outTokens: number;
  items: Array<{ provider: string; model: string; inTokens: number; outTokens: number }>;
}

const MAX_SERIES_DAYS = 366; // chặn mảng quá dài (toàn thời gian)

// Chuỗi token theo NGÀY (lấp đầy ngày trống = 0). Chọn khoảng bằng:
//  - { days }      → N ngày gần nhất
//  - { from, to }  → khoảng tự chọn (YYYY-MM-DD)
//  - { all: true } → từ ngày sớm nhất có dữ liệu tới hôm nay
export async function getUsageSeries(
  opts: { days?: number; from?: string; to?: string; all?: boolean } = { days: 7 },
): Promise<SeriesDay[]> {
  const store = await readJson<SeriesStore>(SERIES_FILE, {});
  const todayStr = new Date().toISOString().slice(0, 10);

  let from: string;
  let to: string = todayStr;
  if (opts.from && opts.to) {
    from = opts.from.slice(0, 10);
    to = opts.to.slice(0, 10);
  } else if (opts.all) {
    const keys = Object.keys(store).sort();
    from = keys.length ? keys[0] : todayStr;
  } else {
    const days = Math.max(1, opts.days ?? 7);
    from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  }
  if (from > to) [from, to] = [to, from];

  const out: SeriesDay[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < MAX_SERIES_DAYS) {
    const date = cursor.toISOString().slice(0, 10);
    const bucket = store[date] ?? {};
    const items = Object.values(bucket)
      .map((r) => ({ provider: r.provider, model: r.model, inTokens: r.inTokens, outTokens: r.outTokens }))
      .sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens));
    out.push({
      date,
      inTokens: items.reduce((s, r) => s + r.inTokens, 0),
      outTokens: items.reduce((s, r) => s + r.outTokens, 0),
      items,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return out;
}

export interface UsageReport {
  rows: UsageRow[];
  totals: { inTokens: number; outTokens: number; calls: number; images: number };
}

export async function getUsage(): Promise<UsageReport> {
  const store = await readJson<Store>(FILE, {});
  const rows = Object.values(store)
    .map((r) => ({ ...r, images: r.images ?? 0 }))
    .sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens));
  const totals = rows.reduce(
    (acc, r) => ({
      inTokens: acc.inTokens + r.inTokens,
      outTokens: acc.outTokens + r.outTokens,
      calls: acc.calls + r.calls,
      images: acc.images + r.images,
    }),
    { inTokens: 0, outTokens: 0, calls: 0, images: 0 },
  );
  return { rows, totals };
}

export async function resetUsage(): Promise<void> {
  await mutateJson<Store, void>(FILE, {}, () => [{}, undefined]);
  await mutateJson<SeriesStore, void>(SERIES_FILE, {}, () => [{}, undefined]);
}
