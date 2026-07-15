import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { exchangeGmailCode } from '@/lib/email/gmail-oauth';
import {
  getPlatformGmailCreds,
  setPlatformGmailRefreshToken,
  setPlatformTransport,
} from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/platform-email/gmail-callback → Google gọi lại kèm ?code. Đổi code lấy refresh
// token, lưu (mã hóa), rồi chuyển phương thức gửi sang Gmail. Quay về trang admin kèm cờ kết quả.
export async function GET(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;

  const url = new URL(req.url);
  const origin = url.origin;
  const back = cookies().get('gmail_oauth_return')?.value || `${origin}/`;

  const finish = (params: string) => {
    const sep = back.includes('?') ? '&' : '?';
    const res = NextResponse.redirect(`${back}${sep}${params}`);
    res.cookies.set('gmail_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('gmail_oauth_return', '', { path: '/', maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => finish(`gmail_error=${encodeURIComponent(msg)}`);

  const err = url.searchParams.get('error');
  if (err) return fail(err);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = cookies().get('gmail_oauth_state')?.value;
  if (!code || !state || !saved || state !== saved) return fail('state-mismatch');

  const creds = await getPlatformGmailCreds();
  if (!creds) return fail('no-creds');

  const redirectUri = `${origin}/api/admin/platform-email/gmail-callback`;
  try {
    const { refreshToken } = await exchangeGmailCode(creds.clientId, creds.clientSecret, code, redirectUri);
    if (!refreshToken) return fail('no-refresh-token');
    await setPlatformGmailRefreshToken(refreshToken);
    await setPlatformTransport('gmail_oauth2'); // kết nối xong → dùng Gmail làm phương thức gửi
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 120) : 'exchange-failed');
  }
  return finish('gmail_connected=1');
}
