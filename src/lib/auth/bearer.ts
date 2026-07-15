// Xác thực API công khai bằng Bearer token (thay cho session cookie). Dùng cho /api/v1/*.
// Tra token → ra biz; các handler sau đó chạy trong runWithBiz(bizId) để store trỏ đúng biz.
import { NextResponse } from 'next/server';
import { bizHasFeature } from '../billing/entitlement';
import { resolveToken, touchToken, type ApiTokenRecord } from '../store/api-tokens';

export type BearerAuth = { token: ApiTokenRecord } | { response: NextResponse };

// Lấy token từ header Authorization: "Bearer sg_...".
function readBearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

// Dùng trong route công khai: const a = await bearerAuth(req); if ('response' in a) return a.response;
export async function bearerAuth(req: Request): Promise<BearerAuth> {
  const raw = readBearer(req);
  if (!raw) {
    return {
      response: NextResponse.json(
        { error: 'Thiếu token. Gửi header Authorization: Bearer <token>.' },
        { status: 401 },
      ),
    };
  }
  const token = await resolveToken(raw);
  if (!token) {
    return {
      response: NextResponse.json({ error: 'Token không hợp lệ hoặc đã thu hồi.' }, { status: 401 }),
    };
  }
  // Gói của biz phải còn cho phép API (biz hạ gói → token cũ ngừng tác dụng).
  if (!(await bizHasFeature(token.bizId, 'api'))) {
    return {
      response: NextResponse.json(
        { error: 'Gói của biz không còn hỗ trợ API. Nâng cấp gói để tiếp tục dùng.' },
        { status: 403 },
      ),
    };
  }
  void touchToken(token.id); // best-effort, không chờ
  return { token };
}
