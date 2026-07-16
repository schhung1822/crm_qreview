import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { consumeVerifyToken, createVerifyToken } from '@/lib/auth/email-verification';
import { createSession } from '@/lib/auth/session';
import { isSuperadminEmail } from '@/lib/auth/superadmin';
import { createUser, markEmailVerified, userCount } from '@/lib/auth/users';
import { appLoginUrl } from '@/lib/email/mailer';
import { sendEventEmail } from '@/lib/store/platform-email';
import { getSelfRegistrationEnabled } from '@/lib/store/platform-settings';
import { clientIp } from '@/lib/security/rate-limit';
import { sharedRateLimit } from '@/lib/security/rate-limit-shared';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

// POST /api/auth/register → tạo tài khoản từ trang đăng nhập.
// - Tài khoản ĐẦU TIÊN → Chủ sở hữu (owner), toàn quyền.
// - Các tài khoản sau → mặc định "Chỉ xem" (viewer) cho an toàn; owner/admin nâng
//   quyền sau ở Quản lý nhân viên. Tránh việc tự đăng ký là có quyền đăng bài ngay.
export async function POST(req: Request) {
  // Chặn lạm dụng: tối đa 5 lần đăng ký / 10 phút / IP.
  const rl = await sharedRateLimit(`register:${clientIp(req)}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều lần đăng ký. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email hợp lệ + mật khẩu 8–128 ký tự' }, { status: 400 });
  }
  const isFirst = (await userCount()) === 0;
  // BẢO MẬT: KHÔNG cho tự đăng ký bằng email superadmin (trừ tài khoản đầu tiên = bootstrap chủ nền
  // tảng). Chặn kẻ xấu "chiếm chỗ" email superadmin trước khi chủ thật kịp tạo tài khoản.
  if (!isFirst && isSuperadminEmail(parsed.data.email)) {
    return NextResponse.json(
      { error: 'Email này không thể tự đăng ký. Liên hệ quản trị viên.' },
      { status: 403 },
    );
  }
  // Nếu tắt tự đăng ký (superadmin tắt trong UI, hoặc env): chỉ cho tạo tài khoản ĐẦU TIÊN (owner).
  if (!isFirst && !(await getSelfRegistrationEnabled())) {
    return NextResponse.json(
      { error: 'Tự đăng ký đã tắt. Liên hệ quản trị viên để được tạo tài khoản.' },
      { status: 403 },
    );
  }
  try {
    // Vai trò owner-đầu-tiên được quyết định LẠI trong lock của createUser (firstIsOwner) để đóng
    // race; isFirst ở trên chỉ dùng cho thông báo/kiểm superadmin, không phải nguồn chân lý.
    // Tự đăng ký → emailVerified=false (phải kích hoạt qua email); tài khoản ĐẦU TIÊN được
    // createUser tự ép verified (bootstrap - lúc đó SMTP nền tảng chưa thể cấu hình).
    let user = await createUser({
      ...parsed.data,
      role: 'viewer',
      firstIsOwner: true,
      emailVerified: false,
    });
    const loginUrl = await appLoginUrl(req);

    // ── Bước xác thực email (chỉ khi user chưa verified) ──
    if (user.emailVerified === false) {
      const verifyToken = await createVerifyToken(user.id);
      // Link mở trang đăng nhập ở chế độ "kích hoạt tài khoản" (login page tự nhận query ?verify=).
      const verifyUrl = `${loginUrl}?verify=${verifyToken}`;
      const sent = await sendEventEmail('verifyEmail', user.email, {
        name: user.name,
        email: user.email,
        verifyUrl,
        loginUrl,
      });
      if (sent.sent) {
        // Đã gửi link kích hoạt: KHÔNG tạo phiên - user phải bấm link trong email trước.
        return NextResponse.json({ requiresVerification: true, email: user.email });
      }
      if (sent.skipped) {
        // Email nền tảng TẮT/chưa cấu hình (self-host, dev...) → không thể xác thực qua email.
        // Kích hoạt luôn để không khóa người dùng ngoài hệ thống. Tiêu hủy token vừa tạo
        // (không dùng đến) để store không tồn dòng mồ côi.
        void consumeVerifyToken(verifyToken);
        user = (await markEmailVerified(user.id)) ?? user;
      } else {
        // SMTP LỖI tạm thời: vẫn yêu cầu xác thực (user bấm "gửi lại" ở trang đăng nhập) -
        // không hạ chuẩn bảo mật chỉ vì một lần gửi lỗi.
        return NextResponse.json({
          requiresVerification: true,
          email: user.email,
          emailError: true,
        });
      }
    }

    // ── Đường verified (tài khoản đầu tiên, hoặc email nền tảng chưa bật) ──
    const { token, maxAge } = await createSession(user.id);
    // Email chào mừng (an toàn - không chặn nếu SMTP lỗi/tắt).
    void sendEventEmail('registered', user.email, {
      name: user.name,
      email: user.email,
      loginUrl,
    });
    const res = NextResponse.json({ user, firstAccount: isFirst });
    setSessionCookie(res, token, maxAge);
    // KHÔNG tạo biz ở đây: tài khoản mới phải qua onboarding tự tạo biz trước (biz là phạm vi lớn nhất).
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không tạo được tài khoản' },
      { status: 400 },
    );
  }
}
