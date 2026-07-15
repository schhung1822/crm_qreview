import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { couponSafetyError, deleteCoupon, listCoupons, upsertCoupon } from '@/lib/billing/coupons';

export const dynamic = 'force-dynamic';

const PLAN_IDS = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json({ coupons: await listCoupons() });
}

const Schema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(['percent', 'fixed']),
  value: z.number().min(0).max(1_000_000_000),
  currency: z.enum(['VND', 'USD']).optional(),
  maxUses: z.number().int().min(0).max(1_000_000).default(0),
  expiresAt: z.string().optional(),
  plans: z.array(z.enum(PLAN_IDS)).optional(),
  active: z.boolean().default(true),
});

// POST → tạo/cập nhật coupon (theo code).
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const safetyErr = couponSafetyError(parsed.data);
  if (safetyErr) return NextResponse.json({ error: safetyErr, code: 'errCouponUnsafe' }, { status: 400 });
  const coupon = await upsertCoupon(parsed.data);
  return NextResponse.json({ ok: true, coupon });
}

// DELETE ?code=... → xóa coupon.
export async function DELETE(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Thiếu code', code: 'errCouponCodeMissing' }, { status: 400 });
  await deleteCoupon(code);
  return NextResponse.json({ ok: true });
}
