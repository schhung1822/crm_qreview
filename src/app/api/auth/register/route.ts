import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { createSession } from '@/lib/auth/session';
import { createUser, userCount } from '@/lib/auth/users';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

// Cho phép tắt tự đăng ký bằng env (mặc định bật để giữ luồng đăng ký trên trang login).
const SELF_REGISTRATION_OFF = process.env.DISABLE_SELF_REGISTRATION === 'true';

// POST /api/auth/register → tạo tài khoản từ trang đăng nhập.
// - Tài khoản ĐẦU TIÊN → Chủ sở hữu (owner), toàn quyền.
// - Các tài khoản sau → mặc định "Chỉ xem" (viewer) cho an toàn; owner/admin nâng
//   quyền sau ở Quản lý nhân viên. Tránh việc tự đăng ký là có quyền đăng bài ngay.
export async function POST(req: Request) {
  // Chặn lạm dụng: tối đa 5 lần đăng ký / 10 phút / IP.
  const rl = rateLimit(`register:${clientIp(req)}`, 5, 10 * 60 * 1000);
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
  // Nếu tắt tự đăng ký: chỉ cho tạo tài khoản ĐẦU TIÊN (owner) qua đây.
  if (SELF_REGISTRATION_OFF && !isFirst) {
    return NextResponse.json(
      { error: 'Tự đăng ký đã tắt. Liên hệ quản trị viên để được tạo tài khoản.' },
      { status: 403 },
    );
  }
  try {
    const user = await createUser({ ...parsed.data, role: isFirst ? 'owner' : 'viewer' });
    const { token, maxAge } = await createSession(user.id);
    const res = NextResponse.json({ user, firstAccount: isFirst });
    setSessionCookie(res, token, maxAge);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không tạo được tài khoản' },
      { status: 400 },
    );
  }
}
