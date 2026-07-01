import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  confirm: z.boolean().default(false),
});

// Dấu hiệu bài bị tool internal link chèn (rồi bị bug chuyển về nháp).
const SIGNATURE = /<h2>\s*Bài viết liên quan\s*<\/h2>/i;

// POST /api/optimize/republish → tìm các bài đang là NHÁP có mục "Bài viết liên quan"
// (do tool chèn) và XUẤT BẢN LẠI. confirm=false → chỉ xem trước.
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

  let drafts;
  try {
    drafts = await loaded.adapter.listPosts({ status: 'draft', all: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải bài nháp' },
      { status: 502 },
    );
  }

  // Chỉ những bài nháp có chữ ký "Bài viết liên quan" (bị bug chuyển nháp).
  const affected = drafts.filter((p) => SIGNATURE.test(p.contentHtml ?? ''));

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      count: affected.length,
      posts: affected.map((p) => ({ id: p.id, title: p.title })),
    });
  }

  const results: Array<{ id: string; title: string; ok: boolean; error?: string }> = [];
  for (const p of affected) {
    try {
      await loaded.adapter.updatePost(p.id, { status: 'publish' });
      results.push({ id: p.id, title: p.title, ok: true });
    } catch (err) {
      results.push({ id: p.id, title: p.title, ok: false, error: err instanceof Error ? err.message : 'lỗi' });
    }
  }
  await setConnectionStatus(connectionId, results.every((r) => r.ok) ? 'active' : 'error');
  return NextResponse.json({ ok: true, republished: results.filter((r) => r.ok).length, results });
}
