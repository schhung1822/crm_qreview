import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { suggestLandingEdits } from '@/lib/ai/content';
import { aiReady, type AiOverride } from '@/lib/ai/providers';
import { htmlToMarkdown } from '@/lib/content/markdown';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import type { Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_HTML = 3_000_000;
const BodySchema = z.object({
  html: z.string().min(1).max(MAX_HTML),
  title: z.string().max(300).optional(),
  weakPoints: z.array(z.string().max(300)).max(50).optional().default([]),
  locale: z.string().max(12),
  aiProvider: z.string().max(40).optional(),
  aiModel: z.string().max(120).optional(),
});

// POST /api/landing-audit/suggest → AI ĐỌC nội dung landing (trích text tĩnh) để hiểu sản phẩm/
// dịch vụ, rồi đề xuất chỉnh sửa cụ thể. Trả { result } | { error } | { needsKey }.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`landingsuggest:${clientIp(req)}`, 15, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  }
  const { html, title, weakPoints, locale, aiProvider, aiModel } = parsed.data;
  if (aiProvider === 'none') {
    return NextResponse.json({ error: 'Hãy chọn AI để tạo đề xuất.' }, { status: 400 });
  }

  // '' = tự động (định tuyến mặc định); tên provider = ép provider/model người dùng chọn.
  const override: AiOverride | undefined =
    aiProvider ? { provider: aiProvider as AiOverride['provider'], model: aiModel || undefined } : undefined;
  if (!override && !(await aiReady())) {
    return NextResponse.json({ needsKey: true });
  }

  const content = htmlToMarkdown(html);
  const { result, error } = await suggestLandingEdits({
    title,
    content,
    weakPoints,
    locale: locale as Locale,
    override,
  });
  if (result) return NextResponse.json({ result });
  return NextResponse.json({ error: error ?? 'Không tạo được đề xuất.' });
}
