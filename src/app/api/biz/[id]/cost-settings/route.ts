import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rowCostUsd } from '@/lib/ai/pricing';
import { getMonthlyTokens, getUsage } from '@/lib/ai/usage';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { getUsdRates } from '@/lib/i18n/fx';
import { getCostConfig, saveCostConfig } from '@/lib/store/cost-config';
import { memberRole } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// Cài đặt chi phí/hạn mức token theo biz + số liệu chi phí. Chỉ chủ/quản trị.
async function requireManager(bizId: string) {
  const g = await guard();
  if ('response' in g) return { error: g.response as NextResponse };
  const role = await memberRole(bizId, g.user.id);
  if (role !== 'owner' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 }) };
  }
  return { userId: g.user.id };
}

// GET → { monthlyTokenBudget, usedThisMonth, rows[+costUsd], totalCostUsd, fx }.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  const data = await runWithBiz({ userId: chk.userId, bizId: params.id }, async () => {
    const [cfg, used, usage] = await Promise.all([getCostConfig(), getMonthlyTokens(), getUsage()]);
    return { cfg, used, usage };
  });
  const fx = await getUsdRates();
  const rows = data.usage.rows.map((r) => ({
    ...r,
    costUsd: rowCostUsd(r.provider, r.model, r.inTokens, r.outTokens, r.images),
  }));
  const totalCostUsd = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  return NextResponse.json({
    monthlyTokenBudget: data.cfg.monthlyTokenBudget,
    usedThisMonth: data.used,
    rows,
    totals: data.usage.totals,
    totalCostUsd,
    fx: { rates: fx.rates, asOf: fx.asOf },
  });
}

const Schema = z.object({ monthlyTokenBudget: z.number().min(0).max(1_000_000_000) });

// POST → đặt trần token/tháng.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const cfg = await runWithBiz({ userId: chk.userId, bizId: params.id }, () =>
    saveCostConfig({ monthlyTokenBudget: parsed.data.monthlyTokenBudget }),
  );
  return NextResponse.json({ ok: true, monthlyTokenBudget: cfg.monthlyTokenBudget });
}
