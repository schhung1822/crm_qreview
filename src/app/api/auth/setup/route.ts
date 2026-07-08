import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/cookie';
import { createSession } from '@/lib/auth/session';
import { createUser, userCount } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

// POST /api/auth/setup → tạo tài khoản CHỦ SỞ HỮU đầu tiên. Chỉ chạy khi chưa có user.
export async function POST(req: Request) {
  if ((await userCount()) > 0) {
    return NextResponse.json({ error: 'Hệ thống đã được khởi tạo' }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email hợp lệ + mật khẩu ≥ 8 ký tự' }, { status: 400 });
  }
  // firstIsOwner: quyết định owner TRONG lock (đóng race nếu setup + register chạy đồng thời lúc
  // hệ thống rỗng). Nếu đã có user chen vào trước, người này thành viewer thay vì owner thứ hai.
  const user = await createUser({ ...parsed.data, role: 'owner', firstIsOwner: true });
  const { token, maxAge } = await createSession(user.id);
  const res = NextResponse.json({ user });
  setSessionCookie(res, token, maxAge);
  return res;
}
