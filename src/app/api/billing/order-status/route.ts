import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { getOrder } from '@/lib/billing/orders';

export const dynamic = 'force-dynamic';

// GET → trạng thái đơn của CHÍNH người dùng (để popup QR tự nhận biết đã thanh toán: qua webhook
// Sepay hoặc admin kích hoạt tay). Chỉ trả đơn thuộc về user hiện tại (tránh dò đơn người khác).
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const order = id ? await getOrder(id) : null;
  if (!order || order.userId !== g.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ status: order.status, paidAt: order.paidAt ?? null });
}
