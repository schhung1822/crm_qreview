import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createResetToken } from '@/lib/auth/password-reset';
import { findByEmail } from '@/lib/auth/users';
import { appLoginUrl } from '@/lib/email/mailer';
import { sendEventEmail } from '@/lib/store/platform-email';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(254) });

// POST /api/auth/forgot-password → gửi LINK ĐẶT LẠI MẬT KHẨU (token một-lần, hết hạn) về email.
// BẢO MẬT: KHÔNG đổi mật khẩu ở bước này (tránh bị ép reset tài khoản người khác), KHÔNG gửi mật
// khẩu plaintext. Mật khẩu chỉ đổi khi người dùng bấm link + tự đặt mật khẩu mới (/api/auth/reset-password).
// Luôn trả { ok:true } (không lộ email nào tồn tại trong hệ thống).
export async function POST(req: Request) {
  const rl = rateLimit(`forgot:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 });

  const user = await findByEmail(parsed.data.email);
  if (user && user.active) {
    const loginUrl = await appLoginUrl(req);
    const token = await createResetToken(user.id);
    // Link mở trang đăng nhập ở chế độ "đặt lại mật khẩu" (login page tự nhận query ?reset=).
    const resetUrl = `${loginUrl}?reset=${token}`;
    // Fire nếu email nền tảng đã bật; nếu chưa cấu hình sendEventEmail tự bỏ qua (res.sent=false).
    await sendEventEmail('forgotPassword', user.email, {
      name: user.name,
      email: user.email,
      resetUrl,
      loginUrl,
    });
  }

  // Luôn trả về thông báo chung để không tiết lộ email nào có trong hệ thống.
  return NextResponse.json({ ok: true });
}
