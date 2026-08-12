import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';
import { saveRevision } from '@/lib/store/revisions';
import { mergeRelated, normHref, relatedHrefs } from '@/lib/content/related';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  confirm: z.boolean().default(false),
  edits: z
    .array(
      z.object({
        postId: z.string(),
        links: z.array(z.object({ url: z.string(), anchor: z.string() })).min(1),
      }),
    )
    .min(1),
});

function utmHost(baseUrl: string): string {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
  return host.replace(/^www\./i, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

function withUtm(url: string, site: string): string {
  if (url.includes('utm_source=')) return url;
  return url + (url.includes('?') ? '&' : '?') + `utm_source=${site}`;
}

// Chỉ chấp nhận URL http/https hợp lệ (chặn javascript:/data: và URL rác) → tránh chèn HTML/JS
// vào bài trên CMS. Trả URL đã chuẩn hóa hoặc null nếu không hợp lệ.
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// POST /api/optimize/interlink → chèn internal link "Bài viết liên quan" vào các bài cũ
// trên CMS (cần confirm=true). Mỗi link gắn utm_source theo domain site.
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { connectionId, confirm, edits } = parsed.data;

  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });

  const site = utmHost(loaded.record.baseUrl);

  if (!confirm) {
    return NextResponse.json({ preview: true, count: edits.length, site });
  }

  const results: Array<{ postId: string; ok: boolean; added: number; error?: string }> = [];
  for (const edit of edits) {
    try {
      const post = await loaded.adapter.getPost(edit.postId);
      const html = post.contentHtml ?? '';
      // Link đã có trong các mục "Bài viết liên quan" hiện tại (chuẩn hóa href).
      const existing = relatedHrefs(html);
      const fresh = edit.links.filter((l) => !existing.has(normHref(l.url)));

      // Thêm mục chứa link mới (nếu có), rồi GỘP + DỌN toàn bộ thành 1 mục sạch:
      // mỗi bài chỉ còn 1 mục "Bài viết liên quan", mọi dòng đều có link, không trùng.
      let combined = html;
      if (fresh.length > 0) {
        const items = fresh
          .map((l) => ({ anchor: l.anchor, url: safeUrl(l.url) }))
          .filter((x): x is { anchor: string; url: string } => x.url !== null)
          .map((x) => `<li><a href="${escapeHtml(withUtm(x.url, site))}">${escapeHtml(x.anchor)}</a></li>`)
          .join('');
        combined = `${html}\n<h2>Bài viết liên quan</h2>\n<ul>${items}</ul>\n`;
      }
      const merged = mergeRelated(combined);
      const finalHtml = merged.changed ? merged.html : combined;

      // Không có gì đổi (không link mới + không cần dọn) → bỏ qua, khỏi ghi CMS.
      if (finalHtml === html) {
        results.push({ postId: edit.postId, ok: true, added: 0 });
        continue;
      }
      // Snapshot Revision TRƯỚC khi ghi đè (CLAUDE.md §5) — dùng bản cũ vừa tải để có thể rollback.
      await saveRevision({
        connectionId,
        cmsPostId: edit.postId,
        title: post.title,
        contentHtml: html,
        metaDescription: post.metaDescription ?? post.excerpt,
        snapshotOk: !!html,
        reason: html ? 'pre-interlink' : 'pre-interlink (không đọc được nội dung cũ)',
      });
      await loaded.adapter.updatePost(edit.postId, { contentHtml: finalHtml });
      results.push({ postId: edit.postId, ok: true, added: fresh.length });
    } catch (err) {
      results.push({
        postId: edit.postId,
        ok: false,
        added: 0,
        error: err instanceof Error ? err.message : 'lỗi',
      });
    }
  }
  await setConnectionStatus(connectionId, results.every((r) => r.ok) ? 'active' : 'error');
  const total = results.reduce((s, r) => s + r.added, 0);
  return NextResponse.json({ ok: true, results, totalAdded: total });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
