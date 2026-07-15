import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createVerifyToken } from '@/lib/auth/email-verification';
import { findByEmail, isEmailVerified } from '@/lib/auth/users';
import { appLoginUrl } from '@/lib/email/mailer';
import { sendEventEmail } from '@/lib/store/platform-email';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(254) });

// POST /api/auth/resend-verification → gửi lại LINK KÍCH HOẠT cho tài khoản chưa xác thực.
// Như forgot-password: luôn trả { ok:true } (không lộ email nào tồn tại / trạng thái xác thực).
export async function POST(req: Request) {
  const rl = rateLimit(`resend-verify:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 });

  const user = await findByEmail(parsed.data.email);
  // Chỉ gửi khi tài khoản tồn tại, còn hoạt động và CHƯA xác thực (đã xác thực thì không có gì để gửi).
  if (user && user.active && !isEmailVerified(user)) {
    const loginUrl = await appLoginUrl(req);
    const token = await createVerifyToken(user.id); // vô hiệu link cũ - chỉ link mới nhất còn hiệu lực
    const verifyUrl = `${loginUrl}?verify=${token}`;
    await sendEventEmail('verifyEmail', user.email, {
      name: user.name,
      email: user.email,
      verifyUrl,
      loginUrl,
    });
  }

  // Luôn trả về thông báo chung để không tiết lộ email nào có trong hệ thống.
  return NextResponse.json({ ok: true });
}
