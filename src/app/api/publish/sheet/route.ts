import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { dedash } from '@/lib/content/dedash';
import { markdownToHtml } from '@/lib/content/markdown';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { buildRow, type SheetRowData } from '@/lib/sheets/columns';
import { ensureHeader, getSheetsToken, SheetsError, upsertRow } from '@/lib/sheets/client';
import { getArticle, upsertArticle } from '@/lib/store/articles';
import { getSheetTarget } from '@/lib/store/sheet-target';

export const dynamic = 'force-dynamic';

// HTML để lưu vào Sheet: bỏ ảnh placeholder chưa có URL thật (giống đăng CMS).
function toHtml(md: string): string {
  return markdownToHtml(md).replace(/<span class="md-img-ph"[\s\S]*?<\/span>/g, '');
}

const Schema = z.object({
  articleId: z.string().optional(),
  title: z.string(),
  slug: z.string(),
  metaDescription: z.string().optional(),
  markdown: z.string(),
  targetKeyword: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  coverImageUrl: z.string().optional(),
  locale: z.string().optional(),
});

// POST /api/publish/sheet — upsert 1 dòng vào Google Sheet (cột cố định), khoá theo slug.
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'invalid' }, { status: 400 });
  const b = parsed.data;

  const slug = b.slug.trim();
  if (!slug) return NextResponse.json({ error: 'Bài cần có slug để làm khoá dòng', code: 'noSlug' }, { status: 400 });

  const target = await getSheetTarget();
  if (!target) return NextResponse.json({ error: 'Chưa chọn Google Sheet đích', code: 'noTarget' }, { status: 400 });

  const rl = rateLimit(`publish-sheet:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.`, code: 'rate' }, { status: 429 });

  // Điểm số + fallback lấy từ bản ghi bài (form chỉ có nội dung, không có điểm đã lưu).
  const art = b.articleId ? await getArticle(b.articleId) : null;
  const md = dedash(b.markdown);
  const row: SheetRowData = {
    slug,
    title: dedash(b.title),
    metaDescription: dedash(b.metaDescription ?? ''),
    targetKeyword: b.targetKeyword ?? art?.targetKeyword ?? '',
    categories: (b.categories ?? art?.categories ?? []).join(', '),
    tags: (b.tags ?? art?.tags ?? []).join(', '),
    coverImageUrl: b.coverImageUrl ?? art?.coverImageUrl ?? '',
    locale: b.locale ?? art?.locale ?? '',
    status: 'published',
    seoScore: art?.seoScore ?? '',
    aeoScore: art?.aeoScore ?? '',
    geoScore: art?.geoScore ?? '',
    contentMarkdown: md,
    contentHtml: toHtml(md),
    publishedUrl: target.spreadsheetUrl,
    updatedAt: new Date().toISOString(),
  };

  try {
    const token = await getSheetsToken();
    await ensureHeader(token, target.spreadsheetId, target.tab); // tự sửa header nếu bị đổi
    const action = await upsertRow(token, target.spreadsheetId, target.tab, slug, buildRow(row));

    // Cập nhật bản nháp: đánh dấu đã đăng + lưu chỉnh sửa từ form (giống đăng CMS).
    if (b.articleId && art) {
      await upsertArticle({
        id: b.articleId,
        title: b.title || art.title,
        locale: art.locale,
        slug,
        metaDescription: b.metaDescription ?? '',
        markdown: b.markdown,
        ...(b.coverImageUrl !== undefined ? { coverImageUrl: b.coverImageUrl } : {}),
        status: 'published',
        publishedUrl: target.spreadsheetUrl,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, action, spreadsheetUrl: target.spreadsheetUrl, tab: target.tab });
  } catch (e) {
    if (e instanceof SheetsError) {
      const status = e.code === 'drive-not-connected' ? 400 : e.code === 'forbidden' ? 403 : e.code === 'not-found' ? 404 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown', code: 'api' }, { status: 502 });
  }
}
