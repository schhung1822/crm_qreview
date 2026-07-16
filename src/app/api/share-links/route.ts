// Quản lý LINK RÚT GỌN của báo cáo: GET (danh sách + trạng thái khóa), PATCH (sửa nội dung / đặt-đổi-gỡ
// mật khẩu / thu hồi), DELETE.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { updateSocialReport } from '@/lib/store/social-reports';
import {
  deleteShareLink,
  getShareLinkManaged,
  listShareLinks,
  patchShareLink,
} from '@/lib/store/share-links';
import { getShareLockedMap, setSharePassword } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const [links, lockMap] = await Promise.all([listShareLinks(g.bizId), getShareLockedMap(g.bizId)]);
  return NextResponse.json({
    links: links.map((l) => ({ ...l, locked: lockMap[l.reportId] ?? false })),
  });
}

const PatchBody = z.object({
  slug: z.string().min(3).max(120),
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  image: z.string().max(2000).optional(),
  revoked: z.boolean().optional(),
  // password: '' = GỠ khóa (công khai); chuỗi khác = đặt/đổi mật khẩu. Không gửi = không đổi.
  password: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const { slug, password, ...patch } = parsed.data;

  // Đặt / đổi / gỡ mật khẩu khóa (nếu field password được gửi).
  if (typeof password === 'string') {
    const link = await getShareLinkManaged(g.bizId, slug);
    if (!link) return NextResponse.json({ error: 'Không tìm thấy link.' }, { status: 404 });
    const pw = password.trim();
    await setSharePassword(g.bizId, link.reportId, pw || null);
    await updateSocialReport(link.reportId, (r) => {
      if (r.share) r.share.locked = !!pw;
    });
  }

  // Sửa tiêu đề/mô tả/ảnh/thu hồi (nếu có field tương ứng).
  if (
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.image !== undefined ||
    patch.revoked !== undefined
  ) {
    const ok = await patchShareLink(g.bizId, slug, patch);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy link.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

const DeleteBody = z.object({ slug: z.string().min(3).max(120) });

export async function DELETE(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const ok = await deleteShareLink(g.bizId, parsed.data.slug);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy link.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
