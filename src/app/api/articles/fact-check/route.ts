import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkClaims } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { aiNessScore } from '@/lib/content/ai-ness';
import { checkArticleLinks } from '@/lib/content/factcheck';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { locales, type Locale } from '@/i18n/config';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  markdown: z.string().min(1).max(400_000),
  locale: z.enum(locales),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/fact-check → kiểm chứng bài:
//  - links: trạng thái sống/chết của các link trích dẫn (deterministic, safeFetch).
//  - claims: phát biểu định lượng thiếu nguồn (AI, nếu có key).
//  - aiNess: heuristic dấu hiệu "giọng AI" (deterministic).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  if (g.bizId && !(await bizHasFeature(g.bizId, 'factCheck'))) {
    return NextResponse.json(
      { error: 'Kiểm chứng & nhân hóa thuộc gói Pro trở lên. Nâng cấp gói để dùng.', code: 'plan_feature' },
      { status: 403 },
    );
  }

  // Kiểm link = fetch ra ngoài + có thể gọi AI → giới hạn tần suất (dùng chung quỹ 'ai:').
  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const { markdown, locale, provider, model } = parsed.data;

  const aiNess = aiNessScore(markdown);
  const links = await checkArticleLinks(markdown);

  // Claims cần AI - chỉ chạy nếu có key. Vượt hạn mức → báo nhẹ, không làm hỏng phần link/aiNess.
  let claims: Array<{ claim: string; note: string }> = [];
  let claimsError: string | undefined;
  if (await aiReady()) {
    try {
      claims = await checkClaims({
        markdown,
        locale: locale as Locale,
        override: provider ? { provider, model } : undefined,
      });
    } catch (e) {
      claimsError = e instanceof Error ? e.message : 'Lỗi kiểm số liệu';
    }
  }

  return NextResponse.json({
    links,
    deadLinks: links.filter((l) => !l.ok).length,
    claims,
    claimsError,
    aiNess,
  });
}
