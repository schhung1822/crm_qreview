import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import {
  deleteArticle,
  getArticle,
  listArticles,
  upsertArticle,
} from '@/lib/store/articles';

// Giới hạn độ dài để tránh phình file .data + tốn token AI (≈ 400KB markdown).
const MAX_MD = 400_000;

export const dynamic = 'force-dynamic';

// GET /api/articles/draft        → danh sách nháp
// GET /api/articles/draft?id=... → 1 bài
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const article = await getArticle(id);
    if (!article) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    return NextResponse.json({ article });
  }
  return NextResponse.json({ articles: await listArticles() });
}

const UpsertSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().min(1).max(300),
  slug: z.string().max(200).optional(),
  metaDescription: z.string().max(2000).optional(),
  markdown: z.string().max(MAX_MD).optional(),
  locale: z.enum(locales),
  targetKeyword: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  categories: z.array(z.string().max(64)).max(50).optional(),
  coverImageUrl: z.string().max(2000).optional(),
  seoScore: z.number().min(0).max(100).optional(),
  aeoScore: z.number().min(0).max(100).optional(),
  geoScore: z.number().min(0).max(100).optional(),
  status: z.enum(['draft', 'published']).optional(),
  source: z.enum(['new', 'edited']).optional(),
  connectionId: z.string().max(64).optional(),
  cmsPostId: z.string().max(64).optional(),
  publishedUrl: z.string().max(2000).optional(),
});

// POST /api/articles/draft → tạo/cập nhật bản nháp.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = UpsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const article = await upsertArticle(parsed.data);
  return NextResponse.json({ article });
}

// DELETE /api/articles/draft?id=...
export async function DELETE(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'thiếu id' }, { status: 400 });
  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
