import { NextResponse } from 'next/server';
import { findPendingOrderByContent, setOrderStatus } from '@/lib/billing/orders';
import { verifySepayWebhook } from '@/lib/billing/sepay-webhook-auth';
import { getPaymentConfig } from '@/lib/store/payment-config';
import { recordPaymentTransaction } from '@/lib/tracking/billing-events';

export const dynamic = 'force-dynamic';

// POST /api/webhooks/sepay — Sepay gọi khi có biến động số dư (chuẩn Sepay).
// Xác thực: API Key (Authorization: Apikey <key>) HOẶC HMAC-SHA256 (chữ ký raw body ở header cấu hình).
// Trả {"success": true} (HTTP 200) trong 30s. Khớp nội dung CK → đơn ĐANG CHỜ → đánh dấu đã thanh toán.
export async function POST(req: Request) {
  const cfg = await getPaymentConfig();

  // Đọc RAW body trước (HMAC phải ký đúng byte gốc; JSON.parse lại sau khi xác thực).
  const rawBody = await req.text();

  // FAIL-CLOSED: chưa cấu hình secret → 503; sai token/chữ ký → 401.
  const auth = verifySepayWebhook(cfg, {
    authorization: req.headers.get('authorization'),
    signature: req.headers.get(cfg.signatureHeader),
  }, rawBody);
  if (auth === 'not-configured') {
    return NextResponse.json({ success: false, error: 'webhook-not-configured' }, { status: 503 });
  }
  if (auth !== 'ok') {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as {
        id?: string | number;
        gateway?: string;
        transactionDate?: string;
        transferType?: string;
        content?: string;
        transferAmount?: number;
        accountNumber?: string;
        referenceCode?: string;
      };
    } catch {
      return null;
    }
  })();
  if (!body) return NextResponse.json({ success: false }, { status: 400 });

  // Chỉ xử lý tiền VÀO.
  if (body.transferType && body.transferType !== 'in') {
    return NextResponse.json({ success: true });
  }

  // Nếu .env chỉ định STK nhận (SEPAY_WEBHOOK_EXPECTED_ACCOUNT_NUMBER) → chỉ nhận giao dịch vào
  // đúng tài khoản đó (bỏ qua tài khoản khác dùng chung webhook). Vẫn ack để Sepay không retry.
  const expectedAcc = (process.env.SEPAY_WEBHOOK_EXPECTED_ACCOUNT_NUMBER ?? '').trim();
  if (expectedAcc && body.accountNumber && String(body.accountNumber).trim() !== expectedAcc) {
    return NextResponse.json({ success: true });
  }

  const order = await findPendingOrderByContent(body.content ?? '');
  if (order && order.currency === 'VND') {
    const amount = Number(body.transferAmount ?? 0);
    const enough = Number.isFinite(amount) && amount > 0 && amount >= order.total;
    if (enough) {
      await setOrderStatus(order.id, 'paid'); // kích hoạt gói + email biên nhận (nếu bật)
    }
    // Đối soát: ghi giao dịch (đủ tiền = success, thiếu = underpaid) để theo dõi/khớp sổ.
    recordPaymentTransaction({
      orderId: order.id,
      provider: 'sepay',
      providerTransactionId: body.id != null ? String(body.id) : (body.referenceCode ?? undefined),
      status: enough ? 'success' : 'underpaid',
      currency: order.currency,
      amount,
      matchedAmount: order.total,
      payCode: order.payCode,
      bankCode: body.gateway,
      bankAccount: body.accountNumber,
      transferContent: body.content ?? undefined,
      rawPayload: body,
      processedAt: enough ? new Date() : undefined,
    });
  }
  // Luôn ack để Sepay không retry (đã ghi nhận webhook).
  return NextResponse.json({ success: true });
}
