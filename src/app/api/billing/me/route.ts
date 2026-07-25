import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { isSuperadminUser } from '@/lib/auth/superadmin';
import { entitlementsForUser, userQuotaStatus } from '@/lib/billing/entitlement';
import { getLastPaidSubscriptionOrder } from '@/lib/billing/orders';

export const dynamic = 'force-dynamic';

// GET /api/billing/me → gói + hạn mức usage + CHI TIẾT gói (ngày thanh toán/hết hạn) của tài khoản.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const [ent, quota, isAdmin, lastOrder] = await Promise.all([
    entitlementsForUser(g.user.id),
    userQuotaStatus(g.user.id),
    isSuperadminUser(g.user.id),
    getLastPaidSubscriptionOrder(g.user.id),
  ]);
  return NextResponse.json({
    planId: ent.planId,
    plan: ent.plan,
    sub: ent.sub
      ? {
          status: ent.sub.status,
          trialEndsAt: ent.sub.trialEndsAt,
          currentPeriodEnd: ent.sub.currentPeriodEnd,
          billingCycle: ent.sub.billingCycle,
          overageArticles: ent.sub.overageArticles ?? 0,
          unlimitedArticles: ent.sub.unlimitedArticles ?? false,
          updatedAt: ent.sub.updatedAt,
        }
      : null,
    quota,
    // Chi tiết thanh toán gần nhất (để hiện "ngày thanh toán").
    lastPayment: lastOrder
      ? {
          paidAt: lastOrder.paidAt ?? null,
          plan: lastOrder.plan ?? null,
          months: lastOrder.months ?? null,
          total: lastOrder.total,
          currency: lastOrder.currency,
        }
      : null,
    isSuperadmin: isAdmin,
  });
}
