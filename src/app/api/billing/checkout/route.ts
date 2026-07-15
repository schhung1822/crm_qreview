import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { claimCoupon, releaseCouponUse } from '@/lib/billing/coupons';
import { createOrder } from '@/lib/billing/orders';
import { readPlans } from '@/lib/billing/plans-store';
import { priceForMonths, type PlanId } from '@/lib/billing/plans';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getPaymentConfig, sepayQrUrl } from '@/lib/store/payment-config';
import { sendPlatformEvent } from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';

// Người dùng TỰ tạo đơn mua gói. Thanh toán qua Sepay là VND (chuyển khoản ngân hàng VN).
const Schema = z.object({
  plan: z.enum(['starter', 'pro', 'agency']),
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  couponCode: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
  utm: z
    .object({
      source: z.string().max(120).optional(),
      medium: z.string().max(120).optional(),
      campaign: z.string().max(120).optional(),
      content: z.string().max(120).optional(),
      term: z.string().max(120).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const rl = rateLimit(`checkout:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const { plan, months, couponCode, utm, phone } = parsed.data;

  // Giá VND theo gói + số tháng (chiết khấu bậc). Tính SERVER, không tin client.
  const p = (await readPlans())[plan as PlanId];
  const amount = priceForMonths(p.priceVndMonthly, months);

  // Áp coupon (nếu có) - CHIẾM lượt NGUYÊN TỬ ngay tại đây (chống race tự cấp gói 0đ). Nếu tạo đơn
  // thất bại sau khi đã chiếm → trả lại lượt.
  let discount = 0;
  let couponApplied: string | undefined;
  if (couponCode?.trim()) {
    const c = await claimCoupon(couponCode, plan as PlanId, amount, 'VND');
    if (!c.ok) return NextResponse.json({ error: c.reason ?? 'Mã giảm giá không hợp lệ' }, { status: 400 });
    discount = c.discount;
    couponApplied = couponCode.trim().toUpperCase();
  }

  let order;
  try {
    order = await createOrder({
      userId: g.user.id,
      userEmail: g.user.email,
      type: 'subscription',
      plan: plan as PlanId,
      months,
      currency: 'VND',
      amount,
      couponCode: couponApplied,
      discount,
      total: Math.max(0, amount - discount),
      phone: phone?.trim() || undefined,
      utm,
    });
  } catch (e) {
    if (couponApplied) await releaseCouponUse(couponApplied).catch(() => {});
    throw e;
  }

  // Đơn 0đ (mã giảm 100%) đã TỰ kích hoạt trong createOrder → trả success ngay, không cần Sepay.
  if (order.total <= 0 || order.status === 'paid') {
    return NextResponse.json({
      ok: true,
      order: { id: order.id, total: order.total, currency: order.currency },
      paid: true,
    });
  }

  // Thông tin thanh toán Sepay (QR + chuyển khoản) nếu đã bật.
  const pay = await getPaymentConfig();
  if (!pay.enabled || !pay.bankAccount) {
    return NextResponse.json({
      ok: true,
      order: { id: order.id, total: order.total, currency: order.currency },
      pay: { enabled: false },
    });
  }
  const content = `${pay.contentPrefix}${order.payCode}`;
  const qrUrl = sepayQrUrl(pay, order.total, content);
  void sendPlatformEvent('paymentPending', g.user.email, {
    name: g.user.name,
    plan,
    amount: order.total.toLocaleString('vi-VN'),
    currency: 'VND',
    bankCode: pay.bankCode,
    bankAccount: pay.bankAccount,
    accountHolder: pay.accountHolder,
    content,
    qrUrl,
    orderId: order.id,
  });

  return NextResponse.json({
    ok: true,
    order: { id: order.id, total: order.total, currency: order.currency },
    pay: {
      enabled: true,
      qrUrl,
      content,
      bankCode: pay.bankCode,
      bankAccount: pay.bankAccount,
      accountHolder: pay.accountHolder,
      amount: order.total,
    },
  });
}
