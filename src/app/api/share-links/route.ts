// Quản lý LINK RÚT GỌN của báo cáo: GET (danh sách), PATCH (sửa tiêu đề/mô tả/ảnh, thu hồi), DELETE.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  deleteShareLink,
  listShareLinks,
  patchShareLink,
} from '@/lib/store/share-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  return NextResponse.json({ links: await listShareLinks(g.bizId) });
}

const PatchBody = z.object({
  slug: z.string().min(3).max(120),
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  image: z.string().max(2000).optional(),
  revoked: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const { slug, ...patch } = parsed.data;
  const ok = await patchShareLink(g.bizId, slug, patch);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy link.' }, { status: 404 });
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
