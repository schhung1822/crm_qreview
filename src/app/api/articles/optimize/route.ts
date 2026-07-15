import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { optimizeArticle } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { buildScoreInput } from '@/lib/scoring/types';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  title: z.string().min(1).max(300),
  markdown: z.string().min(1).max(400_000),
  metaDescription: z.string().max(2000).optional(),
  targetKeyword: z.string().max(200).optional(),
  locale: z.enum(locales),
  weakPoints: z.array(z.string().max(500)).max(100).optional(),
  internalLinks: z
    .array(z.object({ anchor: z.string().max(300), url: z.string().max(2000) }))
    .max(100)
    .optional(),
  // Chọn AI cụ thể ở trình soạn thảo (tùy chọn).
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/optimize → AI cải thiện bài để tăng SEO+GEO, kèm điểm trước/sau.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // AI cải thiện bài → giới hạn chống lạm dụng chi phí.
  const rl = rateLimit(`article:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const input = parsed.data;

  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }

  const before = scoreInput(input);
  const { provider, model, ...rest } = input;
  const cfg = await getArticleConfig();
  const { result, error } = await optimizeArticle({
    ...rest,
    locale: input.locale as Locale,
    override: provider ? { provider, model } : undefined,
    maxTokens: cfg.maxTokens,
  });
  if (!result) {
    return NextResponse.json({ ok: false, error: error ?? 'AI không trả về kết quả hợp lệ' });
  }
  // Áp quy tắc thay thế keyword/ký tự do người dùng cấu hình.
  const ruled = await applyArticleRules(result);
  Object.assign(result, ruled);

  // Sau khi tối ưu: chọn lại target keyword bám nội dung MỚI cho điểm cao nhất.
  const targetKeyword = pickBestKeyword({
    title: result.title,
    markdown: result.markdown,
    metaDescription: result.metaDescription,
    slug: result.slug,
    locale: input.locale,
    current: input.targetKeyword,
  });

  const after = scoreInput({
    title: result.title,
    markdown: result.markdown,
    metaDescription: result.metaDescription,
    locale: input.locale,
    targetKeyword,
  });

  return NextResponse.json({
    ok: true,
    result,
    targetKeyword,
    before: { seo: before.seo.score, aeo: before.aeo.score, geo: before.geo.score },
    after: { seo: after.seo.score, aeo: after.aeo.score, geo: after.geo.score },
  });
}

// Dùng ĐÚNG hàm chấm điểm chung với editor → before/after khớp, không lệch.
function scoreInput(a: {
  title: string;
  markdown: string;
  metaDescription?: string;
  locale: string;
  targetKeyword?: string;
}) {
  const si = buildScoreInput(a);
  return { seo: scoreSeo(si), aeo: scoreAeo(si), geo: scoreGeo(si) };
}
