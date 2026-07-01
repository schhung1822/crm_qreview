import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { rowCostUsd } from '@/lib/ai/pricing';
import { getUsage, resetUsage } from '@/lib/ai/usage';
import { getUsdRates } from '@/lib/i18n/fx';

export const dynamic = 'force-dynamic';

// GET /api/ai-usage → bảng token + chi phí dự kiến + tỷ giá. (Chuỗi theo thời gian cho
// biểu đồ lấy ở /api/ai-usage/series để lọc khoảng riêng.)
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const [{ rows, totals }, fx] = await Promise.all([getUsage(), getUsdRates()]);
  const withCost = rows.map((r) => ({
    ...r,
    costUsd: rowCostUsd(r.provider, r.model, r.inTokens, r.outTokens, r.images),
  }));
  const totalCostUsd = withCost.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  return NextResponse.json({
    rows: withCost,
    totals,
    totalCostUsd,
    fx: { rates: fx.rates, asOf: fx.asOf },
  });
}

// DELETE /api/ai-usage → đặt lại bộ đếm (cần quyền quản lý API key).
export async function DELETE() {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;
  await resetUsage();
  return NextResponse.json({ ok: true });
}
