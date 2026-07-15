// Theo dõi lượng token AI đã dùng (in/out) theo provider + model. Lưu .data/ai-usage.json.
// Dùng để hiện bộ đếm + bảng chi phí dự kiến ở trang Tổng quan. Server-only.
import { SESSION_COOKIE, getSessionUserId } from '../auth/session';
import { bizContext } from '../biz/context';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { rowCostUsd } from './pricing';

// Ai đang gọi AI (để quy token theo nhân viên). Ưu tiên ngữ cảnh biz (đặt bằng runWithBiz - đáng
// tin cậy, dùng ở worker/API token). Nếu không có (route tương tác dùng enterWith - ALS không
// chắc chắn xuyên await) thì tra từ session cookie. Ngoài request (test/cron) → 'unknown'.
async function currentActorId(): Promise<string> {
  const fromCtx = bizContext.getStore()?.userId;
  if (fromCtx) return fromCtx;
  try {
    const { cookies } = await import('next/headers');
    const uid = await getSessionUserId(cookies().get(SESSION_COOKIE)?.value);
    if (uid) return uid;
  } catch {
    /* không ở trong request context */
  }
  return 'unknown';
}

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

const NAME = 'ai-usage.json'; // CÔ LẬP THEO BIZ
const SERIES_NAME = 'ai-usage-series.json';
const BYUSER_NAME = 'ai-usage-by-user.json'; // token theo từng nhân viên (userId → tổng)
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
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
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
  await mutateJson<SeriesStore, void>(bizFile(SERIES_NAME), {}, (cur) => {
    const bucket = cur[day] ?? {};
    const row = bucket[k] ?? { provider, model, inTokens: 0, outTokens: 0, images: 0 };
    row.inTokens += i;
    row.outTokens += o;
    row.images += im;
    bucket[k] = row;
    cur[day] = bucket;
    return [cur, undefined];
  });
  // Ghi thêm theo NHÂN VIÊN (quy token cho người gọi) - lưu THEO provider::model để tính được
  // chi phí chính xác (mỗi model 1 đơn giá). Dùng cho báo cáo token + chi phí theo staff.
  const actor = await currentActorId();
  await mutateJson<UserStore, void>(bizFile(BYUSER_NAME), {}, (cur) => {
    const bucket = cur[actor] ?? {};
    const row = bucket[k] ?? { provider, model, inTokens: 0, outTokens: 0, calls: 0, images: 0 };
    row.inTokens += i;
    row.outTokens += o;
    row.images = (row.images ?? 0) + im;
    row.calls += 1;
    bucket[k] = row;
    cur[actor] = bucket;
    return [cur, undefined];
  });
}

type UserStore = Record<string, Record<string, UsageRow>>; // userId → (provider::model → row)

export interface UserUsage {
  userId: string;
  inTokens: number;
  outTokens: number;
  calls: number;
  images: number;
  costUsd: number | null; // null nếu không có model nào tính được giá
}

// Tổng token + chi phí (USD) theo từng nhân viên (chưa gắn tên - route sẽ tra tên từ userId).
export async function getUsageByUser(): Promise<UserUsage[]> {
  const store = await readJson<UserStore>(bizFile(BYUSER_NAME), {});
  const out: UserUsage[] = [];
  for (const [userId, bucket] of Object.entries(store)) {
    let inT = 0;
    let outT = 0;
    let calls = 0;
    let images = 0;
    let cost = 0;
    let anyCost = false;
    for (const r of Object.values(bucket)) {
      inT += r.inTokens;
      outT += r.outTokens;
      calls += r.calls;
      images += r.images ?? 0;
      const c = rowCostUsd(r.provider, r.model, r.inTokens, r.outTokens, r.images ?? 0);
      if (c != null) {
        cost += c;
        anyCost = true;
      }
    }
    out.push({ userId, inTokens: inT, outTokens: outT, calls, images, costUsd: anyCost ? cost : null });
  }
  return out.sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens));
}

// Tổng token (in+out) đã dùng trong THÁNG DƯƠNG LỊCH hiện tại - dùng để kiểm hạn mức.
export async function getMonthlyTokens(): Promise<number> {
  const now = new Date();
  const from = `${now.toISOString().slice(0, 7)}-01`; // YYYY-MM-01
  const to = now.toISOString().slice(0, 10);
  const days = await getUsageSeries({ from, to });
  return days.reduce((s, d) => s + d.inTokens + d.outTokens, 0);
}

// Như getMonthlyTokens nhưng cho MỘT biz cụ thể (chạy trong ngữ cảnh biz đó - dùng .run đáng tin
// cậy). Phục vụ tính quota GỘP theo tài khoản chủ trên nhiều biz.
export async function getMonthlyTokensForBiz(bizId: string): Promise<number> {
  return bizContext.run({ userId: '', bizId }, () => getMonthlyTokens());
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
  const store = await readJson<SeriesStore>(bizFile(SERIES_NAME), {});
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
  const store = await readJson<Store>(bizFile(NAME), {});
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
  await mutateJson<Store, void>(bizFile(NAME), {}, () => [{}, undefined]);
  await mutateJson<SeriesStore, void>(bizFile(SERIES_NAME), {}, () => [{}, undefined]);
  await mutateJson<UserStore, void>(bizFile(BYUSER_NAME), {}, () => [{}, undefined]);
}
