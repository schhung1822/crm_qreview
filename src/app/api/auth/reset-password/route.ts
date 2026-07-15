import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeResetToken } from '@/lib/auth/password-reset';
import { destroySessionsForUser } from '@/lib/auth/session';
import { setPassword } from '@/lib/auth/users';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8).max(128),
});

// POST /api/auth/reset-password → đặt mật khẩu mới bằng TOKEN từ email (một-lần, có hạn).
// Không cần đăng nhập (người dùng quên mật khẩu), nhưng phải có token hợp lệ → chứng minh kiểm soát email.
export async function POST(req: Request) {
  const rl = rateLimit(`resetpw:${clientIp(req)}`, 10, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mật khẩu mới cần 8–128 ký tự.' }, { status: 400 });
  }

  const userId = await consumeResetToken(parsed.data.token);
  if (!userId) {
    return NextResponse.json(
      { error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.' },
      { status: 400 },
    );
  }

  await setPassword(userId, parsed.data.newPassword);
  // Vô hiệu hóa mọi phiên cũ (kể cả phiên kẻ tấn công nếu đã lộ mật khẩu cũ).
  await destroySessionsForUser(userId);
  return NextResponse.json({ ok: true });
}
