import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { aiReady } from '@/lib/ai/providers';
import { generateDraftFromItem } from '@/lib/gen/generate-draft';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  title: z.string().min(1),
  targetKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).optional(),
  outline: z.array(z.string()).optional(),
  locale: z.enum(locales),
  internalLinks: z.array(z.object({ anchor: z.string(), url: z.string() })).optional(),
});

// POST /api/articles/auto → AI tự viết trọn bài, chấm SEO/GEO và LƯU thành bản nháp.
// Trả { ok, draft, seo, geo } hoặc { ok:false, needsKey:true } nếu chưa có key AI.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // AI viết trọn bài → giới hạn chống lạm dụng chi phí.
  const rl = rateLimit(`article:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }

  const r = await generateDraftFromItem({ ...parsed.data, locale: parsed.data.locale as Locale });
  return NextResponse.json({
    ok: true,
    draft: r.draft,
    seo: r.seo,
    aeo: r.aeo,
    geo: r.geo,
    aiError: r.aiError,
  });
}
