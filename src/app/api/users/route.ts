import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { ASSIGNABLE_ROLES, CUSTOMIZABLE_PERMISSIONS } from '@/lib/auth/permissions';
import { createUser, listUsers } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

// GET /api/users → danh sách nhân viên (cần quyền users:manage).
export async function GET() {
  const g = await guard('users:manage');
  if ('response' in g) return g.response;
  return NextResponse.json({ users: await listUsers() });
}

const CreateSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  // Quyền tùy chỉnh (tùy chọn) - chỉ áp cho editor/viewer.
  permissions: z.array(z.enum(CUSTOMIZABLE_PERMISSIONS as [string, ...string[]])).optional(),
});

// POST /api/users → tạo nhân viên mới.
export async function POST(req: Request) {
  const g = await guard('users:manage');
  if ('response' in g) return g.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Email hợp lệ, tên, mật khẩu ≥ 8 ký tự, vai trò admin/editor/viewer' },
      { status: 400 },
    );
  }
  try {
    const user = await createUser({
      ...parsed.data,
      role: parsed.data.role as 'admin' | 'editor' | 'viewer',
      permissions: parsed.data.permissions as import('@/lib/auth/permissions').Permission[] | undefined,
    });
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tạo người dùng' },
      { status: 400 },
    );
  }
}
