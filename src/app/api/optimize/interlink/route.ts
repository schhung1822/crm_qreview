import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

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
      // Bỏ link đã có sẵn trong bài.
      const fresh = edit.links.filter((l) => !html.includes(l.url.replace(/\/$/, '')));
      if (fresh.length === 0) {
        results.push({ postId: edit.postId, ok: true, added: 0 });
        continue;
      }
      const items = fresh
        .map((l) => `<li><a href="${withUtm(l.url, site)}">${escapeHtml(l.anchor)}</a></li>`)
        .join('');
      const section = `\n<h2>Bài viết liên quan</h2>\n<ul>${items}</ul>\n`;
      await loaded.adapter.updatePost(edit.postId, { contentHtml: html + section });
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
