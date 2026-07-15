import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { locales, type Locale } from '@/i18n/config';
import { generateBlueprint } from '@/lib/ai/content';
import { aiReady, type AiOverride } from '@/lib/ai/providers';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { taskOverride } from '@/lib/store/task-routing';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  topic: z.string().min(1).max(300),
  targetKeyword: z.string().max(200).optional(),
  locale: z.enum(locales),
  // Nội dung nguồn (file/URL) đã trích - để AI phân tích & lập khung từ đó.
  source: z.string().max(60_000).optional(),
  // Override AI tại chỗ (tùy chọn). Không truyền → dùng định tuyến tác vụ 'blueprint'.
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

// POST /api/articles/blueprint → AI lập KHUNG nội dung (kịch bản/dàn ý/keyword).
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
  if (!(await aiReady())) {
    return NextResponse.json({ ok: false, needsKey: true });
  }

  // AI lên khung: ưu tiên override gửi lên, else định tuyến tác vụ 'blueprint'.
  const override: AiOverride | undefined = parsed.data.provider
    ? { provider: parsed.data.provider, model: parsed.data.model }
    : await taskOverride('blueprint');

  const blueprint = await generateBlueprint({
    topic: parsed.data.topic,
    targetKeyword: parsed.data.targetKeyword,
    locale: parsed.data.locale as Locale,
    source: parsed.data.source,
    override,
  });

  if (!blueprint) {
    return NextResponse.json({ ok: false, error: 'AI không tạo được khung nội dung. Thử lại hoặc đổi model.' });
  }
  return NextResponse.json({ ok: true, blueprint });
}
