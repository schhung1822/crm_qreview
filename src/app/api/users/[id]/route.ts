import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { ASSIGNABLE_ROLES, CUSTOMIZABLE_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { destroySessionsForUser } from '@/lib/auth/session';
import { deleteUser, listUsers, updateUser } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
  name: z.string().min(1).max(120).optional(),
  // Quyền tùy chỉnh: mảng = đặt; null = về mặc định vai trò; vắng = không đổi.
  permissions: z.array(z.enum(CUSTOMIZABLE_PERMISSIONS as [string, ...string[]])).nullable().optional(),
});

// PATCH /api/users/[id] → đổi vai trò / khóa / đổi mật khẩu nhân viên.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('users:manage');
  if ('response' in g) return g.response;
  if (g.user.id === params.id) {
    return NextResponse.json({ error: 'Không thể tự đổi vai trò/khóa chính mình' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  try {
    await updateUser(params.id, {
      role: parsed.data.role as 'admin' | 'editor' | 'viewer' | undefined,
      active: parsed.data.active,
      password: parsed.data.password,
      name: parsed.data.name,
      permissions: parsed.data.permissions as Permission[] | null | undefined,
    });
    // Đổi mật khẩu / khóa / đổi vai trò → hủy mọi phiên cũ của user đó.
    // (Đổi quyền tùy chỉnh có hiệu lực ngay ở request kế tiếp, không cần hủy phiên.)
    if (parsed.data.password || parsed.data.active === false || parsed.data.role) {
      await destroySessionsForUser(params.id);
    }
    return NextResponse.json({ users: await listUsers() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 400 });
  }
}

// DELETE /api/users/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('users:manage');
  if ('response' in g) return g.response;
  if (g.user.id === params.id) {
    return NextResponse.json({ error: 'Không thể tự xóa chính mình' }, { status: 400 });
  }
  try {
    await deleteUser(params.id);
    await destroySessionsForUser(params.id);
    return NextResponse.json({ users: await listUsers() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 400 });
  }
}
