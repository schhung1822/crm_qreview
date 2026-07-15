import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { addComment, deleteComment, listComments } from '@/lib/store/comments';

export const dynamic = 'force-dynamic';

// GET /api/articles/comments?articleId=... → danh sách ghi chú của 1 bài.
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const articleId = new URL(req.url).searchParams.get('articleId');
  if (!articleId) return NextResponse.json({ error: 'Thiếu articleId' }, { status: 400 });
  return NextResponse.json({ comments: await listComments(articleId) });
}

const PostSchema = z.object({
  articleId: z.string().min(1).max(64),
  body: z.string().min(1).max(4000),
});

// POST → thêm ghi chú (cần quyền viết nội dung).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const comment = await addComment({
    articleId: parsed.data.articleId,
    userId: g.user.id,
    userName: g.user.name,
    body: parsed.data.body,
  });
  return NextResponse.json({ comment });
}

// DELETE ?articleId=&id= → xóa ghi chú (người viết tự xóa, hoặc chủ/quản trị xóa bất kỳ).
export async function DELETE(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const articleId = url.searchParams.get('articleId');
  const id = url.searchParams.get('id');
  if (!articleId || !id) return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 });
  const isManager = g.bizRole === 'owner' || g.bizRole === 'admin';
  const ok = await deleteComment(articleId, id, g.user.id, isManager);
  if (!ok) return NextResponse.json({ error: 'Không xóa được' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
