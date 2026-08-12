import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { consumeVerifyToken } from '@/lib/auth/email-verification';
import { createSession } from '@/lib/auth/session';
import { findById, markEmailVerified } from '@/lib/auth/users';
import { appLoginUrl } from '@/lib/email/mailer';
import { sendEventEmail } from '@/lib/store/platform-email';
import { clientIp } from '@/lib/security/rate-limit';
import { sharedRateLimit } from '@/lib/security/rate-limit-shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ token: z.string().min(1).max(200) });

// POST /api/auth/verify-email → kích hoạt tài khoản bằng token trong link email (?verify=<token>).
// Token một-lần 256-bit chứng minh kiểm soát email → sau khi kích hoạt, ĐĂNG NHẬP LUÔN (tạo phiên)
// cho mượt - không bắt người dùng gõ lại mật khẩu ngay sau khi vừa bấm link.
export async function POST(req: Request) {
  // Token 256-bit không thể đoán, nhưng vẫn chặn quét bừa cho sạch log.
  const rl = await sharedRateLimit(`verify-email:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Thiếu token kích hoạt.' }, { status: 400 });
  }

  const userId = await consumeVerifyToken(parsed.data.token);
  if (!userId) {
    return NextResponse.json(
      { error: 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.' },
      { status: 400 },
    );
  }
  // Kiểm active TRƯỚC khi kích hoạt: tài khoản bị vô hiệu hóa thì link cũ không cứu được.
  const existing = await findById(userId);
  if (!existing || !existing.active) {
    return NextResponse.json({ error: 'Tài khoản không khả dụng.' }, { status: 400 });
  }
  const user = await markEmailVerified(userId);
  if (!user) return NextResponse.json({ error: 'Tài khoản không khả dụng.' }, { status: 400 });

  // Email chào mừng gửi SAU khi kích hoạt (an toàn - không chặn nếu SMTP lỗi/tắt).
  const loginUrl = await appLoginUrl(req);
  void sendEventEmail('registered', user.email, {
    name: user.name,
    email: user.email,
    loginUrl,
  });

  const { token, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user });
  setSessionCookie(res, token, maxAge);
  // Như login: đặt biz đang hoạt động nếu có; user mới chưa có biz → onboarding lo tiếp.
  return res;
}
