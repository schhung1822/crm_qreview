// API QUẢN TRỊ NỀN TẢNG — CHI TIẾT 1 BIZ (tổ chức).
//   GET /api/v1/admin/biz/{id} → thông tin đầy đủ 1 biz (kèm danh sách thành viên).
// Xác thực: Bearer sga_... (scope 'biz').
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { getBiz } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await platformApiAuth(req, 'biz');
  if ('response' in a) return a.response;
  const biz = await getBiz(params.id);
  if (!biz) return apiErr('not_found', 'Không tìm thấy biz.', 404);
  return apiOk({
    biz: {
      id: biz.id,
      name: biz.name,
      ownerId: biz.ownerId,
      members: biz.members,
      suspended: !!biz.suspended,
      createdAt: biz.createdAt,
    },
  });
}
