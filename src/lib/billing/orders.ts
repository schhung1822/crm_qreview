import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';
import { sendPlatformEvent } from '../store/platform-email';
import { sendPurchaseEvent } from '../tracking/conversion';
import { recordSubscriptionEvent } from '../tracking/billing-events';
import { releaseCouponUse, type Currency } from './coupons';
import { PLAN_ORDER, type PlanId } from './plans';
import { addOverageArticles, getSubscription, setSubscription } from './subscription';

const loginUrl = () => (process.env.APP_URL ? `${process.env.APP_URL}/login` : '');

// Phân loại thay đổi gói để ghi SubscriptionEvent: nâng/hạ/gia hạn (từ gói trả phí còn hiệu lực) hay
// kích hoạt mới (từ free/hết hạn).
function subscriptionChangeType(fromPlan: string | undefined, fromStatus: string | undefined, toPlan: string): string {
  if (!fromPlan || fromPlan === 'free' || fromStatus !== 'active') return 'activated';
  const a = PLAN_ORDER.indexOf(fromPlan as PlanId);
  const b = PLAN_ORDER.indexOf(toPlan as PlanId);
  if (b > a) return 'upgraded';
  if (b < a) return 'downgraded';
  return 'renewed';
}

export type OrderType = 'subscription' | 'overage';
export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded';

// Trạng thái "đã thanh toán". Chấp nhận cả 'paydone' (đổi status thủ công trong bảng Order) như
// bí danh của 'paid' → không bị lỡ kích hoạt khi ai đó set 'paydone' thay vì 'paid'.
export function isPaidStatus(status: string): boolean {
  return status === 'paid' || status === 'paydone';
}

export interface OrderUtm { source?: string; medium?: string; campaign?: string; content?: string; term?: string; }
export interface Order {
  id: string; userId: string; userEmail: string; type: OrderType; plan?: PlanId; months?: number; overageArticles?: number;
  currency: Currency; amount: number; couponCode?: string; discount: number; prorationCredit?: number; total: number; status: OrderStatus; payCode: string;
  phone?: string; utm?: OrderUtm; note?: string; activationError?: string; createdAt: string; paidAt?: string;
}

type Store = Record<string, Order>;
const FILE = globalFile('orders.json');
const DAY = 86_400_000;
const isDb = () => storageDriver() === 'prisma';

function orderOut(r: { id: string; userId: string; userEmail: string; type: string; plan?: string | null; months?: number | null; overageArticles?: number | null; currency: string; amount: number; couponCode?: string | null; discount: number; prorationCredit?: number | null; total: number; status: string; payCode: string; phone?: string | null; utm?: unknown; note?: string | null; activationError?: string | null; paidAt?: Date | null; createdAt: Date }): Order {
  return { id: r.id, userId: r.userId, userEmail: r.userEmail, type: r.type as OrderType, plan: (r.plan as PlanId | null) ?? undefined, months: r.months ?? undefined, overageArticles: r.overageArticles ?? undefined, currency: r.currency as Currency, amount: r.amount, couponCode: r.couponCode ?? undefined, discount: r.discount, prorationCredit: r.prorationCredit ?? undefined, total: r.total, status: r.status as OrderStatus, payCode: r.payCode, phone: r.phone ?? undefined, utm: (r.utm as OrderUtm | null) ?? undefined, note: r.note ?? undefined, activationError: r.activationError ?? undefined, paidAt: r.paidAt?.toISOString(), createdAt: r.createdAt.toISOString() };
}

function orderData(o: Order) {
  return { userId: o.userId, userEmail: o.userEmail, type: o.type, plan: o.plan ?? null, months: o.months ?? null, overageArticles: o.overageArticles ?? null, currency: o.currency, amount: o.amount, couponCode: o.couponCode ?? null, discount: o.discount, prorationCredit: o.prorationCredit ?? 0, total: o.total, status: o.status, payCode: o.payCode, phone: o.phone ?? null, utm: (o.utm as object | undefined) ?? undefined, note: o.note ?? null, activationError: o.activationError ?? null, paidAt: o.paidAt ? new Date(o.paidAt) : null, createdAt: new Date(o.createdAt) };
}

export async function listOrders(): Promise<Order[]> {
  if (isDb()) return (await prisma.order.findMany()).map(orderOut).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOrder(id: string): Promise<Order | null> {
  if (isDb()) { const row = await prisma.order.findUnique({ where: { id } }); return row ? orderOut(row) : null; }
  return (await readJson<Store>(FILE, {}))[id] ?? null;
}

// Đơn GÓI đã thanh toán GẦN NHẤT của một người dùng (để hiện "ngày thanh toán gần nhất" ở trang gói).
export async function getLastPaidSubscriptionOrder(userId: string): Promise<Order | null> {
  if (isDb()) {
    const row = await prisma.order.findFirst({
      where: { userId, status: 'paid', type: 'subscription' },
      orderBy: { paidAt: 'desc' },
    });
    return row ? orderOut(row) : null;
  }
  const all = await listOrders(); // đã sắp xếp createdAt giảm dần
  return all.find((o) => o.userId === userId && o.status === 'paid' && o.type === 'subscription') ?? null;
}

export async function createOrder(input: Omit<Order, 'id' | 'status' | 'createdAt' | 'paidAt' | 'payCode'>): Promise<Order> {
  const order: Order = { ...input, id: 'ord_' + randomBytes(8).toString('hex'), payCode: randomBytes(4).toString('hex').toUpperCase(), status: 'pending', createdAt: new Date().toISOString() };
  if (isDb()) await prisma.order.create({ data: { id: order.id, ...orderData(order) } });
  else await mutateJson<Store, void>(FILE, {}, (cur) => { cur[order.id] = order; return [cur, undefined]; });
  if (order.total <= 0) return (await setOrderStatus(order.id, 'paid')) ?? order;
  return order;
}

export async function findPendingOrderByContent(content: string): Promise<Order | null> {
  const norm = (content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;
  const orders = await listOrders();
  return orders.find((o) => o.status === 'pending' && o.payCode && norm.includes(o.payCode)) ?? null;
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  let res: { order: Order; justPaid: boolean; justReleased: boolean } | null;
  if (isDb()) {
    const row = await prisma.order.findUnique({ where: { id } });
    if (!row) return null;
    const order = orderOut(row);
    const wasTerminal = order.status === 'canceled' || order.status === 'refunded';
    const justPaid = status === 'paid' && order.status !== 'paid';
    const justReleased = (status === 'canceled' || status === 'refunded') && !wasTerminal && !!order.couponCode;
    order.status = status;
    if (justPaid) order.paidAt = new Date().toISOString();
    const saved = await prisma.order.update({ where: { id }, data: { status: order.status, paidAt: order.paidAt ? new Date(order.paidAt) : null } });
    res = { order: orderOut(saved), justPaid, justReleased };
  } else {
    res = await mutateJson<Store, { order: Order; justPaid: boolean; justReleased: boolean } | null>(FILE, {}, (cur) => {
      const o = cur[id];
      if (!o) return [cur, null];
      const wasTerminal = o.status === 'canceled' || o.status === 'refunded';
      const justPaid = status === 'paid' && o.status !== 'paid';
      const justReleased = (status === 'canceled' || status === 'refunded') && !wasTerminal && !!o.couponCode;
      o.status = status;
      if (justPaid) o.paidAt = new Date().toISOString();
      cur[id] = o;
      return [cur, { order: o, justPaid, justReleased }];
    });
  }
  if (!res) return null;
  const { order, justPaid, justReleased } = res;

  if (justReleased && order.couponCode) {
    try { await releaseCouponUse(order.couponCode); } catch (e) { console.warn('[setOrderStatus] release coupon failed', { orderId: id }, e); }
  }

  if (justPaid) await applyPaidSideEffects(order);
  return order;
}

// Side-effect khi đơn ĐÃ THANH TOÁN: kích hoạt gói cho biz (chủ tài khoản) hoặc cộng overage +
// gửi email biên nhận + gửi sự kiện chuyển đổi. Tách riêng để dùng lại từ webhook, admin, và
// reconciler (đồng bộ khi đổi status thủ công). Gọi ĐÚNG MỘT LẦN mỗi đơn (mốc = paidAt).
async function applyPaidSideEffects(order: Order): Promise<void> {
  const id = order.id;
  let activationError: string | undefined;
  try {
    if (order.type === 'subscription' && order.plan) {
      const months = order.months ?? 1;
      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + months * 30 * DAY);
      // Gói TRƯỚC khi kích hoạt (để ghi vòng đời: nâng/gia hạn/kích hoạt).
      const before = await getSubscription(order.userId).catch(() => null);
      await setSubscription(order.userId, { plan: order.plan, status: 'active', billingCycle: months >= 12 ? 'yearly' : 'monthly', currentPeriodEnd: periodEnd.toISOString() });
      recordSubscriptionEvent({
        userId: order.userId,
        orderId: order.id,
        eventType: subscriptionChangeType(before?.plan, before?.status, order.plan),
        fromPlan: before?.plan,
        toPlan: order.plan,
        fromStatus: before?.status,
        toStatus: 'active',
        periodStart,
        periodEnd,
        metadata: { months, total: order.total, currency: order.currency, prorationCredit: order.prorationCredit ?? 0 },
      });
    } else if (order.type === 'overage' && order.overageArticles) {
      await addOverageArticles(order.userId, order.overageArticles);
      recordSubscriptionEvent({
        userId: order.userId,
        orderId: order.id,
        eventType: 'overage_added',
        metadata: { articles: order.overageArticles, total: order.total, currency: order.currency },
      });
    }
  } catch (e) {
    activationError = e instanceof Error ? e.message : 'activation error';
    console.error('[order] activation failed', { orderId: id }, e);
  }
  if (isDb()) await prisma.order.update({ where: { id }, data: { activationError: activationError ?? null } }).catch(() => {});
  else await mutateJson<Store, void>(FILE, {}, (cur) => { const o2 = cur[id]; if (o2) { if (activationError) o2.activationError = activationError; else delete o2.activationError; cur[id] = o2; } return [cur, undefined]; });
  order.activationError = activationError;

  void sendPlatformEvent('paymentReceived', order.userEmail, { name: order.userEmail, plan: order.plan ?? 'overage', amount: order.total.toLocaleString('vi-VN'), currency: order.currency, orderId: order.id, loginUrl: loginUrl() }).then((r) => { if (!r.sent && r.error) console.warn('[paymentReceived email]', r.error, { orderId: id }); });
  void sendPurchaseEvent({ eventId: order.id, email: order.userEmail, phone: order.phone, value: order.total, currency: order.currency, contentId: order.plan ?? 'overage' }).then((r) => { const bad = [...r.fb, ...r.tt, r.ga4].filter((x) => x.error && x.error !== 'not-configured'); for (const x of bad) console.warn('[purchase capi]', x.label, x.error, { orderId: id }); }).catch((e) => console.warn('[purchase capi]', e, { orderId: id }));
}

// ĐỒNG BỘ đơn được đổi status THỦ CÔNG (sửa bảng Order trong DB, vd sang 'paydone' hoặc 'paid')
// mà CHƯA chạy kích hoạt. Chuẩn hóa về 'paid' + đóng dấu paidAt + kích hoạt gói. Idempotent: đã có
// paidAt (đã xử lý) → bỏ qua, không kích hoạt lại (tránh cộng dồn kỳ hạn).
export async function ensureOrderActivated(id: string): Promise<Order | null> {
  const order = await getOrder(id);
  if (!order) return null;
  if (!isPaidStatus(order.status) || order.paidAt) return order;
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  if (isDb()) await prisma.order.update({ where: { id }, data: { status: 'paid', paidAt: new Date(order.paidAt) } }).catch(() => {});
  else await mutateJson<Store, void>(FILE, {}, (cur) => { const o = cur[id]; if (o) { o.status = 'paid'; o.paidAt = order.paidAt; cur[id] = o; } return [cur, undefined]; });
  await applyPaidSideEffects(order);
  return order;
}
