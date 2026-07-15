// Envelope phản hồi CHUẨN cho API quản trị nền tảng (/api/v1/admin/*).
//   thành công: { ok: true, data }        (HTTP 2xx)
//   lỗi:        { ok: false, error: { code, message } }  (HTTP 4xx/5xx)
import { NextResponse } from 'next/server';

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function apiErr(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
