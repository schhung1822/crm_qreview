import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from '../env';
import { canWith, effectivePermissions, type Permission, type Role } from './permissions';
import { SESSION_COOKIE, getSessionUserId } from './session';
import { findById } from './users';

// Giữ export trong giai đoạn dọn code cũ; ứng dụng không còn đọc/ghi cookie Biz.
export const BIZ_COOKIE = 'sg_biz';

async function sameOriginOk(): Promise<boolean> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const acceptable = new Set<string>();
  const host = h.get('host');
  if (host) acceptable.add(host);
  const forwardedHost = h.get('x-forwarded-host');
  if (forwardedHost) forwardedHost.split(',').forEach((value) => acceptable.add(value.trim()));
  if (env.appUrl) {
    try {
      acceptable.add(new URL(env.appUrl).host);
    } catch {}
  }
  return acceptable.has(originHost);
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await getSessionUserId(token);
  if (!userId) return null;
  const user = await findById(userId);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: effectivePermissions(user.role, user.permissions ?? null),
  };
}

// bizId/bizRole được giữ tạm trong kiểu trả về để các API không liên quan có thể
// tiếp tục hoạt động trong lúc xóa dần lớp multi-tenant.
export type Guard =
  | { user: AuthUser; bizId: string; bizRole: Role; permissions: Permission[] }
  | { response: NextResponse };

export async function guard(permission?: Permission): Promise<Guard> {
  if (!(await sameOriginOk())) {
    return { response: NextResponse.json({ error: 'Yêu cầu bị từ chối (nguồn không hợp lệ).' }, { status: 403 }) };
  }
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  if (permission && !canWith(user.permissions, permission)) {
    return { response: NextResponse.json({ error: 'Không đủ quyền' }, { status: 403 }) };
  }
  return { user, bizId: 'global', bizRole: user.role, permissions: user.permissions };
}
