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

// Cookie chọn biz đang hoạt động (server-read qua guard). httpOnly để client không sửa tay.
export function setBizCookie(res: NextResponse, bizId: string): void {
  res.cookies.set('sg_biz', bizId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
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
