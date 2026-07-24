import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';
import { sendPlatformEvent } from '../store/platform-email';
import { sendPurchaseEvent } from '../tracking/conversion';
import { releaseCouponUse, type Currency } from './coupons';
import type { PlanId } from './plans';
import { addOverageArticles, setSubscription } from './subscription';

const loginUrl = () => (process.env.APP_URL ? `${process.env.APP_URL}/login` : '');

export type OrderType = 'subscription' | 'overage';
export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded';

export interface OrderUtm { source?: string; medium?: string; campaign?: string; content?: string; term?: string; }
export interface Order {
  id: string; userId: string; userEmail: string; type: OrderType; plan?: PlanId; months?: number; overageArticles?: number;
  currency: Currency; amount: number; couponCode?: string; discount: number; total: number; status: OrderStatus; payCode: string;
  phone?: string; utm?: OrderUtm; note?: string; activationError?: string; createdAt: string; paidAt?: string;
}

type Store = Record<string, Order>;
const FILE = globalFile('orders.json');
const DAY = 86_400_000;
const isDb = () => storageDriver() === 'prisma';

function orderOut(r: { id: string; userId: string; userEmail: string; type: string; plan?: string | null; months?: number | null; overageArticles?: number | null; currency: string; amount: number; couponCode?: string | null; discount: number; total: number; status: string; payCode: string; phone?: string | null; utm?: unknown; note?: string | null; activationError?: string | null; paidAt?: Date | null; createdAt: Date }): Order {
  return { id: r.id, userId: r.userId, userEmail: r.userEmail, type: r.type as OrderType, plan: (r.plan as PlanId | null) ?? undefined, months: r.months ?? undefined, overageArticles: r.overageArticles ?? undefined, currency: r.currency as Currency, amount: r.amount, couponCode: r.couponCode ?? undefined, discount: r.discount, total: r.total, status: r.status as OrderStatus, payCode: r.payCode, phone: r.phone ?? undefined, utm: (r.utm as OrderUtm | null) ?? undefined, note: r.note ?? undefined, activationError: r.activationError ?? undefined, paidAt: r.paidAt?.toISOString(), createdAt: r.createdAt.toISOString() };
}

function orderData(o: Order) {
  return { userId: o.userId, userEmail: o.userEmail, type: o.type, plan: o.plan ?? null, months: o.months ?? null, overageArticles: o.overageArticles ?? null, currency: o.currency, amount: o.amount, couponCode: o.couponCode ?? null, discount: o.discount, total: o.total, status: o.status, payCode: o.payCode, phone: o.phone ?? null, utm: (o.utm as object | undefined) ?? undefined, note: o.note ?? null, activationError: o.activationError ?? null, paidAt: o.paidAt ? new Date(o.paidAt) : null, createdAt: new Date(o.createdAt) };
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

  if (justPaid) {
    let activationError: string | undefined;
    try {
      if (order.type === 'subscription' && order.plan) {
        const months = order.months ?? 1;
        await setSubscription(order.userId, { plan: order.plan, status: 'active', billingCycle: months >= 12 ? 'yearly' : 'monthly', currentPeriodEnd: new Date(Date.now() + months * 30 * DAY).toISOString() });
      } else if (order.type === 'overage' && order.overageArticles) {
        await addOverageArticles(order.userId, order.overageArticles);
      }
    } catch (e) {
      activationError = e instanceof Error ? e.message : 'activation error';
      console.error('[setOrderStatus] activation failed', { orderId: id }, e);
    }
    if (isDb()) await prisma.order.update({ where: { id }, data: { activationError: activationError ?? null } }).catch(() => {});
    else await mutateJson<Store, void>(FILE, {}, (cur) => { const o2 = cur[id]; if (o2) { if (activationError) o2.activationError = activationError; else delete o2.activationError; cur[id] = o2; } return [cur, undefined]; });
    order.activationError = activationError;

    void sendPlatformEvent('paymentReceived', order.userEmail, { name: order.userEmail, plan: order.plan ?? 'overage', amount: order.total.toLocaleString('vi-VN'), currency: order.currency, orderId: order.id, loginUrl: loginUrl() }).then((r) => { if (!r.sent && r.error) console.warn('[paymentReceived email]', r.error, { orderId: id }); });
    void sendPurchaseEvent({ eventId: order.id, email: order.userEmail, phone: order.phone, value: order.total, currency: order.currency, contentId: order.plan ?? 'overage' }).then((r) => { const bad = [...r.fb, ...r.tt, r.ga4].filter((x) => x.error && x.error !== 'not-configured'); for (const x of bad) console.warn('[purchase capi]', x.label, x.error, { orderId: id }); }).catch((e) => console.warn('[purchase capi]', e, { orderId: id }));
  }
  return order;
}
