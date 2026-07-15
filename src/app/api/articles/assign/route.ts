import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getArticle, updateArticleFields } from '@/lib/store/articles';
import { memberOf } from '@/lib/store/biz';
import { addNotif } from '@/lib/store/notifications';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  id: z.string().min(1).max(64),
  userId: z.string().max(64).nullable().optional(), // '' hoặc null → bỏ giao
});

// POST /api/articles/assign → giao (hoặc bỏ giao) 1 bài cho 1 thành viên. Báo cho người được giao.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const { id } = parsed.data;
  const assignee = parsed.data.userId || '';

  // Chỉ giao được cho THÀNH VIÊN của biz đang hoạt động (chống giao cho user tùy ý).
  if (assignee && g.bizId && !(await memberOf(g.bizId, assignee))) {
    return NextResponse.json({ error: 'Người nhận không thuộc biz.' }, { status: 400 });
  }

  const updated = await updateArticleFields(id, { assignedTo: assignee });
  if (!updated) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });

  if (assignee && assignee !== g.user.id) {
    await addNotif(assignee, {
      type: 'assigned',
      articleId: id,
      articleTitle: updated.title,
      actorName: g.user.name,
    });
  }
  return NextResponse.json({ article: updated });
}
