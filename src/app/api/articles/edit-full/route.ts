import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { locales, type Locale } from '@/i18n/config';
import { editArticleFull } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  instruction: z.string().min(1).max(2000),
  title: z.string().max(300).default(''),
  metaDescription: z.string().max(2000).optional(),
  slug: z.string().max(300).optional(),
  markdown: z.string().max(400_000),
  tags: z.array(z.string().max(200)).max(100).optional(),
  targetKeyword: z.string().max(200).optional(),
  locale: z.enum(locales),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/edit-full → AI sửa TOÀN BỘ bài theo yêu cầu tự nhiên (panel "Nhập yêu cầu
// chỉnh sửa"): trả về tiêu đề, từ khóa, slug, meta, thẻ, nội dung đã cập nhật đồng bộ.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Chống lạm dụng token AI: giới hạn tần suất gọi (dùng chung 1 quỹ cho các route sinh nội dung AI).
  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu AI. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { provider, model, ...input } = parsed.data;

  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }

  const cfg = await getArticleConfig();
  const { result, error } = await editArticleFull({
    instruction: input.instruction,
    title: input.title,
    metaDescription: input.metaDescription,
    slug: input.slug,
    markdown: input.markdown,
    tags: input.tags,
    targetKeyword: input.targetKeyword,
    locale: input.locale as Locale,
    override: provider ? { provider, model } : undefined,
    maxTokens: cfg.maxTokens,
  });
  if (!result) {
    return NextResponse.json({ ok: false, error: error ?? 'AI không trả về kết quả hợp lệ' });
  }

  // Áp quy tắc thay thế (em-dash → -, keyword…) lên các trường văn bản. KHÔNG đụng slug.
  const ruled = await applyArticleRules({
    title: result.title,
    metaDescription: result.metaDescription,
    markdown: result.markdown,
    tags: result.tags,
  });
  return NextResponse.json({
    ok: true,
    result: {
      title: ruled.title,
      metaDescription: ruled.metaDescription,
      markdown: ruled.markdown,
      tags: ruled.tags,
      slug: result.slug,
      targetKeyword: result.targetKeyword,
    },
    note: result.note,
  });
}
