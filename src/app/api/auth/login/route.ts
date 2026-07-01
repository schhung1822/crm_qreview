import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { createSession } from '@/lib/auth/session';
import { toPublic, verifyCredentials } from '@/lib/auth/users';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// POST /api/auth/login
export async function POST(req: Request) {
  // Chống brute-force + DoS scrypt: tối đa 10 lần thử / 5 phút / IP.
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
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
  }
  const { token, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ user: toPublic(user) });
  setSessionCookie(res, token, maxAge);
  return res;
}
