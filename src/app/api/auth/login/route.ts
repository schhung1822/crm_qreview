import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setBizCookie, setSessionCookie } from '@/lib/auth/cookie';
import { createSession } from '@/lib/auth/session';
import { isEmailVerified, toPublic, verifyCredentials } from '@/lib/auth/users';
import { clearRateLimit, clientIp, isLimited, rateLimit, recordFailure } from '@/lib/security/rate-limit';
import { ensureMigrated, resolveActiveBiz } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// POST /api/auth/login
export async function POST(req: Request) {
  // (a) Chống brute-force + DoS scrypt theo IP: tối đa 10 lần thử / 5 phút / IP (mọi lần thử đều tính).
  const rl = rateLimit(`login:${clientIp(req)}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Quá nhiều lần đăng nhập sai. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Thiếu email/mật khẩu' }, { status: 400 });
  }

  // (b) Khóa mềm theo TÀI KHOẢN (email): chống brute-force PHÂN TÁN qua nhiều IP cùng nhắm 1 email
  //     (rate-limit theo IP không chặn được). Đếm CHỈ khi đăng nhập sai; đăng nhập đúng sẽ reset.
  const acctKey = `login:acct:${parsed.data.email.trim().toLowerCase()}`;
  const acct = isLimited(acctKey, 20); // >=20 lần sai trong 15 phút → tạm khóa tài khoản
  if (acct.limited) {
    return NextResponse.json(
      { error: 'Tài khoản tạm thời bị khóa do quá nhiều lần đăng nhập sai. Thử lại sau ít phút.' },
      { status: 429, headers: { 'Retry-After': String(acct.retryAfter) } },
    );
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    recordFailure(acctKey, 15 * 60 * 1000); // ghi 1 lần thất bại cho tài khoản
    return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }
  clearRateLimit(acctKey); // đăng nhập đúng → xóa bộ đếm thất bại của tài khoản
  // Tài khoản tự đăng ký nhưng CHƯA bấm link kích hoạt trong email → chưa cho đăng nhập.
  // Chỉ báo sau khi mật khẩu ĐÚNG (không lộ trạng thái xác thực cho người không có mật khẩu).
  // `unverified: true` để UI hiện nút "gửi lại email kích hoạt".
  if (!isEmailVerified(user)) {
    return NextResponse.json(
      { error: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.', unverified: true },
      { status: 403 },
    );
  }
  const { token, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ user: toPublic(user) });
  setSessionCookie(res, token, maxAge);
  // Đặt biz đang hoạt động (cookie sg_biz) để store trỏ đúng ngay từ request đầu sau login.
  // Nếu user CHƯA có biz nào → không đặt cookie; layout sẽ đưa họ qua onboarding tạo biz.
  await ensureMigrated();
  const { bizId } = await resolveActiveBiz(user.id);
  if (bizId) setBizCookie(res, bizId);
  return res;
}
