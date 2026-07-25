import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { ensureOrderActivated, getOrder, isPaidStatus } from '@/lib/billing/orders';

export const dynamic = 'force-dynamic';

// GET → trạng thái đơn của CHÍNH người dùng (để popup QR tự nhận biết đã thanh toán: qua webhook
// Sepay, admin kích hoạt tay, HOẶC đổi status thủ công trong bảng Order). Chỉ trả đơn thuộc về
// user hiện tại (tránh dò đơn người khác).
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  let order = id ? await getOrder(id) : null;
  if (!order || order.userId !== g.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  // Đơn đã ở trạng thái đã thanh toán (paid/paydone) nhưng CHƯA kích hoạt (đổi status thủ công) →
  // kích hoạt gói ngay tại đây, rồi báo popup thành công.
  if (isPaidStatus(order.status) && !order.paidAt) {
    order = (await ensureOrderActivated(order.id)) ?? order;
  }
  return NextResponse.json({ status: order.status, paid: isPaidStatus(order.status), paidAt: order.paidAt ?? null });
}
