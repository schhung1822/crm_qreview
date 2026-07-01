import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { localizeArticle } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { locales, type Locale } from '@/i18n/config';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput } from '@/lib/scoring/types';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { getArticle, upsertArticle } from '@/lib/store/articles';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  draftId: z.string(),
  targetLocale: z.enum(locales),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().optional(),
});

// POST /api/articles/translate → bản địa hóa 1 bản nháp sang ngôn ngữ khác (AI),
// tạo bản nháp mới và gắn cùng TranslationGroup với bản gốc.
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

  const source = await getArticle(parsed.data.draftId);
  if (!source) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });
  if (source.locale === parsed.data.targetLocale) {
    return NextResponse.json({ error: 'Ngôn ngữ đích trùng bản gốc' }, { status: 400 });
  }

  // Gắn nhóm bản dịch (tạo nhóm từ bản gốc nếu chưa có).
  const groupId = source.translationGroupId ?? source.id;
  if (!source.translationGroupId) {
    await upsertArticle({ ...source, translationGroupId: groupId });
  }

  const cfg = await getArticleConfig();
  const localized = await applyArticleRules(
    await localizeArticle({
      sourceMarkdown: source.markdown,
      sourceTitle: source.title,
      sourceLocale: source.locale,
      targetLocale: parsed.data.targetLocale as Locale,
      localKeyword: source.targetKeyword,
      override: parsed.data.provider
        ? { provider: parsed.data.provider, model: parsed.data.model }
        : undefined,
      maxTokens: cfg.maxTokens,
    }),
  );

  const scoreInput = buildScoreInput({
    title: localized.title,
    metaDescription: localized.metaDescription,
    slug: localized.slug,
    markdown: localized.markdown,
    locale: parsed.data.targetLocale,
    targetKeyword: source.targetKeyword,
  });

  const draft = await upsertArticle({
    title: localized.title,
    slug: localized.slug,
    metaDescription: localized.metaDescription,
    markdown: localized.markdown,
    locale: parsed.data.targetLocale,
    targetKeyword: source.targetKeyword,
    translationGroupId: groupId,
    seoScore: scoreSeo(scoreInput).score,
    aeoScore: scoreAeo(scoreInput).score,
    geoScore: scoreGeo(scoreInput).score,
    status: 'draft',
  });

  return NextResponse.json({ ok: true, draft });
}
