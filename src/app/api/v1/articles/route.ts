import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bearerAuth } from '@/lib/auth/bearer';
import { locales } from '@/i18n/config';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { listArticles, upsertArticle } from '@/lib/store/articles';

export const dynamic = 'force-dynamic';

// API CÔNG KHAI cho tích hợp ngoài. Xác thực bằng Bearer token (tạo trong biz).
// Không dùng session/cookie. Mọi thao tác chạy trong runWithBiz(bizId) của token.

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: `Quá nhiều yêu cầu. Thử lại sau ${retryAfter}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

// GET /api/v1/articles → liệt kê bài của biz (field rút gọn).
export async function GET(req: Request) {
  const a = await bearerAuth(req);
  if ('response' in a) return a.response;
  const rl = rateLimit(`apiv1:${a.token.id}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const list = await listArticles();
  return NextResponse.json({
    articles: list.map((x) => ({
      id: x.id,
      title: x.title,
      slug: x.slug,
      locale: x.locale,
      status: x.status,
      updatedAt: x.updatedAt,
      publishedUrl: x.publishedUrl,
    })),
  });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(300),
  locale: z.enum(locales),
  markdown: z.string().max(400_000).optional(),
  slug: z.string().max(200).optional(),
  metaDescription: z.string().max(2000).optional(),
  targetKeyword: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
});

// POST /api/v1/articles → tạo bản nháp mới trong biz (KHÔNG tự đăng lên CMS - an toàn).
export async function POST(req: Request) {
  const a = await bearerAuth(req);
  if ('response' in a) return a.response;
  const rl = rateLimit(`apiv1:${a.token.id}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const article = await upsertArticle({ ...parsed.data, source: 'new', status: 'draft' });
  return NextResponse.json(
    { article: { id: article.id, title: article.title, status: article.status } },
    { status: 201 },
  );
}
