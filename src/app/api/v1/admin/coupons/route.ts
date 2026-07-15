// API QUẢN TRỊ NỀN TẢNG — COUPON.
//   GET    /api/v1/admin/coupons          → danh sách coupon
//   GET    /api/v1/admin/coupons/{code}   → chi tiết 1 coupon (route [code])
//   POST   /api/v1/admin/coupons          → tạo/chỉnh sửa coupon (theo code)
//   DELETE /api/v1/admin/coupons?code=... → xóa coupon
// Xác thực: Bearer sga_... (scope 'coupons').
import { z } from 'zod';
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { couponSafetyError, deleteCoupon, getCoupon, listCoupons, upsertCoupon } from '@/lib/billing/coupons';
import { appendAudit } from '@/lib/store/admin-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLAN_IDS = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

export async function GET(req: Request) {
  const a = await platformApiAuth(req, 'coupons');
  if ('response' in a) return a.response;
  return apiOk({ coupons: await listCoupons() });
}

const UpsertSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(['percent', 'fixed']),
  value: z.number().min(0).max(1_000_000_000),
  currency: z.enum(['VND', 'USD']).optional(),
  maxUses: z.number().int().min(0).max(1_000_000).default(0),
  expiresAt: z.string().datetime().optional(),
  plans: z.array(z.enum(PLAN_IDS)).optional(),
  active: z.boolean().default(true),
});

export async function POST(req: Request) {
  const a = await platformApiAuth(req, 'coupons');
  if ('response' in a) return a.response;

  const parsed = UpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErr('invalid_params', 'Tham số không hợp lệ.', 400);
  const safetyErr = couponSafetyError(parsed.data);
  if (safetyErr) return apiErr('coupon_unsafe', safetyErr, 400);

  const existed = await getCoupon(parsed.data.code);
  const coupon = await upsertCoupon(parsed.data);
  await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: existed ? 'coupon.update' : 'coupon.create', resource: 'coupon', resourceId: coupon.code, detail: { type: coupon.type, value: coupon.value, active: coupon.active }, ok: true, ip: a.ip });
  return apiOk({ coupon }, existed ? 200 : 201);
}

export async function DELETE(req: Request) {
  const a = await platformApiAuth(req, 'coupons');
  if ('response' in a) return a.response;

  const code = new URL(req.url).searchParams.get('code');
  if (!code) return apiErr('invalid_params', 'Thiếu tham số code.', 400);
  const existed = await getCoupon(code);
  if (!existed) return apiErr('not_found', 'Không tìm thấy coupon.', 404);
  await deleteCoupon(code);
  await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: 'coupon.delete', resource: 'coupon', resourceId: code.trim().toUpperCase(), ok: true, ip: a.ip });
  return apiOk({ deleted: code.trim().toUpperCase() });
}
