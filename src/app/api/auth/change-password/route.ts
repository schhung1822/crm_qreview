import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { setSessionCookie } from '@/lib/auth/cookie';
import { createSession, destroySessionsForUser } from '@/lib/auth/session';
import { setPassword, verifyCredentials } from '@/lib/auth/users';
import { clientIp } from '@/lib/security/rate-limit';
import { sharedRateLimit } from '@/lib/security/rate-limit-shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

// POST /api/auth/change-password → người dùng TỰ đổi mật khẩu của mình.
export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const rl = await sharedRateLimit(`changepw:${clientIp(req)}`, 10, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mật khẩu mới cần 8–128 ký tự.' }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  // Xác minh mật khẩu hiện tại.
  const ok = await verifyCredentials(g.user.email, currentPassword);
  if (!ok) return NextResponse.json({ error: 'Mật khẩu hiện tại không đúng.' }, { status: 400 });

  await setPassword(g.user.id, newPassword);
  // Vô hiệu hóa MỌI phiên cũ (kể cả các thiết bị khác) rồi cấp phiên mới cho phiên hiện tại
  // → thiết bị khác bị đăng xuất, thiết bị này vẫn đăng nhập.
  await destroySessionsForUser(g.user.id);
  const { token, maxAge } = await createSession(g.user.id);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token, maxAge);
  return res;
}
