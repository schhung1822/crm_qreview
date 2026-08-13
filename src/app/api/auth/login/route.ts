import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { createSession } from '@/lib/auth/session';
import { isEmailVerified, toPublic, verifyCredentials } from '@/lib/auth/users';
import { clientIp } from '@/lib/security/rate-limit';
import {
  sharedClearRateLimit,
  sharedIsLimited,
  sharedRateLimit,
  sharedRecordFailure,
} from '@/lib/security/rate-limit-shared';
import { recordUserEvent } from '@/lib/tracking/events';
import { eventContext } from '@/lib/tracking/request';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  try {
    const rl = await sharedRateLimit(`login:${clientIp(req)}`, 10, 5 * 60 * 1000);
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

    const acctKey = `login:acct:${parsed.data.email.trim().toLowerCase()}`;
    const acct = await sharedIsLimited(acctKey, 20);
    if (acct.limited) {
      return NextResponse.json(
        { error: 'Tài khoản tạm thời bị khóa do quá nhiều lần đăng nhập sai. Thử lại sau ít phút.' },
        { status: 429, headers: { 'Retry-After': String(acct.retryAfter) } },
      );
    }

    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!user) {
      await sharedRecordFailure(acctKey, 15 * 60 * 1000);
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng' }, { status: 401 });
    }

    await sharedClearRateLimit(acctKey);
    if (!isEmailVerified(user)) {
      return NextResponse.json(
        { error: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.', unverified: true },
        { status: 403 },
      );
    }

    const { token, maxAge } = await createSession(user.id);
    const res = NextResponse.json({ user: toPublic(user) });
    setSessionCookie(res, token, maxAge);
    recordUserEvent({
      eventName: 'login',
      eventType: 'action',
      area: 'auth',
      success: true,
      ...eventContext(req, { userId: user.id }),
    });
    return res;
  } catch (error) {
    console.error('[api/auth/login] failed', error);
    return NextResponse.json(
      { error: 'Không thể đăng nhập lúc này. Vui lòng kiểm tra cấu hình server hoặc thử lại sau.' },
      { status: 500 },
    );
  }
}
