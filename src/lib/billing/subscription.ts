import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';
import type { PlanId } from './plans';

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'free';

export interface Subscription {
  userId: string;
  plan: PlanId;
  status: SubStatus;
  billingCycle: 'monthly' | 'yearly';
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  overageArticles?: number;
  unlimitedArticles?: boolean;
  updatedAt: string;
}

type Store = Record<string, Subscription>;
const FILE = globalFile('subscriptions.json');
const DAY = 86_400_000;
const GRACE_DAYS = 3;

const isDb = () => storageDriver() === 'prisma';

function isExpired(iso: string | undefined, graceDays = 0): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t + graceDays * DAY < Date.now();
}

function effective(s: Subscription): Subscription {
  if (s.status === 'trialing' && isExpired(s.trialEndsAt)) return { ...s, plan: 'free', status: 'free' };
  if ((s.status === 'active' || s.status === 'past_due') && s.currentPeriodEnd) {
    if (isExpired(s.currentPeriodEnd, GRACE_DAYS)) return { ...s, plan: 'free', status: 'free', unlimitedArticles: false, overageArticles: 0 };
    if (isExpired(s.currentPeriodEnd)) return { ...s, status: 'past_due' };
  }
  return s;
}

function subOut(r: { userId: string; plan: string; status: string; billingCycle: string; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null; overageArticles?: number | null; unlimitedArticles?: boolean | null; updatedAt: Date }): Subscription {
  return {
    userId: r.userId,
    plan: r.plan as PlanId,
    status: r.status as SubStatus,
    billingCycle: r.billingCycle as 'monthly' | 'yearly',
    trialEndsAt: r.trialEndsAt?.toISOString(),
    currentPeriodEnd: r.currentPeriodEnd?.toISOString(),
    overageArticles: r.overageArticles ?? undefined,
    unlimitedArticles: r.unlimitedArticles ?? undefined,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function subData(s: Subscription) {
  return {
    plan: s.plan,
    status: s.status,
    billingCycle: s.billingCycle,
    trialEndsAt: s.trialEndsAt ? new Date(s.trialEndsAt) : null,
    currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null,
    overageArticles: s.overageArticles ?? null,
    unlimitedArticles: s.unlimitedArticles ?? null,
    updatedAt: new Date(s.updatedAt),
  };
}

export async function listExpiringSubscriptions(days: number): Promise<Subscription[]> {
  const rows = isDb() ? (await prisma.subscription.findMany()).map(subOut) : Object.values(await readJson<Store>(FILE, {}));
  const now = Date.now();
  const horizon = now + days * DAY;
  return rows.map(effective).filter((s) => {
    if (s.status !== 'active' && s.status !== 'trialing') return false;
    const endIso = s.status === 'trialing' ? s.trialEndsAt : s.currentPeriodEnd;
    if (!endIso) return false;
    const t = Date.parse(endIso);
    return Number.isFinite(t) && t > now && t <= horizon;
  });
}

export async function getSubscription(userId: string): Promise<Subscription> {
  if (isDb()) {
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    if (existing) return effective(subOut(existing));
    // Gói MẶC ĐỊNH cho tài khoản/biz mới = FREE (không trial). Nâng cấp qua thanh toán Sepay.
    const now = Date.now();
    const created: Subscription = {
      userId,
      plan: 'free',
      status: 'free',
      billingCycle: 'monthly',
      updatedAt: new Date(now).toISOString(),
    };
    await prisma.subscription.create({ data: { userId, ...subData(created) } }).catch(() => {});
    return created;
  }
  const store = await readJson<Store>(FILE, {});
  const existing = store[userId];
  if (existing) return effective(existing);
  // Gói MẶC ĐỊNH cho tài khoản/biz mới = FREE (không trial).
  const now = Date.now();
  const created: Subscription = { userId, plan: 'free', status: 'free', billingCycle: 'monthly', updatedAt: new Date(now).toISOString() };
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    if (!cur[userId]) cur[userId] = created;
    return [cur, undefined];
  });
  return created;
}

export async function setSubscription(userId: string, patch: Partial<Omit<Subscription, 'userId' | 'updatedAt'>>): Promise<Subscription> {
  if (isDb()) {
    const baseRow = await prisma.subscription.findUnique({ where: { userId } });
    const base: Subscription = baseRow ? subOut(baseRow) : { userId, plan: 'free', status: 'free', billingCycle: 'monthly', updatedAt: '' };
    const next: Subscription = { ...base, ...patch, userId, updatedAt: new Date().toISOString() };
    const saved = await prisma.subscription.upsert({ where: { userId }, create: { userId, ...subData(next) }, update: subData(next) });
    return subOut(saved);
  }
  return mutateJson<Store, Subscription>(FILE, {}, (cur) => {
    const base: Subscription = cur[userId] ?? { userId, plan: 'free', status: 'free', billingCycle: 'monthly', updatedAt: '' };
    const next: Subscription = { ...base, ...patch, userId, updatedAt: new Date().toISOString() };
    cur[userId] = next;
    return [cur, next];
  });
}

export async function addOverageArticles(userId: string, n: number): Promise<void> {
  if (isDb()) {
    const base = await getSubscription(userId);
    await setSubscription(userId, { overageArticles: Math.max(0, (base.overageArticles ?? 0) + n) });
    return;
  }
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    const base: Subscription = cur[userId] ?? { userId, plan: 'free', status: 'free', billingCycle: 'monthly', updatedAt: '' };
    base.overageArticles = Math.max(0, (base.overageArticles ?? 0) + n);
    base.updatedAt = new Date().toISOString();
    cur[userId] = base;
    return [cur, undefined];
  });
}

export async function listSubscriptions(): Promise<Subscription[]> {
  if (isDb()) return (await prisma.subscription.findMany()).map(subOut).map(effective);
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).map(effective);
}
