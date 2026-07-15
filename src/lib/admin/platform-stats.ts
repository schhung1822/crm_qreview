// Tổng hợp SỐ LIỆU NỀN TẢNG cho tab Tổng quan (superadmin). Gộp AI usage xuyên biz + đơn hàng +
// gói + tài khoản + email. Server-only. Đọc-thuần (không ghi).
import { bizContext } from '../biz/context';
import { listUsers } from '../auth/users';
import { listOrders, type Order } from '../billing/orders';
import { PLAN_ORDER, type PlanId } from '../billing/plans';
import { listSubscriptions } from '../billing/subscription';
import { getUsage, getUsageByUser, getUsageSeries } from '../ai/usage';
import { rowCostUsd } from '../ai/pricing';
import { listAllBizes } from '../store/biz';
import { getEmailStatsRaw } from '../store/email-stats';

const DAY = 86_400_000;
const MAX_RANGE = 366;

function dateList(days: number): string[] {
  const n = Math.max(1, Math.min(days, MAX_RANGE));
  const start = Date.now() - (n - 1) * DAY;
  return Array.from({ length: n }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
}

// Danh sách ngày (YYYY-MM-DD) theo khoảng: from/to tùy chỉnh HOẶC N ngày gần nhất. Chặn tối đa 366.
function computeDates(opts: { days?: number; from?: string; to?: string }): string[] {
  if (opts.from && opts.to) {
    let from = opts.from.slice(0, 10);
    let to = opts.to.slice(0, 10);
    if (from > to) [from, to] = [to, from];
    const out: string[] = [];
    const cur = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    let g = 0;
    while (cur.getTime() <= end.getTime() && g < MAX_RANGE) {
      out.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
      g++;
    }
    if (out.length) return out;
  }
  return dateList(opts.days ?? 30);
}

export interface PlatformOverview {
  accounts: { totalUsers: number; activeUsers: number; suspendedUsers: number; totalBiz: number; suspendedBiz: number };
  ai: {
    totals: { inTokens: number; outTokens: number; calls: number; images: number; costUsd: number };
    byProvider: Array<{ provider: string; inTokens: number; outTokens: number; costUsd: number }>;
    byModel: Array<{ provider: string; model: string; inTokens: number; outTokens: number; costUsd: number }>;
    topUsers: Array<{ userId: string; name: string; email: string; inTokens: number; outTokens: number; costUsd: number }>;
    series: Array<{ date: string; inTokens: number; outTokens: number }>;
  };
  orders: {
    byStatus: Record<string, number>;
    total: number;
    revenueVndPaid: number;
    // Theo NGÀY: tổng + tách theo từng trạng thái (cho biểu đồ đường đủ trạng thái).
    series: Array<{ date: string; count: number; pending: number; paid: number; canceled: number; refunded: number; revenueVnd: number }>;
  };
  subscriptions: { byPlan: Record<string, number>; byStatus: Record<string, number> };
  email: { total: number; byEvent: Record<string, number>; series: Array<{ date: string; count: number }> };
  rangeDays: number;
  rangeFrom: string;
  rangeTo: string;
}

export async function getPlatformOverview(opts: { days?: number; from?: string; to?: string } = {}): Promise<PlatformOverview> {
  const dates = computeDates(opts);
  const rangeFrom = dates[0];
  const rangeTo = dates[dates.length - 1];
  const [bizes, users, orders, subs, emailRaw] = await Promise.all([
    listAllBizes(),
    listUsers(),
    listOrders(),
    listSubscriptions(),
    getEmailStatsRaw(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  // ─── AI usage: gộp xuyên biz (chạy trong ngữ cảnh từng biz để store trỏ đúng .data/biz/<id>) ───
  const modelMap = new Map<string, { provider: string; model: string; inTokens: number; outTokens: number; images: number }>();
  const providerMap = new Map<string, { inTokens: number; outTokens: number; costUsd: number }>();
  const userMap = new Map<string, { inTokens: number; outTokens: number; costUsd: number }>();
  const seriesMap = new Map<string, { inTokens: number; outTokens: number }>();
  for (const d of dates) seriesMap.set(d, { inTokens: 0, outTokens: 0 });
  const totals = { inTokens: 0, outTokens: 0, calls: 0, images: 0, costUsd: 0 };

  for (const biz of bizes) {
    await bizContext.run({ userId: '', bizId: biz.id }, async () => {
      const [usage, series, byUser] = await Promise.all([
        getUsage(),
        getUsageSeries({ from: rangeFrom, to: rangeTo }),
        getUsageByUser(),
      ]);
      for (const r of usage.rows) {
        const key = `${r.provider}::${r.model}`;
        const m = modelMap.get(key) ?? { provider: r.provider, model: r.model, inTokens: 0, outTokens: 0, images: 0 };
        m.inTokens += r.inTokens; m.outTokens += r.outTokens; m.images += r.images;
        modelMap.set(key, m);
        const cost = rowCostUsd(r.provider, r.model, r.inTokens, r.outTokens, r.images) ?? 0;
        const p = providerMap.get(r.provider) ?? { inTokens: 0, outTokens: 0, costUsd: 0 };
        p.inTokens += r.inTokens; p.outTokens += r.outTokens; p.costUsd += cost;
        providerMap.set(r.provider, p);
        totals.inTokens += r.inTokens; totals.outTokens += r.outTokens;
        totals.calls += r.calls; totals.images += r.images; totals.costUsd += cost;
      }
      for (const day of series) {
        const s = seriesMap.get(day.date);
        if (s) { s.inTokens += day.inTokens; s.outTokens += day.outTokens; }
      }
      for (const u of byUser) {
        const cur = userMap.get(u.userId) ?? { inTokens: 0, outTokens: 0, costUsd: 0 };
        cur.inTokens += u.inTokens; cur.outTokens += u.outTokens; cur.costUsd += u.costUsd ?? 0;
        userMap.set(u.userId, cur);
      }
    });
  }

  const byModel = [...modelMap.values()]
    .map((m) => ({ provider: m.provider, model: m.model, inTokens: m.inTokens, outTokens: m.outTokens, costUsd: rowCostUsd(m.provider, m.model, m.inTokens, m.outTokens, m.images) ?? 0 }))
    .sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens))
    .slice(0, 10);
  const byProvider = [...providerMap.entries()]
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens));
  const topUsers = [...userMap.entries()]
    .map(([userId, v]) => ({ userId, name: userById.get(userId)?.name ?? userId, email: userById.get(userId)?.email ?? '', ...v }))
    .filter((u) => u.inTokens + u.outTokens > 0)
    .sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens))
    .slice(0, 8);
  const aiSeries = dates.map((date) => ({ date, ...(seriesMap.get(date) ?? { inTokens: 0, outTokens: 0 }) }));

  // ─── Đơn hàng ───
  const orderStatuses = ['pending', 'paid', 'canceled', 'refunded'] as const;
  type OStatus = (typeof orderStatuses)[number];
  const byStatus: Record<string, number> = Object.fromEntries(orderStatuses.map((s) => [s, 0]));
  let revenueVndPaid = 0;
  type OSeries = { count: number; pending: number; paid: number; canceled: number; refunded: number; revenueVnd: number };
  const orderSeries = new Map<string, OSeries>();
  for (const d of dates) orderSeries.set(d, { count: 0, pending: 0, paid: 0, canceled: 0, refunded: 0, revenueVnd: 0 });
  const inRange = (iso?: string) => (iso ? seriesHas(orderSeries, iso.slice(0, 10)) : false);
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    if (o.status === 'paid' && o.currency === 'VND') revenueVndPaid += o.total;
    const cs = orderSeries.get(o.createdAt.slice(0, 10));
    if (cs) {
      cs.count += 1;
      if ((orderStatuses as readonly string[]).includes(o.status)) cs[o.status as OStatus] += 1;
    }
    if (o.status === 'paid' && o.currency === 'VND' && o.paidAt && inRange(o.paidAt)) {
      const ps = orderSeries.get(o.paidAt.slice(0, 10));
      if (ps) ps.revenueVnd += o.total;
    }
  }
  const orderSeriesArr = dates.map((date) => ({ date, ...(orderSeries.get(date) ?? { count: 0, pending: 0, paid: 0, canceled: 0, refunded: 0, revenueVnd: 0 }) }));

  // ─── Gói / subscription ───
  const byPlan: Record<string, number> = Object.fromEntries(PLAN_ORDER.map((p) => [p, 0]));
  const subByStatus: Record<string, number> = {};
  for (const s of subs) {
    byPlan[s.plan] = (byPlan[s.plan as PlanId] ?? 0) + 1;
    subByStatus[s.status] = (subByStatus[s.status] ?? 0) + 1;
  }

  return {
    accounts: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.active).length,
      suspendedUsers: users.filter((u) => !u.active).length,
      totalBiz: bizes.length,
      suspendedBiz: bizes.filter((b) => b.suspended).length,
    },
    ai: { totals, byProvider, byModel, topUsers, series: aiSeries },
    orders: { byStatus, total: (orders as Order[]).length, revenueVndPaid, series: orderSeriesArr },
    subscriptions: { byPlan, byStatus: subByStatus },
    email: {
      total: emailRaw.total,
      byEvent: emailRaw.byEvent,
      series: dates.map((d) => ({ date: d, count: emailRaw.byDay[d] ?? 0 })),
    },
    rangeDays: dates.length,
    rangeFrom,
    rangeTo,
  };
}

function seriesHas(m: Map<string, unknown>, date: string): boolean {
  return m.has(date);
}
