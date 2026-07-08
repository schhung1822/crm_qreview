import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';
import { saveRevision } from '@/lib/store/revisions';
import { mergeRelated } from '@/lib/content/related';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  confirm: z.boolean().default(false),
});

// POST /api/optimize/merge-related → gộp các mục "Bài viết liên quan" trùng lặp trong
// từng bài thành 1. confirm=false → chỉ xem trước.
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { connectionId, confirm } = parsed.data;

  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });

  let posts;
  try {
    posts = await loaded.adapter.listPosts({ status: 'any', all: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải bài' },
      { status: 502 },
    );
  }

  // Lọc bài có ≥ 2 mục "Bài viết liên quan".
  const affected = posts
    .map((p) => ({ post: p, merged: mergeRelated(p.contentHtml ?? '') }))
    .filter((x) => x.merged.changed);

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      count: affected.length,
      removed: affected.reduce((s, x) => s + x.merged.removed, 0),
      posts: affected.map((x) => ({
        id: x.post.id,
        title: x.post.title,
        sections: x.merged.sections,
        removed: x.merged.removed,
      })),
    });
  }

  const results: Array<{ id: string; title: string; ok: boolean; error?: string }> = [];
  for (const x of affected) {
    try {
      // Snapshot Revision TRƯỚC khi ghi đè (CLAUDE.md §5) để có thể rollback nếu gộp sai.
      const oldHtml = x.post.contentHtml ?? '';
      await saveRevision({
        connectionId,
        cmsPostId: x.post.id,
        title: x.post.title,
        contentHtml: oldHtml,
        metaDescription: x.post.metaDescription ?? x.post.excerpt,
        snapshotOk: !!oldHtml,
        reason: 'pre-merge-related',
      });
      await loaded.adapter.updatePost(x.post.id, { contentHtml: x.merged.html });
      results.push({ id: x.post.id, title: x.post.title, ok: true });
    } catch (err) {
      results.push({
        id: x.post.id,
        title: x.post.title,
        ok: false,
        error: err instanceof Error ? err.message : 'lỗi',
      });
    }
  }
  await setConnectionStatus(connectionId, results.every((r) => r.ok) ? 'active' : 'error');
  return NextResponse.json({ ok: true, merged: results.filter((r) => r.ok).length, results });
}
