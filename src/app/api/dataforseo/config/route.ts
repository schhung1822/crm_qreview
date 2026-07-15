import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clearDataForSeoCreds, setDataForSeoCreds } from '@/lib/store/dataforseo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  login: z.string().min(3).max(200),
  password: z.string().min(3).max(400),
});

// POST /api/dataforseo/config → lưu credential (login + password) người dùng nhập (password mã hóa).
// Cấu hình credential trả phí là thao tác NHẠY CẢM → yêu cầu 'connections:manage' (không phải editor).
export async function POST(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Login / password không hợp lệ.' }, { status: 400 });
  }
  await setDataForSeoCreds(parsed.data.login, parsed.data.password);
  return NextResponse.json({ ok: true });
}

// DELETE /api/dataforseo/config → xóa credential.
export async function DELETE() {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  await clearDataForSeoCreds();
  return NextResponse.json({ ok: true });
}
