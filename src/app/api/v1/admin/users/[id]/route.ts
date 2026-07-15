// API QUẢN TRỊ NỀN TẢNG — CHI TIẾT 1 NGƯỜI DÙNG.
//   GET /api/v1/admin/users/{id} → thông tin 1 user + gói cước hiện tại (không lộ mật khẩu/salt).
// Xác thực: Bearer sga_... (scope 'users').
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { findById, toPublic } from '@/lib/auth/users';
import { getSubscription } from '@/lib/billing/subscription';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await platformApiAuth(req, 'users');
  if ('response' in a) return a.response;
  const user = await findById(params.id);
  if (!user) return apiErr('not_found', 'Không tìm thấy người dùng.', 404);
  const subscription = await getSubscription(user.id);
  return apiOk({ user: { ...toPublic(user), subscription } });
}
