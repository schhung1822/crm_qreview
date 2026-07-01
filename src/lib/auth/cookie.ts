// Tiện ích set/clear cookie phiên trên NextResponse.
import type { NextResponse } from 'next/server';
import { SESSION_COOKIE } from './session';

export function setSessionCookie(res: NextResponse, token: string, maxAge: number): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
