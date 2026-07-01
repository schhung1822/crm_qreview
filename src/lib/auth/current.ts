// Lấy user hiện tại + chốt chặn quyền cho API. Server-only (route handler / server component).
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { canWith, effectivePermissions, type Permission, type Role } from './permissions';
import { SESSION_COOKIE, getSessionUserId } from './session';
import { findById } from './users';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  // Tập quyền hiệu lực (đã tính từ vai trò + tùy chỉnh) - dùng để chốt chặn & gạn nav.
  permissions: Permission[];
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const userId = await getSessionUserId(token);
  if (!userId) return null;
  const u = await findById(userId);
  if (!u || !u.active) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    permissions: effectivePermissions(u.role, u.permissions ?? null),
  };
}

export type Guard = { user: AuthUser } | { response: NextResponse };

// Dùng trong route: const g = await guard('perm'); if ('response' in g) return g.response;
export async function guard(permission?: Permission): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  if (permission && !canWith(user.permissions, permission)) {
    return { response: NextResponse.json({ error: 'Không đủ quyền' }, { status: 403 }) };
  }
  return { user };
}
