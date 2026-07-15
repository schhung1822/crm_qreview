import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { getPaymentConfigPublic, savePaymentConfig } from '@/lib/store/payment-config';

export const dynamic = 'force-dynamic';

// GET → cấu hình Sepay công khai (không lộ apiKey) + đường dẫn webhook để dán vào Sepay.
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json({ ...(await getPaymentConfigPublic()), webhookPath: '/api/webhooks/sepay' });
}

const Schema = z.object({
  enabled: z.boolean().optional(),
  bankAccount: z.string().max(40).optional(),
  bankCode: z.string().max(20).optional(),
  accountHolder: z.string().max(120).optional(),
  authMethod: z.enum(['apikey', 'hmac']).optional(),
  apiKey: z.string().max(200).optional(), // rỗng = giữ key cũ
  hmacSecret: z.string().max(200).optional(), // rỗng = giữ secret cũ
  signatureHeader: z.string().max(64).optional(),
  contentPrefix: z.string().max(12).optional(),
});

// POST → lưu cấu hình Sepay (STK, ngân hàng, chủ TK, API key webhook, tiền tố nội dung).
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  await savePaymentConfig(parsed.data);
  return NextResponse.json({ ok: true });
}
