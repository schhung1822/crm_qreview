import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { readPlans, resetPlan, savePlan } from '@/lib/billing/plans-store';
import type { PlanId } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

// GET → bảng gói hiện hành (đã merge override) cho admin sửa.
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json({ plans: await readPlans() });
}

const PLAN_IDS = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;
const num = z.number().min(0).max(1_000_000_000);
const PatchSchema = z.object({
  id: z.enum(PLAN_IDS),
  action: z.literal('reset').optional(),
  patch: z
    .object({
      articlesPerMonth: num.optional(),
      socialReportsPerMonth: num.optional(),
      maxBiz: num.optional(),
      maxSeats: num.optional(),
      maxCmsConnections: num.optional(),
      models: z.enum(['economy', 'standard', 'premium', 'all']).optional(),
      overage: z.boolean().optional(),
      trialDays: num.optional(),
      priceVndMonthly: num.optional(),
      priceUsdMonthly: num.optional(),
      priceVndYearly: num.optional(),
      priceUsdYearly: num.optional(),
      features: z
        .object({
          approval: z.boolean(),
          brandVoice: z.boolean(),
          api: z.boolean(),
          factCheck: z.boolean(),
          humanize: z.boolean(),
          whiteLabel: z.boolean(),
          clientReports: z.boolean(),
          prioritySupport: z.boolean(),
          myTasks: z.boolean(),
          internalLinks: z.boolean(),
          imageAlt: z.boolean(),
          socialAllChannels: z.boolean(),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

// POST → lưu override cho 1 gói, hoặc reset về mặc định (action='reset').
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const id = parsed.data.id as PlanId;
  const plans =
    parsed.data.action === 'reset'
      ? await resetPlan(id)
      : await savePlan(id, parsed.data.patch ?? {});
  return NextResponse.json({ ok: true, plans });
}
