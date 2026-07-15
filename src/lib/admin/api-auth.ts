// Xác thực API QUẢN TRỊ NỀN TẢNG (Bearer sga_...). Kiểm token → scope → superadmin còn hiệu lực
// → rate-limit theo token. Server-only. Dùng ở mọi route /api/v1/admin/*.
import type { NextResponse } from 'next/server';
import { isSuperadminUser } from '../auth/superadmin';
import { clientIp, rateLimit } from '../security/rate-limit';
import {
  resolvePlatformToken,
  touchPlatformToken,
  type ApiScope,
  type PlatformApiTokenRecord,
} from '../store/platform-api-tokens';
import { apiErr } from './api-response';

export type PlatformApiAuth =
  | { token: PlatformApiTokenRecord; ip: string }
  | { response: NextResponse };

function readBearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

// Dùng đầu route: const a = await platformApiAuth(req, 'orders'); if ('response' in a) return a.response;
export async function platformApiAuth(req: Request, scope: ApiScope): Promise<PlatformApiAuth> {
  const ip = clientIp(req);
  const raw = readBearer(req);
  if (!raw) return { response: apiErr('unauthorized', 'Thiếu Bearer token.', 401) };

  const token = await resolvePlatformToken(raw);
  if (!token) return { response: apiErr('unauthorized', 'Token không hợp lệ hoặc đã thu hồi.', 401) };

  // Token chỉ hiệu lực khi NGƯỜI TẠO vẫn là superadmin (gỡ khỏi SUPERADMIN_EMAILS → token vô hiệu).
  if (!(await isSuperadminUser(token.createdBy))) {
    return {
      response: apiErr('forbidden', 'Token không còn hiệu lực (người tạo không còn là superadmin).', 403),
    };
  }
  if (!token.scopes.includes(scope)) {
    return { response: apiErr('forbidden', `Token không có quyền '${scope}'.`, 403) };
  }

  // Rate-limit theo token (chống lạm dụng): 120 request / phút.
  const rl = rateLimit(`padmin:${token.id}`, 120, 60_000);
  if (!rl.ok) return { response: apiErr('rate_limited', `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.`, 429) };

  void touchPlatformToken(token.id);
  return { token, ip };
}
