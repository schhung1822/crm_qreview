import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canWith } from '@/lib/auth/permissions';
import { guard } from '@/lib/auth/current';
import { getArticle, listArticles, updateArticleFields } from '@/lib/store/articles';
import { getBiz, memberPermissions } from '@/lib/store/biz';
import { addNotif, addNotifMany } from '@/lib/store/notifications';

export const dynamic = 'force-dynamic';

// GET /api/articles/review → hàng đợi bài đang chờ duyệt (chỉ người có quyền đăng mới thấy).
export async function GET() {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const all = await listArticles();
  return NextResponse.json({ articles: all.filter((a) => a.status === 'review') });
}

const BodySchema = z.object({
  id: z.string().min(1).max(64),
  action: z.enum(['submit', 'approve', 'reject']),
  note: z.string().max(2000).optional(),
});

// POST /api/articles/review → chuyển trạng thái duyệt của 1 bài.
// - submit  (content:write)   : bản nháp → chờ duyệt.
// - approve (content:publish) : chờ duyệt → nháp + đánh dấu đã duyệt (đủ điều kiện đăng).
// - reject  (content:publish) : chờ duyệt → nháp + ghi lý do trả lại.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { id, action, note } = parsed.data;

  // "Gửi duyệt" chỉ cần quyền viết; "duyệt/trả lại" cần quyền đăng.
  const g = await guard(action === 'submit' ? 'content:write' : 'content:publish');
  if ('response' in g) return g.response;

  const article = await getArticle(id);
  if (!article) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });

  if (action === 'submit') {
    if (article.status === 'published') {
      return NextResponse.json({ error: 'Bài đã đăng, không cần gửi duyệt.' }, { status: 400 });
    }
    const updated = await updateArticleFields(id, {
      status: 'review',
      approved: false,
      reviewNote: '',
      submittedBy: g.user.id,
    });
    // Báo cho những người có quyền đăng (người duyệt) - trừ chính người gửi.
    if (g.bizId) {
      const biz = await getBiz(g.bizId);
      const approvers = (biz?.members ?? [])
        .filter((m) => m.userId !== g.user.id && canWith(memberPermissions(m), 'content:publish'))
        .map((m) => m.userId);
      await addNotifMany(approvers, {
        type: 'reviewRequested',
        articleId: id,
        articleTitle: article.title,
        actorName: g.user.name,
      });
    }
    return NextResponse.json({ article: updated });
  }

  // approve / reject: bài phải đang ở trạng thái chờ duyệt.
  if (article.status !== 'review') {
    return NextResponse.json({ error: 'Bài không ở trạng thái chờ duyệt.' }, { status: 400 });
  }
  const updated = await updateArticleFields(id, {
    status: 'draft',
    approved: action === 'approve',
    reviewNote: action === 'reject' ? note?.trim() || '' : '',
    reviewedBy: g.user.id,
  });
  // Báo cho người đã gửi duyệt (nếu khác người duyệt).
  if (article.submittedBy && article.submittedBy !== g.user.id) {
    await addNotif(article.submittedBy, {
      type: action === 'approve' ? 'approved' : 'rejected',
      articleId: id,
      articleTitle: article.title,
      actorName: g.user.name,
      note: action === 'reject' ? note?.trim() || undefined : undefined,
    });
  }
  return NextResponse.json({ article: updated });
}
