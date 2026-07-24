import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';
import type { PlanId } from './plans';

export type CouponType = 'percent' | 'fixed';
export type Currency = 'VND' | 'USD';

export interface Coupon {
  code: string;
  type: CouponType;
  value: number;
  currency?: Currency;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  plans?: PlanId[];
  active: boolean;
  createdAt: string;
}

export interface CouponCheck {
  ok: boolean;
  reason?: string;
  discount: number;
  coupon?: Coupon;
}

type Store = Record<string, Coupon>;
const FILE = globalFile('coupons.json');
const norm = (code: string) => code.trim().toUpperCase();
const isDb = () => storageDriver() === 'prisma';

function couponOut(r: { code: string; type: string; value: number; currency?: string | null; maxUses: number; usedCount: number; expiresAt?: Date | null; plans?: unknown; active: boolean; createdAt: Date }): Coupon {
  return {
    code: r.code,
    type: r.type as CouponType,
    value: r.value,
    currency: (r.currency as Currency | null) ?? undefined,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    expiresAt: r.expiresAt?.toISOString(),
    plans: (r.plans as PlanId[] | null) ?? undefined,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}

function checkCoupon(c: Coupon | null, plan: PlanId, amount: number, currency: Currency): CouponCheck {
  if (!c || !c.active) return { ok: false, reason: 'Ma khong ton tai hoac da tat.', discount: 0 };
  if (c.expiresAt && Date.parse(c.expiresAt) < Date.now()) return { ok: false, reason: 'Ma da het han.', discount: 0 };
  if (c.maxUses > 0 && c.usedCount >= c.maxUses) return { ok: false, reason: 'Ma da het luot su dung.', discount: 0 };
  if (c.plans && c.plans.length > 0 && !c.plans.includes(plan)) return { ok: false, reason: 'Ma khong ap dung cho goi nay.', discount: 0 };
  let discount = 0;
  if (c.type === 'percent') discount = Math.round((amount * Math.min(100, c.value)) / 100);
  else {
    if (c.currency && c.currency !== currency) return { ok: false, reason: 'Ma khong dung don vi tien te.', discount: 0 };
    discount = c.value;
  }
  return { ok: true, discount: Math.min(discount, amount), coupon: c };
}

export async function listCoupons(): Promise<Coupon[]> {
  if (isDb()) return (await prisma.coupon.findMany()).map(couponOut).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getCoupon(code: string): Promise<Coupon | null> {
  if (isDb()) {
    const c = await prisma.coupon.findUnique({ where: { code: norm(code) } });
    return c ? couponOut(c) : null;
  }
  const store = await readJson<Store>(FILE, {});
  return store[norm(code)] ?? null;
}

export async function upsertCoupon(input: Omit<Coupon, 'usedCount' | 'createdAt'> & { usedCount?: number }): Promise<Coupon> {
  const code = norm(input.code);
  if (isDb()) {
    const existing = await prisma.coupon.findUnique({ where: { code } });
    const saved = await prisma.coupon.upsert({
      where: { code },
      create: { code, type: input.type, value: input.value, currency: input.currency ?? null, maxUses: input.maxUses, usedCount: input.usedCount ?? 0, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, plans: input.plans ?? undefined, active: input.active },
      update: { type: input.type, value: input.value, currency: input.currency ?? null, maxUses: input.maxUses, usedCount: input.usedCount ?? existing?.usedCount ?? 0, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, plans: input.plans ?? undefined, active: input.active },
    });
    return couponOut(saved);
  }
  return mutateJson<Store, Coupon>(FILE, {}, (cur) => {
    const existing = cur[code];
    const next: Coupon = { ...input, code, usedCount: input.usedCount ?? existing?.usedCount ?? 0, createdAt: existing?.createdAt ?? new Date().toISOString() };
    cur[code] = next;
    return [cur, next];
  });
}

export async function deleteCoupon(code: string): Promise<void> {
  if (isDb()) { await prisma.coupon.delete({ where: { code: norm(code) } }).catch(() => {}); return; }
  await mutateJson<Store, void>(FILE, {}, (cur) => { delete cur[norm(code)]; return [cur, undefined]; });
}

export async function incrementCouponUse(code: string): Promise<void> {
  if (isDb()) { await prisma.coupon.update({ where: { code: norm(code) }, data: { usedCount: { increment: 1 } } }).catch(() => {}); return; }
  await mutateJson<Store, void>(FILE, {}, (cur) => { const c = cur[norm(code)]; if (c) c.usedCount += 1; return [cur, undefined]; });
}

export async function releaseCouponUse(code: string): Promise<void> {
  if (isDb()) {
    const c = await prisma.coupon.findUnique({ where: { code: norm(code) } });
    if (c && c.usedCount > 0) await prisma.coupon.update({ where: { code: norm(code) }, data: { usedCount: { decrement: 1 } } });
    return;
  }
  await mutateJson<Store, void>(FILE, {}, (cur) => { const c = cur[norm(code)]; if (c && c.usedCount > 0) c.usedCount -= 1; return [cur, undefined]; });
}

export async function claimCoupon(code: string, plan: PlanId, amount: number, currency: Currency): Promise<CouponCheck> {
  const key = norm(code);
  if (isDb()) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.coupon.findUnique({ where: { code: key } });
      const c = row ? couponOut(row) : null;
      const checked = checkCoupon(c, plan, amount, currency);
      if (!checked.ok) return checked;
      await tx.coupon.update({ where: { code: key }, data: { usedCount: { increment: 1 } } });
      return { ...checked, coupon: { ...checked.coupon!, usedCount: checked.coupon!.usedCount + 1 } };
    });
  }
  return mutateJson<Store, CouponCheck>(FILE, {}, (cur) => {
    const c = cur[key];
    const checked = checkCoupon(c ?? null, plan, amount, currency);
    if (!checked.ok) return [cur, checked];
    c.usedCount += 1;
    cur[key] = c;
    return [cur, { ...checked, coupon: c }];
  });
}

export async function validateCoupon(code: string, plan: PlanId, amount: number, currency: Currency): Promise<CouponCheck> {
  return checkCoupon(await getCoupon(code), plan, amount, currency);
}

export function genCouponCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function couponSafetyError(input: Pick<Coupon, 'type' | 'value' | 'maxUses'>): string | null {
  const unlimited = !input.maxUses || input.maxUses <= 0;
  if (input.type === 'percent' && input.value >= 100 && unlimited) {
    return 'Ma giam 100% phai co gioi han so lan dung (maxUses > 0).';
  }
  return null;
}
