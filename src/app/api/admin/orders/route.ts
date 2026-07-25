import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { findById } from '@/lib/auth/users';
import { claimCoupon, releaseCouponUse } from '@/lib/billing/coupons';
import { createOrder, ensureOrderActivated, isPaidStatus, listOrders, setOrderStatus } from '@/lib/billing/orders';
import { readPlans } from '@/lib/billing/plans-store';
import { priceForMonths, type PlanId } from '@/lib/billing/plans';
import { getPaymentConfig, sepayQrUrl } from '@/lib/store/payment-config';
import { sendPlatformEvent } from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';

const PLAN_IDS = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  // ĐỒNG BỘ: đơn bị đổi status thủ công sang paid/paydone mà chưa kích hoạt → kích hoạt ngay khi
  // admin mở danh sách (không phụ thuộc người mua có đang mở popup hay không).
  const orders = await listOrders();
  const pendingActivation = orders.filter((o) => isPaidStatus(o.status) && !o.paidAt);
  if (pendingActivation.length) {
    await Promise.all(pendingActivation.map((o) => ensureOrderActivated(o.id).catch(() => null)));
    return NextResponse.json({ orders: await listOrders() });
  }
  return NextResponse.json({ orders });
}

const CreateSchema = z.object({
  userId: z.string().min(1).max(64),
  type: z.enum(['subscription', 'overage']),
  plan: z.enum(PLAN_IDS).optional(),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
  overageArticles: z.number().int().min(1).max(1_000_000).optional(),
  amount: z.number().min(0).max(1_000_000_000).optional(), // với overage (hoặc ghi đè)
  couponCode: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  markPaid: z.boolean().optional(), // tạo và đánh dấu đã thanh toán ngay (gán gói thủ công)
});

// POST → tạo đơn: tính giá theo gói + áp coupon. markPaid=true → kích hoạt gói luôn.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const d = parsed.data;
  const user = await findById(d.userId);
  if (!user) return NextResponse.json({ error: 'Không tìm thấy người dùng', code: 'errUserNotFound' }, { status: 404 });

  // Gói cước CHỈ dùng VND (thanh toán Sepay). Giá subscription theo gói + số tháng (chiết khấu bậc);
  // overage → admin nhập amount.
  let amount = d.amount ?? 0;
  const plan = (d.plan ?? 'pro') as PlanId;
  const months = d.months ?? 3;
  if (d.type === 'subscription') {
    const p = (await readPlans())[plan];
    amount = d.amount ?? priceForMonths(p.priceVndMonthly, months);
  }

  // Áp coupon (nếu có) - CHIẾM lượt NGUYÊN TỬ (nhất quán với checkout; chống vượt maxUses).
  let discount = 0;
  let couponApplied: string | undefined;
  if (d.couponCode) {
    const c = await claimCoupon(d.couponCode, plan, amount, 'VND');
    if (!c.ok) return NextResponse.json({ error: c.reason ?? 'Mã giảm giá không hợp lệ' }, { status: 400 });
    discount = c.discount;
    couponApplied = d.couponCode.trim().toUpperCase();
  }

  let order;
  try {
    order = await createOrder({
      userId: d.userId,
      userEmail: user.email,
      type: d.type,
      plan: d.type === 'subscription' ? plan : undefined,
      months: d.type === 'subscription' ? months : undefined,
      overageArticles: d.type === 'overage' ? d.overageArticles : undefined,
      currency: 'VND',
      amount,
      couponCode: couponApplied,
      discount,
      total: Math.max(0, amount - discount),
      note: d.note,
    });
  } catch (e) {
    if (couponApplied) await releaseCouponUse(couponApplied).catch(() => {});
    throw e;
  }

  if (d.markPaid) {
    const paid = await setOrderStatus(order.id, 'paid');
    return NextResponse.json({ ok: true, order: paid ?? order });
  }

  // Đơn CHỜ thanh toán: nếu đã bật Sepay → sinh nội dung CK + QR, gửi email hướng dẫn (nếu bật).
  const pay = await getPaymentConfig();
  let payInfo: { content: string; qrUrl: string } | undefined;
  if (pay.enabled && pay.bankAccount) {
    const content = order.payCode; // orderNumber = payCode
    const qrUrl = sepayQrUrl(pay, order.total, content);
    payInfo = { content, qrUrl };
    void sendPlatformEvent('paymentPending', order.userEmail, {
      name: user.name,
      plan: order.plan ?? 'overage',
      amount: order.total.toLocaleString('vi-VN'),
      currency: order.currency,
      bankCode: pay.bankCode,
      bankAccount: pay.bankAccount,
      accountHolder: pay.accountHolder,
      content,
      qrUrl,
      orderId: order.id,
    });
  }
  return NextResponse.json({ ok: true, order, pay: payInfo });
}

const PatchSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['pending', 'paid', 'canceled', 'refunded']),
});

// PATCH → đổi trạng thái đơn (paid → kích hoạt gói/cộng overage + tăng lượt coupon).
export async function PATCH(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const order = await setOrderStatus(parsed.data.id, parsed.data.status);
  if (!order) return NextResponse.json({ error: 'Không tìm thấy đơn', code: 'errOrderNotFound' }, { status: 404 });
  return NextResponse.json({ ok: true, order });
}
