import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { getArticleConfig } from '@/lib/store/article-config';

export const dynamic = 'force-dynamic';

// GET /api/auth/permissions → quyền HIỆU LỰC của user trong biz đang hoạt động (per-biz),
// kèm userId và cờ requireApproval của biz. Client dùng để gạn nút (vd: hiện "Gửi duyệt"
// hay "Duyệt/Trả lại"). Khác /api/auth/me (trả quyền toàn cục).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const cfg = await getArticleConfig();
  return NextResponse.json({
    userId: g.user.id,
    role: g.bizRole ?? null,
    permissions: g.permissions,
    requireApproval: cfg.requireApproval,
  });
}
