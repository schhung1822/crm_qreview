// Sinh 1 bài + chấm điểm + LƯU bản nháp. Dùng chung cho:
//  • /api/articles/auto (viết 1 bài tức thì)
//  • worker dây chuyền tạo bài hàng loạt (gen/runner.ts)
// Giữ NGUYÊN logic của auto route (getArticleConfig → generateArticle → applyArticleRules →
// pickBestKeyword → chấm SEO/AEO/GEO → upsertArticle draft). Server-only.
import type { Locale } from '@/i18n/config';
import { generateArticle } from '@/lib/ai/content';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { buildScoreInput } from '@/lib/scoring/types';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { upsertArticle, type ArticleRecord } from '@/lib/store/articles';

export interface GenerateDraftInput {
  title: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  outline?: string[];
  locale: Locale;
  internalLinks?: Array<{ anchor: string; url: string }>;
}

export interface GenerateDraftResult {
  draft?: ArticleRecord; // vắng nếu requireAi=true nhưng AI không chạy thật
  usedAi: boolean;
  aiError?: string;
  seo: number;
  aeo: number;
  geo: number;
}

// requireAi=true (dây chuyền): nếu AI KHÔNG chạy thật (thiếu key/lỗi provider/hết quota) → KHÔNG lưu
// bản nháp giả, trả usedAi=false để worker đánh job 'error'. requireAi=false (auto route cũ): lưu như cũ.
export async function generateDraftFromItem(
  input: GenerateDraftInput,
  opts?: { requireAi?: boolean },
): Promise<GenerateDraftResult> {
  const cfg = await getArticleConfig();
  const gen = await generateArticle({ ...input, maxTokens: cfg.maxTokens });
  if (opts?.requireAi && !gen.usedAi) {
    return { usedAi: false, aiError: gen.error, seo: 0, aeo: 0, geo: 0 };
  }
  const article = await applyArticleRules(gen.article);
  const targetKeyword = pickBestKeyword({
    title: article.title,
    markdown: article.markdown,
    metaDescription: article.metaDescription,
    slug: article.slug,
    locale: input.locale,
    current: input.targetKeyword,
  });
  const scoreInput = buildScoreInput({
    title: article.title,
    metaDescription: article.metaDescription,
    slug: article.slug,
    markdown: article.markdown,
    locale: input.locale,
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
    locale: input.locale,
    targetKeyword,
    tags: article.tags,
    seoScore: seo.score,
    aeoScore: aeo.score,
    geoScore: geo.score,
    status: 'draft',
  });
  return { draft, usedAi: gen.usedAi, aiError: gen.error, seo: seo.score, aeo: aeo.score, geo: geo.score };
}
