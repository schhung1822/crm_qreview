import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { generatePlanWithAI } from '@/lib/ai/content';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { saveKeywordSet } from '@/lib/store/keywordsets';
import { savePlan } from '@/lib/store/plans';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  seed: z.string().min(1).max(200),
  locale: z.enum(locales),
  estimated: z.boolean().optional(),
  clusters: z.array(z.string().max(120)).max(200).optional(),
  keywords: z
    .array(
      z.object({
        term: z.string().max(200),
        cluster: z.string().max(120),
        volume: z.number(),
        difficulty: z.number(),
        intent: z.string().max(60),
        type: z.enum(['seo', 'geo']),
        cpc: z.number().optional(),
        competition: z.number().optional(),
        trend: z.enum(['up', 'flat', 'down']).optional(),
        opportunity: z.number().optional(),
      }),
    )
    .max(2000),
  keywordSetId: z.string().max(64).optional(), // đã lưu project trước đó → không lưu lại
  provider: z.enum(AI_PROVIDERS).optional(), // chọn AI để phân tích plan
  model: z.string().max(120).optional(),
});

// POST /api/plans/from-keywords → lưu bộ từ khóa + sinh content plan + lưu plan.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { seed, locale, keywords } = parsed.data;

  // Đã có project từ khóa → dùng lại, tránh lưu trùng.
  const setId =
    parsed.data.keywordSetId ??
    (
      await saveKeywordSet({
        seed,
        locale,
        estimated: parsed.data.estimated ?? true,
        keywords,
        clusters: parsed.data.clusters ?? Array.from(new Set(keywords.map((k) => k.cluster))),
      })
    ).id;

  // Dùng AI phân tích bộ từ khóa → plan bám sát keyword (fallback heuristic nếu lỗi).
  const { items, usedAi, error } = await generatePlanWithAI({
    seed,
    locale: locale as Locale,
    keywords,
    override: parsed.data.provider
      ? { provider: parsed.data.provider, model: parsed.data.model }
      : undefined,
  });
  const plan = await savePlan({
    keywordSetId: setId,
    locale,
    seed,
    title: `Content plan: ${seed}`,
    items,
  });

  return NextResponse.json({ planId: plan.id, keywordSetId: setId, items: plan.items, usedAi, aiError: error });
}
