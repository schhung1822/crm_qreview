import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { generateArticle } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { buildScoreInput } from '@/lib/scoring/types';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';

const BodySchema = z.object({
  title: z.string().min(1),
  targetKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string().max(200)).max(20).optional(),
  outline: z.array(z.string().max(300)).max(30).optional(),
  // Brief/nghiên cứu từ khung nội dung (blueprint) để cây viết bám theo.
  research: z.string().max(8000).optional(),
  locale: z.enum(locales),
  // Chọn AI cụ thể ở trình soạn thảo (tùy chọn).
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().optional(),
  internalLinks: z.array(z.object({ anchor: z.string(), url: z.string() })).optional(),
});

// POST /api/articles → sinh 1 bài (Claude nếu có key, không thì mock) + chấm SEO/GEO.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const ready = await aiReady();
  const { provider, model, ...rest } = parsed.data;
  const cfg = await getArticleConfig();
  const gen = await generateArticle({
    ...rest,
    locale: parsed.data.locale as Locale,
    override: provider ? { provider, model } : undefined,
    maxTokens: cfg.maxTokens,
  });
  const { usedAi, error } = gen;
  // Áp quy tắc thay thế keyword/ký tự do người dùng cấu hình (vd "-"→"-", "ai"→"AI").
  const article = await applyArticleRules(gen.article);

  // Target keyword KHÔNG cố định: chọn cụm bám nội dung bài cho điểm SEO+AEO+GEO cao nhất.
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

  return NextResponse.json({
    article,
    targetKeyword,
    seo: scoreSeo(scoreInput),
    aeo: scoreAeo(scoreInput),
    geo: scoreGeo(scoreInput),
    usedAi,
    needsKey: !ready,
    aiError: error, // lỗi provider (nếu có) để editor hiển thị rõ
  });
}
