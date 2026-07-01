import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { generateArticle } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { scoreAeo } from '@/lib/aeo/score';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput } from '@/lib/scoring/types';
import { upsertArticle } from '@/lib/store/articles';

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

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }

  const cfg = await getArticleConfig();
  const gen = await generateArticle({
    ...parsed.data,
    locale: parsed.data.locale as Locale,
    maxTokens: cfg.maxTokens,
  });
  const { error } = gen;
  const article = await applyArticleRules(gen.article);

  // Keyword bám nội dung (không cố định) → điểm SEO+AEO+GEO cao nhất.
  const targetKeyword = pickBestKeyword({
    title: article.title,
    markdown: article.markdown,
    metaDescription: article.metaDescription,
    slug: article.slug,
    locale: parsed.data.locale,
    current: parsed.data.targetKeyword,
  });

  const scoreInput = buildScoreInput({
    title: article.title,
    metaDescription: article.metaDescription,
    slug: article.slug,
    markdown: article.markdown,
    locale: parsed.data.locale,
    targetKeyword,
  });
  const seo = scoreSeo(scoreInput);
  const aeo = scoreAeo(scoreInput);
  const geo = scoreGeo(scoreInput);

  const draft = await upsertArticle({
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    markdown: article.markdown,
    locale: parsed.data.locale,
    targetKeyword,
    tags: article.tags,
    seoScore: seo.score,
    aeoScore: aeo.score,
    geoScore: geo.score,
    status: 'draft',
  });

  return NextResponse.json({
    ok: true,
    draft,
    seo: seo.score,
    aeo: aeo.score,
    geo: geo.score,
    aiError: error,
  });
}
