// API QUẢN TRỊ NỀN TẢNG — ĐƠN HÀNG.
//   GET   /api/v1/admin/orders?status=&userId=&limit=   → danh sách đơn
//   GET   /api/v1/admin/orders/{id}                     → chi tiết 1 đơn (route [id])
//   PATCH /api/v1/admin/orders                          → đổi trạng thái đơn { id, status }
// Xác thực: Authorization: Bearer sga_... (scope 'orders').
// EMAIL: PATCH sang 'paid' đi qua setOrderStatus → tự KÍCH HOẠT gói + gửi email 'paymentReceived'
// + bắn Conversion API, GIỐNG HỆT khi thao tác trên giao diện (không bỏ qua side-effect).
import { z } from 'zod';
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { appendAudit } from '@/lib/store/admin-audit';
import { listOrders, setOrderStatus } from '@/lib/billing/orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const a = await platformApiAuth(req, 'orders');
  if ('response' in a) return a.response;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('userId');
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 200), 1000);

  let orders = await listOrders();
  if (status) orders = orders.filter((o) => o.status === status);
  if (userId) orders = orders.filter((o) => o.userId === userId);
  return apiOk({ orders: orders.slice(0, limit), total: orders.length });
}

const PatchSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['pending', 'paid', 'canceled', 'refunded']),
});

export async function PATCH(req: Request) {
  const a = await platformApiAuth(req, 'orders');
  if ('response' in a) return a.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErr('invalid_params', 'Tham số không hợp lệ (cần id + status).', 400);
  const { id, status } = parsed.data;

  // setOrderStatus: chuyển 'paid' lần đầu → kích hoạt gói/overage + tăng lượt coupon + email + CAPI.
  const order = await setOrderStatus(id, status);
  if (!order) {
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: 'order.status', resource: 'order', resourceId: id, detail: { status }, ok: false, error: 'not_found', ip: a.ip });
    return apiErr('not_found', 'Không tìm thấy đơn.', 404);
  }
  await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: 'order.status', resource: 'order', resourceId: id, detail: { status, activationError: order.activationError ?? null }, ok: true, ip: a.ip });
  return apiOk({ order });
}
