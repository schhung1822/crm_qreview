import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  title: z.string().max(300),
  metaDescription: z.string().max(2000).optional(),
  slug: z.string().max(200).optional(),
  markdown: z.string().max(400_000),
  locale: z.enum(locales),
  targetKeyword: z.string().max(200).optional(),
  internalLinkCount: z.number().min(0).max(10000).optional(),
  hasFaqSchema: z.boolean().optional(),
  inTranslationGroup: z.boolean().optional(),
});

// POST /api/articles/score → chấm SEO + GEO cho nội dung gửi lên.
export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  return NextResponse.json({
    seo: scoreSeo(parsed.data),
    aeo: scoreAeo(parsed.data),
    geo: scoreGeo(parsed.data),
  });
}
