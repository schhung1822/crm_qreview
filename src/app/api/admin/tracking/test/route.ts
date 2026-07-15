import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { sendPurchaseEvent } from '@/lib/tracking/conversion';

export const dynamic = 'force-dynamic';

// POST → gửi 1 sự kiện Purchase TEST lên Conversion API để superadmin kiểm tra kết nối/token.
// Dùng test_event_code (nếu đã đặt) để hiện trong Test Events của Events Manager/TikTok.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;

  const rl = rateLimit(`trackingtest:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const result = await sendPurchaseEvent({
    eventId: `test_${Date.now().toString(36)}`,
    email: 'test@example.com',
    value: 1000,
    currency: 'VND',
    contentId: 'test',
  });
  return NextResponse.json({ ok: true, result });
}
