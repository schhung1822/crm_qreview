import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/cookie';
import { SESSION_COOKIE, destroySession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
export async function POST() {
  await destroySession(cookies().get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
