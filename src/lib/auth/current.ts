// Lấy user hiện tại + chốt chặn quyền cho API. Server-only (route handler / server component).
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { setBizCookie } from './cookie';
import { setBizContext } from '../biz/context';
import { env } from '../env';
import { ensureMigrated, getBiz, memberOf, memberPermissions, resolveActiveBiz, type BizRole } from '../store/biz';
import { canWith, effectivePermissions, type Permission, type Role } from './permissions';
import { SESSION_COOKIE, getSessionUserId } from './session';
import { findById } from './users';

// Cookie chọn biz đang hoạt động.
export const BIZ_COOKIE = 'sg_biz';

// CHỐNG CSRF: các route ghi xác thực bằng cookie sg_session; SameSite=Lax không chặn được mọi
// kiểu tấn công. Kiểm Origin khớp host của request. CHỈ áp khi có header Origin — same-origin GET
// và SSR (server component) không gửi Origin nên không bị ảnh hưởng; browser LUÔN gửi Origin cho
// POST/PUT/PATCH/DELETE → chặn được request giả mạo từ trang khác.
function sameOriginOk(): boolean {
  const h = headers();
  const origin = h.get('origin');
  if (!origin) return true; // không có Origin → không phải request ghi từ trình duyệt trang khác
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // Origin dị dạng → chặn
  }
  const acceptable = new Set<string>();
  const host = h.get('host');
  if (host) acceptable.add(host);
  const xfh = h.get('x-forwarded-host');
  if (xfh) xfh.split(',').forEach((s) => acceptable.add(s.trim()));
  if (env.appUrl) {
    try {
      acceptable.add(new URL(env.appUrl).host);
    } catch {
      /* APP_URL dị dạng → bỏ qua */
    }
  }
  return acceptable.has(originHost);
}

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

export type Guard =
  | { user: AuthUser; bizId: string; bizRole?: BizRole; permissions: Permission[] }
  | { response: NextResponse };

// Dùng trong route: const g = await guard('perm'); if ('response' in g) return g.response;
// guard NẠP NGỮ CẢNH BIZ đang hoạt động (từ cookie sg_biz, đã kiểm tra user là thành viên) để
// mọi store dữ liệu-thuộc-biz trỏ đúng .data/biz/<bizId>/, VÀ tính QUYỀN theo biz đó (per-biz):
// quyền của user lấy từ vai trò/tùy chỉnh của họ TRONG biz đang hoạt động, không phải quyền toàn cục.
export async function guard(permission?: Permission): Promise<Guard> {
  // CHỐNG CSRF: chặn request ghi có Origin không khớp host (áp trước cả kiểm đăng nhập).
  if (!sameOriginOk()) {
    return { response: NextResponse.json({ error: 'Yêu cầu bị từ chối (nguồn không hợp lệ).' }, { status: 403 }) };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) };
  }
  await ensureMigrated();
  const prefer = cookies().get(BIZ_COOKIE)?.value;

  // BẢO MẬT: bizFile tin cookie sg_biz để trỏ thư mục dữ liệu. Nếu cookie trỏ biz mà user KHÔNG
  // là thành viên (giả mạo/đã bị xóa khỏi biz) → TỪ CHỐI request + đặt lại cookie về biz hợp lệ,
  // tránh đọc trộm dữ liệu biz khác. (Cookie httpOnly nên trình duyệt thường không tạo được cookie
  // sai; chốt này chặn trường hợp gọi API thủ công / cookie cũ.)
  if (prefer && !(await memberOf(prefer, user.id))) {
    const { bizId: fallback } = await resolveActiveBiz(user.id);
    const res = NextResponse.json(
      { error: 'Biz không hợp lệ, đã chuyển về biz mặc định. Vui lòng thử lại.' },
      { status: 409 },
    );
    if (fallback) {
      setBizContext({ userId: user.id, bizId: fallback });
      setBizCookie(res, fallback);
    } else {
      // Không còn biz hợp lệ → xóa cookie (user sẽ được đưa về onboarding).
      res.cookies.set(BIZ_COOKIE, '', { path: '/', maxAge: 0 });
    }
    return { response: res };
  }

  const { bizId, role } = await resolveActiveBiz(user.id, prefer);

  // Biz bị quản trị NỀN TẢNG tạm khóa → chặn mọi truy cập (owner/thành viên đều không dùng được).
  if (bizId) {
    const bizRec = await getBiz(bizId);
    if (bizRec?.suspended) {
      return {
        response: NextResponse.json(
          { error: 'Biz này đã bị tạm khóa bởi quản trị nền tảng.' },
          { status: 403 },
        ),
      };
    }
  }

  const member = bizId ? await memberOf(bizId, user.id) : undefined;
  const permissions = memberPermissions(member);

  if (bizId) {
    setBizContext({ userId: user.id, bizId });
    // Tự chữa cookie sg_biz nếu thiếu (để bizFile - đọc cookie - trỏ đúng ở các request sau).
    // Chỉ set được trong route handler; ở server component sẽ ném → nuốt lỗi.
    if (prefer !== bizId) {
      try {
        cookies().set(BIZ_COOKIE, bizId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        });
      } catch {
        /* server component: không set được cookie ở đây */
      }
    }
  }

  // Chốt quyền THEO BIZ (không dùng quyền toàn cục nữa).
  if (permission && !canWith(permissions, permission)) {
    return { response: NextResponse.json({ error: 'Không đủ quyền' }, { status: 403 }) };
  }

  const authUser: AuthUser = { ...user, role: role ?? user.role, permissions };
  return { user: authUser, bizId: bizId ?? '', bizRole: role, permissions };
}
