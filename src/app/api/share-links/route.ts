// Quản lý LINK RÚT GỌN: GET (danh sách + trạng thái khóa), PATCH (sửa nội dung / đặt-đổi-gỡ mật khẩu
// / thu hồi), DELETE. Hỗ trợ 2 loại qua ?kind=social|script (mặc định social) — dispatch đúng store.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getScriptAnalysis, updateScriptAnalysis } from '@/lib/store/script-analyses';
import {
  getShareLockedMap as scriptGetShareLockedMap,
  setSharePassword as scriptSetSharePassword,
} from '@/lib/store/script-shares';
import {
  deleteShareLink,
  getShareLinkManaged,
  listShareLinks,
  patchShareLink,
  shareLinkKind,
  type ShareLinkKind,
} from '@/lib/store/share-links';
import { updateSocialReport } from '@/lib/store/social-reports';
import {
  getShareLockedMap as socialGetShareLockedMap,
  setSharePassword as socialSetSharePassword,
} from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function kindOf(req: Request): ShareLinkKind {
  return new URL(req.url).searchParams.get('kind') === 'script' ? 'script' : 'social';
}

export async function GET(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const kind = kindOf(req);
  const [links, lockMap] = await Promise.all([
    listShareLinks(g.bizId, kind),
    kind === 'script' ? scriptGetShareLockedMap(g.bizId) : socialGetShareLockedMap(g.bizId),
  ]);
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

  // Đặt / đổi / gỡ mật khẩu khóa (nếu field password được gửi) — dispatch theo loại của link.
  if (typeof password === 'string') {
    const link = await getShareLinkManaged(g.bizId, slug);
    if (!link) return NextResponse.json({ error: 'Không tìm thấy link.' }, { status: 404 });
    const pw = password.trim();
    if (shareLinkKind(link) === 'script') {
      await scriptSetSharePassword(g.bizId, link.reportId, pw || null);
      const rec = await getScriptAnalysis(link.reportId);
      if (rec?.share) await updateScriptAnalysis(link.reportId, { share: { ...rec.share, locked: !!pw } });
    } else {
      await socialSetSharePassword(g.bizId, link.reportId, pw || null);
      await updateSocialReport(link.reportId, (r) => {
        if (r.share) r.share.locked = !!pw;
      });
    }
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
