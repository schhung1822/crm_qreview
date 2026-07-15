import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { locales, type Locale } from '@/i18n/config';
import { editContent } from '@/lib/ai/content';
import { aiReady } from '@/lib/ai/providers';
import { applyArticleRules, getArticleConfig } from '@/lib/store/article-config';
import { AI_PROVIDERS } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  instruction: z.string().min(1).max(2000),
  selection: z.string().max(20000).optional(),
  markdown: z.string().max(400_000),
  title: z.string().max(300).default(''),
  targetKeyword: z.string().max(200).optional(),
  locale: z.enum(locales),
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/edit → AI sửa bài theo yêu cầu tự nhiên (chat trong trình soạn).
// Có selection → chỉ trả phần thay thế đoạn đó; không → trả markdown cả bài đã sửa.
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
  const { result, error } = await editContent({
    instruction: input.instruction,
    selection: input.selection,
    fullMarkdown: input.markdown,
    title: input.title,
    targetKeyword: input.targetKeyword,
    locale: input.locale as Locale,
    override: provider ? { provider, model } : undefined,
    maxTokens: cfg.maxTokens,
  });
  if (!result) {
    return NextResponse.json({ ok: false, error: error ?? 'AI không trả về kết quả hợp lệ' });
  }

  // Áp quy tắc thay thế (em-dash → -, keyword…) lên đoạn AI trả để đồng bộ với phần còn lại.
  const ruled = await applyArticleRules({ markdown: result.text });
  return NextResponse.json({ ok: true, text: ruled.markdown ?? result.text, note: result.note });
}
