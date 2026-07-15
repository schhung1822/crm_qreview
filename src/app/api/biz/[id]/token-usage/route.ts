import { NextResponse } from 'next/server';
import { getUsageByUser } from '@/lib/ai/usage';
import { guard } from '@/lib/auth/current';
import { listUsers } from '@/lib/auth/users';
import { runWithBiz } from '@/lib/biz/context';
import { getUsdRates } from '@/lib/i18n/fx';
import { memberRole } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// GET /api/biz/[id]/token-usage → token AI đã dùng theo TỪNG NHÂN VIÊN của biz. Chỉ chủ/quản trị.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  const role = await memberRole(params.id, g.user.id);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 });
  }
  const [rows, fx] = await Promise.all([
    runWithBiz({ userId: g.user.id, bizId: params.id }, () => getUsageByUser()),
    getUsdRates(),
  ]);
  const byId = new Map((await listUsers()).map((u) => [u.id, u]));
  const report = rows.map((r) => {
    const u = byId.get(r.userId);
    return {
      userId: r.userId,
      name: u?.name ?? null, // null → UI hiển thị nhãn "không xác định" / "qua API"
      email: u?.email ?? null,
      inTokens: r.inTokens,
      outTokens: r.outTokens,
      calls: r.calls,
      images: r.images,
      costUsd: r.costUsd,
    };
  });
  return NextResponse.json({ rows: report, fx: { rates: fx.rates, asOf: fx.asOf } });
}
