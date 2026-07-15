import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { isSuperadminUser } from '@/lib/auth/superadmin';
import { entitlementsForUser, userQuotaStatus } from '@/lib/billing/entitlement';

export const dynamic = 'force-dynamic';

// GET /api/billing/me → gói + hạn mức usage của CHÍNH tài khoản đang đăng nhập.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const [ent, quota, isAdmin] = await Promise.all([
    entitlementsForUser(g.user.id),
    userQuotaStatus(g.user.id),
    isSuperadminUser(g.user.id),
  ]);
  return NextResponse.json({
    planId: ent.planId,
    plan: ent.plan,
    sub: ent.sub
      ? {
          status: ent.sub.status,
          trialEndsAt: ent.sub.trialEndsAt,
          billingCycle: ent.sub.billingCycle,
          overageArticles: ent.sub.overageArticles ?? 0,
        }
      : null,
    quota,
    isSuperadmin: isAdmin,
  });
}
