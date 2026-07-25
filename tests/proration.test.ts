import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '../src/lib/billing/plans';
import { remainingPlanCredit } from '../src/lib/billing/proration';
import type { Subscription } from '../src/lib/billing/subscription';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');
const DAY = 86_400_000;

function sub(patch: Partial<Subscription>): Subscription {
  return { userId: 'u1', plan: 'pro', status: 'active', billingCycle: 'monthly', updatedAt: '', ...patch };
}

describe('remainingPlanCredit (proration)', () => {
  it('gói FREE → không có tín dụng (phải trả 100%)', () => {
    const s = sub({ plan: 'free', status: 'free', currentPeriodEnd: new Date(NOW + 30 * DAY).toISOString() });
    expect(remainingPlanCredit(s, DEFAULT_PLANS.free, NOW)).toBe(0);
  });

  it('gói trả phí ĐÃ HẾT HẠN → 0', () => {
    const s = sub({ plan: 'pro', currentPeriodEnd: new Date(NOW - DAY).toISOString() });
    expect(remainingPlanCredit(s, DEFAULT_PLANS.pro, NOW)).toBe(0);
  });

  it('đang TRIAL (chưa trả tiền) → 0', () => {
    const s = sub({ plan: 'pro', status: 'trialing', currentPeriodEnd: new Date(NOW + 10 * DAY).toISOString() });
    expect(remainingPlanCredit(s, DEFAULT_PLANS.pro, NOW)).toBe(0);
  });

  it('gói trả phí CÒN HẠN → tín dụng theo số ngày còn lại (giá tháng / 30 × ngày)', () => {
    // pro = 699.000đ/tháng → đơn giá ngày = 23.300đ; còn 15 ngày → ~349.500đ.
    const s = sub({ plan: 'pro', currentPeriodEnd: new Date(NOW + 15 * DAY).toISOString() });
    const expected = Math.round((DEFAULT_PLANS.pro.priceVndMonthly / 30) * 15);
    expect(remainingPlanCredit(s, DEFAULT_PLANS.pro, NOW)).toBe(expected);
  });

  it('không có subscription → 0', () => {
    expect(remainingPlanCredit(null, DEFAULT_PLANS.pro, NOW)).toBe(0);
  });
});
