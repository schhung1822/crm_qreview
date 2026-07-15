import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { applyArticleRulesCounted } from '@/lib/store/article-config';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  title: z.string().max(300).optional(),
  metaDescription: z.string().max(2000).optional(),
  markdown: z.string().max(400_000).optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
});

// POST /api/articles/apply-rules → áp QUY TẮC THAY THẾ (Cài đặt bài viết) lên nội dung đang
// soạn, KHÔNG dùng AI. Trả về nội dung đã thay + tổng số chỗ đã thay để báo cho người dùng.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const { result, count } = await applyArticleRulesCounted(parsed.data);
  return NextResponse.json({ ok: true, result, count });
}
