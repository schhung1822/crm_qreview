// API QUẢN TRỊ NỀN TẢNG — CHI TIẾT 1 ĐƠN HÀNG.
//   GET /api/v1/admin/orders/{id} → thông tin đầy đủ 1 đơn.
// Xác thực: Bearer sga_... (scope 'orders').
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { getOrder } from '@/lib/billing/orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await platformApiAuth(req, 'orders');
  if ('response' in a) return a.response;
  const order = await getOrder(params.id);
  if (!order) return apiErr('not_found', 'Không tìm thấy đơn.', 404);
  return apiOk({ order });
}
