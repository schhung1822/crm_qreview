import { NextResponse } from 'next/server';
import { getMonthlyTokensForBiz } from '@/lib/ai/usage';
import { requireSuper } from '@/lib/admin/guard';
import { listUsers } from '@/lib/auth/users';
import { TOKENS_PER_ARTICLE, type PlanId } from '@/lib/billing/plans';
import { readPlans } from '@/lib/billing/plans-store';
import { listSubscriptions } from '@/lib/billing/subscription';
import { listAllBizes } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// GET /api/admin/stats → thống kê nền tảng (tài khoản, gói, biz, token, doanh thu ước tính).
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;

  const [users, subs, bizes] = await Promise.all([
    listUsers(),
    listSubscriptions(),
    listAllBizes(),
  ]);

  // Token tháng gộp toàn nền tảng (mỗi biz đọc chuỗi ngày của tháng hiện tại).
  let monthlyTokens = 0;
  for (const b of bizes) monthlyTokens += await getMonthlyTokensForBiz(b.id);

  const plans = await readPlans();
  const byPlan: Record<string, number> = {};
  let estVnd = 0;
  let estUsd = 0;
  for (const s of subs) {
    byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
    if (s.status === 'active' && s.plan !== 'free' && s.plan !== 'enterprise') {
      const p = plans[s.plan as PlanId];
      estVnd += p.priceVndMonthly;
      estUsd += p.priceUsdMonthly;
    }
  }
  // Tài khoản chưa có bản ghi = đang dùng thử Pro mặc định.
  const trialingDefault = users.length - subs.length;

  return NextResponse.json({
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.active).length,
    suspendedUsers: users.filter((u) => !u.active).length,
    totalBiz: bizes.length,
    monthlyTokens,
    monthlyArticles: Math.round(monthlyTokens / TOKENS_PER_ARTICLE),
    byPlan,
    trialingDefault,
    estRevenueVnd: estVnd,
    estRevenueUsd: estUsd,
  });
}
