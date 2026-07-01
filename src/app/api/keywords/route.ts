import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { resolveKeywordProvider } from '@/lib/keywords';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { saveKeywordSet } from '@/lib/store/keywordsets';

const BodySchema = z.object({
  seed: z.string().min(1).max(200),
  locale: z.enum(locales),
  save: z.boolean().optional(), // true → lưu thành 1 project (keyword set)
  // Chọn AI cụ thể để sinh danh sách từ khóa (tùy chọn).
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const { seed, locale, provider: aiProvider, model } = parsed.data;
  try {
    const provider = await resolveKeywordProvider(
      aiProvider ? { provider: aiProvider, model } : undefined,
    );
    const result = await provider.research(seed, locale as Locale);

    // Map sang shape mà UI dùng (giữ đủ chỉ số).
    const keywords = result.keywords.map((k) => ({
      term: k.term,
      cluster: k.cluster,
      volume: k.volume,
      difficulty: k.difficulty,
      cpc: k.cpc,
      competition: k.competition,
      trend: k.trend,
      opportunity: k.opportunity,
      intent: k.intent.charAt(0).toUpperCase() + k.intent.slice(1),
      type: k.type,
    }));

    let setId: string | undefined;
    if (parsed.data.save) {
      const set = await saveKeywordSet({
        seed: result.seed,
        locale: result.locale,
        estimated: result.estimated,
        keywords,
        clusters: result.clusters,
      });
      setId = set.id;
    }

    return NextResponse.json({
      setId,
      seed: result.seed,
      locale: result.locale,
      estimated: result.estimated,
      clusters: result.clusters,
      keywords,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi không xác định' },
      { status: 500 },
    );
  }
}
