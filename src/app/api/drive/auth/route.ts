import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { buildAuthUrl } from '@/lib/drive/client';
import { requestBaseUrl } from '@/lib/base-url';
import { getDriveCreds } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/drive/auth → chuyển hướng tới màn hình đồng ý của Google (OAuth2).
// Lưu state (chống CSRF) + trang quay về vào cookie httpOnly.
export async function GET(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  const creds = await getDriveCreds();
  if (creds.source === 'none' || !creds.clientId) {
    return NextResponse.json(
      { error: 'Chưa có OAuth credential Google Drive. Nhập Client ID/Secret trước.' },
      { status: 400 },
    );
  }
  // Redirect URI PHẢI khớp cái đăng ký ở Google Console và PHẢI là https ở production. Sau
  // Cloudflare/nginx, new URL(req.url).origin ra http://... → Google chặn (invalid_request). Ưu
  // tiên APP_URL (https://demo.noti.vn) đã cấu hình; chỉ fallback req.url cho dev không đặt APP_URL.
  const origin = requestBaseUrl(req);
  const redirectUri = `${origin}/api/drive/callback`;
  const state = randomUUID();
  // Trang quay về sau OAuth: CHỈ nhận referer cùng origin (chống open-redirect ra site ngoài).
  let back = `${origin}/`;
  try {
    const r = new URL(req.headers.get('referer') ?? '');
    if (r.origin === origin) back = r.href;
  } catch {
    /* referer rỗng/không hợp lệ → dùng mặc định */
  }

  const res = NextResponse.redirect(buildAuthUrl(creds.clientId, redirectUri, state));
  const secure = origin.startsWith('https');
  res.cookies.set('drive_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 });
  res.cookies.set('drive_return', back, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 });
  return res;
}
