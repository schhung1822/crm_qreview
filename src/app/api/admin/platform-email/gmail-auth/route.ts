import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { buildGmailAuthUrl } from '@/lib/email/gmail-oauth';
import { getPlatformGmailCreds } from '@/lib/store/platform-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/platform-email/gmail-auth → chuyển hướng tới màn hình đồng ý của Google để lấy
// refresh token cho Gmail (gửi email hệ thống). Chỉ superadmin. Lưu state (chống CSRF) + trang
// quay về vào cookie httpOnly.
export async function GET(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;

  const creds = await getPlatformGmailCreds();
  if (!creds) {
    return NextResponse.json(
      { error: 'Chưa nhập Client ID/Client Secret Gmail. Lưu cấu hình Gmail trước.' },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/admin/platform-email/gmail-callback`;
  const state = randomUUID();
  // Trang quay về sau OAuth: CHỈ nhận referer cùng origin (chống open-redirect ra site ngoài).
  let back = `${origin}/`;
  try {
    const r = new URL(req.headers.get('referer') ?? '');
    if (r.origin === origin) back = r.href;
  } catch {
    /* referer rỗng/không hợp lệ → dùng mặc định */
  }

  const res = NextResponse.redirect(
    buildGmailAuthUrl(creds.clientId, redirectUri, state, creds.senderEmail),
  );
  const secure = origin.startsWith('https');
  res.cookies.set('gmail_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 });
  res.cookies.set('gmail_oauth_return', back, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 });
  return res;
}
