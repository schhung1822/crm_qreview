import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { generateArticle, proposeBrief } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { buildScoreInput } from '@/lib/scoring/types';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';

const BodySchema = z.object({
  // Tiêu đề + từ khóa KHÔNG bắt buộc: có thể viết chỉ từ "Yêu cầu của bạn" (research) →
  // server tự suy ra tiêu đề/từ khóa. Bắt buộc phải có ÍT NHẤT title hoặc research.
  title: z.string().max(300).optional().default(''),
  targetKeyword: z.string().max(200).optional().default(''),
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

  // AI sinh bài → giới hạn chống lạm dụng chi phí.
  const rl = rateLimit(`article:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const ready = await aiReady();
  const { provider, model, ...rest } = parsed.data;
  const override = provider ? { provider, model } : undefined;

  // Chuẩn hóa & suy ra brief khi thiếu tiêu đề/từ khóa (viết chỉ từ "Yêu cầu của bạn").
  let genTitle = rest.title.trim();
  let genKeyword = rest.targetKeyword.trim();
  const research = rest.research?.trim();
  if (!genTitle && !research) {
    return NextResponse.json(
      { error: 'Hãy nhập tiêu đề, từ khóa hoặc "Yêu cầu của bạn" để AI viết bài.' },
      { status: 400 },
    );
  }
  if ((!genTitle || !genKeyword) && research) {
    const brief = await proposeBrief({ request: research, locale: parsed.data.locale as Locale, override });
    if (brief) {
      genTitle = genTitle || brief.title;
      genKeyword = genKeyword || brief.keyword;
    }
  }
  // Nếu vẫn thiếu → ĐỂ TRỐNG (KHÔNG nhồi nguyên văn yêu cầu vào tiêu đề). Prompt viết bài sẽ
  // yêu cầu model tự đặt tiêu đề/từ khóa sạch từ nội dung; pickBestKeyword chốt keyword sau.

  const cfg = await getArticleConfig();
  const gen = await generateArticle({
    ...rest,
    title: genTitle,
    targetKeyword: genKeyword,
    locale: parsed.data.locale as Locale,
    override,
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
    current: genKeyword,
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
