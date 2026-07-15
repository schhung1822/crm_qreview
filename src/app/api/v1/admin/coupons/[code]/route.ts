// API QUẢN TRỊ NỀN TẢNG — CHI TIẾT 1 COUPON.
//   GET /api/v1/admin/coupons/{code} → thông tin 1 coupon theo mã.
// Xác thực: Bearer sga_... (scope 'coupons').
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { getCoupon } from '@/lib/billing/coupons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const a = await platformApiAuth(req, 'coupons');
  if ('response' in a) return a.response;
  const coupon = await getCoupon(params.code);
  if (!coupon) return apiErr('not_found', 'Không tìm thấy coupon.', 404);
  return apiOk({ coupon });
}
