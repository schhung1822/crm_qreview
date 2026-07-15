import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { NEWS_CATEGORIES, readNews, saveNews } from '@/lib/store/news-feed';

export const dynamic = 'force-dynamic';

// GET → cấu hình đầy đủ cho superadmin sửa.
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await readNews());
}

const Schema = z.object({
  enabled: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        title: z.string().max(200),
        body: z.string().max(8000),
        category: z.enum(NEWS_CATEGORIES),
        url: z.string().max(500).optional(),
        imageUrl: z.string().max(1000).optional(),
        publishedAt: z.string().max(40).optional(),
        pinned: z.boolean().optional(),
        enabled: z.boolean(),
      }),
    )
    .max(100),
});

// POST → lưu toàn bộ bảng tin.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  return NextResponse.json(await saveNews(parsed.data));
}
