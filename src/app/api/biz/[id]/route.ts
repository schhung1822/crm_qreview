import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { deleteBiz, getBiz, memberRole, updateBizProfile } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Hồ sơ biz: tên bắt buộc-không-rỗng khi có mặt; các trường liên hệ tùy chọn (rỗng = xóa).
const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(254).optional(),
  website: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

// PATCH /api/biz/[id] → cập nhật hồ sơ biz (tên + liên hệ). Chỉ owner/admin của biz đó.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  const role = await memberRole(params.id, g.user.id);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  await updateBizProfile(params.id, parsed.data);
  const biz = await getBiz(params.id);
  return NextResponse.json({
    biz: biz
      ? {
          id: biz.id,
          name: biz.name,
          phone: biz.phone,
          email: biz.email,
          website: biz.website,
          description: biz.description,
        }
      : null,
  });
}

// DELETE /api/biz/[id] → xóa biz + toàn bộ dữ liệu của biz (chỉ chủ sở hữu biz).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard();
  if ('response' in g) return g.response;
  const biz = await getBiz(params.id);
  if (!biz) return NextResponse.json({ error: 'Không tìm thấy biz.' }, { status: 404 });
  if (biz.ownerId !== g.user.id) {
    return NextResponse.json({ error: 'Chỉ chủ sở hữu mới xóa được biz.' }, { status: 403 });
  }
  await deleteBiz(params.id);
  return NextResponse.json({ ok: true });
}
