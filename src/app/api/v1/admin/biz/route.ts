// API QUẢN TRỊ NỀN TẢNG — BIZ (tổ chức).
//   GET   /api/v1/admin/biz?limit=   → danh sách biz
//   GET   /api/v1/admin/biz/{id}     → chi tiết 1 biz + danh sách thành viên (route [id])
//   PATCH /api/v1/admin/biz          → { bizId, action: suspend|activate|transfer|delete, newOwnerId? }
// Xác thực: Bearer sga_... (scope 'biz'). Tái dùng service (setBizSuspended/transferBizOwnership/
// deleteBiz) nên bảo vệ owner + dọn dữ liệu biz giữ nguyên.
import { z } from 'zod';
import { platformApiAuth } from '@/lib/admin/api-auth';
import { apiErr, apiOk } from '@/lib/admin/api-response';
import { findById } from '@/lib/auth/users';
import { deleteBiz, getBiz, listAllBizes, setBizSuspended, transferBizOwnership } from '@/lib/store/biz';
import { appendAudit } from '@/lib/store/admin-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const a = await platformApiAuth(req, 'biz');
  if ('response' in a) return a.response;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 500), 2000);
  const bizes = (await listAllBizes())
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    .slice(0, limit)
    .map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      members: b.members.length,
      suspended: !!b.suspended,
      createdAt: b.createdAt,
    }));
  return apiOk({ bizes, total: bizes.length });
}

const Schema = z.object({
  bizId: z.string().min(1).max(64),
  action: z.enum(['suspend', 'activate', 'transfer', 'delete']),
  newOwnerId: z.string().min(1).max(64).optional(),
});

export async function PATCH(req: Request) {
  const a = await platformApiAuth(req, 'biz');
  if ('response' in a) return a.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiErr('invalid_params', 'Tham số không hợp lệ.', 400);
  const { bizId, action, newOwnerId } = parsed.data;

  const biz = await getBiz(bizId);
  if (!biz) return apiErr('not_found', 'Không tìm thấy biz.', 404);

  try {
    const detail: Record<string, unknown> = {};
    if (action === 'suspend') await setBizSuspended(bizId, true);
    else if (action === 'activate') await setBizSuspended(bizId, false);
    else if (action === 'transfer') {
      if (!newOwnerId) return apiErr('invalid_params', 'Thiếu newOwnerId cho action transfer.', 400);
      if (!(await findById(newOwnerId))) return apiErr('not_found', 'Người nhận không tồn tại.', 404);
      await transferBizOwnership(bizId, newOwnerId);
      detail.newOwnerId = newOwnerId;
    } else if (action === 'delete') {
      await deleteBiz(bizId);
    }
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: `biz.${action}`, resource: 'biz', resourceId: bizId, detail, ok: true, ip: a.ip });
    return apiOk({ bizId, action });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'error';
    await appendAudit({ via: 'api', tokenId: a.token.id, actor: a.token.name, action: `biz.${action}`, resource: 'biz', resourceId: bizId, ok: false, error, ip: a.ip });
    return apiErr('operation_failed', error, 400);
  }
}
