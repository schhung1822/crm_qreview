import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { exchangeCode, fetchEmail } from '@/lib/drive/client';
import { requestBaseUrl } from '@/lib/base-url';
import { getDriveCreds, saveDriveConnection } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/drive/callback → Google gọi lại kèm ?code&state. Đổi code lấy refresh_token, lưu, rồi
// quay về trang cũ kèm ?drive=connected|error để UI báo.
export async function GET(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  // Phải KHỚP redirectUri đã dùng ở /api/drive/auth (dùng APP_URL, không phải req.url = http sau proxy).
  const origin = requestBaseUrl(req);
  const jar = await cookies();
  const back = jar.get('drive_return')?.value || `${origin}/`;
  const savedState = jar.get('drive_oauth_state')?.value;

  const sep = back.includes('?') ? '&' : '?';
  const fail = () => {
    const res = NextResponse.redirect(`${back}${sep}drive=error`);
    res.cookies.set('drive_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('drive_return', '', { path: '/', maxAge: 0 });
    return res;
  };

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const creds = await getDriveCreds();
  if (creds.source === 'none' || !code || !state || !savedState || state !== savedState) return fail();

  try {
    const redirectUri = `${origin}/api/drive/callback`;
    const tok = await exchangeCode(creds, code, redirectUri);
    if (!tok.refresh_token) return fail(); // không có refresh_token (đã cấp trước) → coi như lỗi, thử lại
    const email = await fetchEmail(tok.access_token);
    await saveDriveConnection(tok.refresh_token, email);
    const res = NextResponse.redirect(`${back}${sep}drive=connected`);
    res.cookies.set('drive_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('drive_return', '', { path: '/', maxAge: 0 });
    return res;
  } catch {
    return fail();
  }
}
