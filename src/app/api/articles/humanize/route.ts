import { NextResponse } from 'next/server';
import { z } from 'zod';
import { humanizeArticle } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { locales, type Locale } from '@/i18n/config';
import { applyArticleRules } from '@/lib/store/article-config';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  markdown: z.string().min(1).max(400_000),
  locale: z.enum(locales),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/humanize → viết lại bài cho tự nhiên hơn (bớt "giọng AI"), giữ nguyên
// nghĩa/ảnh/link/bảng/FAQ + số liệu. Trả markdown mới.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  if (g.bizId && !(await bizHasFeature(g.bizId, 'humanize'))) {
    return NextResponse.json(
      { error: 'Nhân hóa thuộc gói Pro trở lên. Nâng cấp gói để dùng.', code: 'plan_feature' },
      { status: 403 },
    );
  }

  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu AI. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const { markdown, locale, provider, model } = parsed.data;

  if (!(await aiReady())) return NextResponse.json({ ok: false, needsKey: true });

  const { markdown: out, error } = await humanizeArticle({
    markdown,
    locale: locale as Locale,
    override: provider ? { provider, model } : undefined,
  });
  if (!out) return NextResponse.json({ ok: false, error: error ?? 'AI không trả về kết quả hợp lệ' });

  const ruled = await applyArticleRules({ markdown: out });
  return NextResponse.json({ ok: true, markdown: ruled.markdown ?? out });
}
