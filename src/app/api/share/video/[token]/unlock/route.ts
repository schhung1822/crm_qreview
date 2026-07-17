// POST /api/share/video/<token>/unlock → nhận mật khẩu (form hoặc JSON), đúng thì đặt cookie "đã mở
// khóa" rồi chuyển về /share/video/<token>. Chống dò mật khẩu bằng rate-limit.
import { NextResponse } from 'next/server';
import { requestBaseUrl } from '@/lib/base-url';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import {
  shareAccessCookieName,
  shareAccessValue,
  verifySharePassword,
} from '@/lib/store/script-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  // Redirect PHẢI là URL công khai. Sau Cloudflare/nginx, req.url = http://0.0.0.0:3000 → dùng APP_URL.
  const origin = requestBaseUrl(req);
  const back = `${origin}/share/video/${token}`;
  if (!TOKEN_RE.test(token)) return NextResponse.redirect(origin, 303);

  const rl = rateLimit(`vshareunlock:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.redirect(`${back}?e=rate`, 303);

  let password = '';
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const b = (await req.json().catch(() => null)) as { password?: string } | null;
    password = typeof b?.password === 'string' ? b.password : '';
  } else {
    const f = await req.formData().catch(() => null);
    const v = f?.get('password');
    password = typeof v === 'string' ? v : '';
  }

  if (!(await verifySharePassword(token, password))) {
    return NextResponse.redirect(`${back}?e=1`, 303);
  }

  const res = NextResponse.redirect(back, 303);
  res.cookies.set(shareAccessCookieName(token), shareAccessValue(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/share/video/${token}`,
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  });
  return res;
}
