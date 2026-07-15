// Thư viện ảnh: GET (liệt kê), PATCH (đổi tên), DELETE (xóa). Ảnh dùng chung public/generated.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { deleteImage, listImages, renameImage } from '@/lib/store/image-library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  return NextResponse.json({ images: await listImages() });
}

const RenameBody = z.object({ file: z.string().min(1).max(256), name: z.string().max(200) });

export async function PATCH(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = RenameBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const ok = await renameImage(parsed.data.file, parsed.data.name);
  if (!ok) return NextResponse.json({ error: 'Tên file không hợp lệ.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}

const DeleteBody = z.object({ file: z.string().min(1).max(256) });

export async function DELETE(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  const ok = await deleteImage(parsed.data.file);
  if (!ok) return NextResponse.json({ error: 'Tên file không hợp lệ.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
