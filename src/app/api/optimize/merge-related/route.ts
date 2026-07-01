import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  confirm: z.boolean().default(false),
});

// Tìm MỌI mục "Bài viết liên quan" trong 1 bài. Khớp form do tool chèn:
// <h2>Bài viết liên quan</h2><ul>...</ul>
const SECTION_RE = /<h2[^>]*>\s*Bài viết liên quan\s*<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi;
// 1 <li> được coi là "có link" khi chứa <a ... href="...">.
const HAS_LINK = /<a\s[^>]*href=["'][^"']+["']/i;

// GỘP + DỌN mục "Bài viết liên quan": đảm bảo mỗi bài chỉ còn 1 mục, và mọi dòng đều
// trỏ tới bài khác. Gộp nhiều mục → 1; bỏ trùng theo href chuẩn hóa; BỎ dòng text suông
// (không có link). Nếu không còn dòng nào có link → bỏ luôn cả mục.
function mergeRelated(
  html: string,
): { changed: boolean; html: string; sections: number; removed: number } {
  const sections = [...html.matchAll(SECTION_RE)];
  if (sections.length === 0) return { changed: false, html, sections: 0, removed: 0 };

  const seen = new Set<string>();
  const lis: string[] = [];
  let totalItems = 0;
  for (const s of sections) {
    const items = [...s[1].matchAll(/<li[^>]*>[\s\S]*?<\/li>/gi)].map((m) => m[0]);
    for (const li of items) {
      totalItems++;
      if (!HAS_LINK.test(li)) continue; // text suông → bỏ
      const href = (li.match(/href=["']([^"']+)["']/i)?.[1] ?? '')
        .split(/[?#]/)[0]
        .replace(/\/+$/, '');
      if (seen.has(href)) continue; // trùng href → bỏ
      seen.add(href);
      lis.push(li.trim());
    }
  }

  const removed = totalItems - lis.length; // số dòng bị bỏ (text suông + trùng)
  // Có thay đổi khi: nhiều mục, hoặc có dòng bị bỏ, hoặc mục rỗng link cần xóa.
  const changed = sections.length > 1 || removed > 0;
  if (!changed) return { changed: false, html, sections: sections.length, removed: 0 };

  // Bỏ mọi mục cũ; chỉ thêm lại 1 mục gộp NẾU còn dòng có link.
  let out = html.replace(SECTION_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  if (lis.length) out += `\n<h2>Bài viết liên quan</h2>\n<ul>${lis.join('')}</ul>\n`;
  else out += '\n';
  return { changed: true, html: out, sections: sections.length, removed };
}

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
