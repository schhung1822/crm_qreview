import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';
import { resolveKeywordProvider, type KeywordResearch } from '@/lib/keywords';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { saveKeywordSet } from '@/lib/store/keywordsets';

const BodySchema = z.object({
  seed: z.string().min(1).max(200),
  locale: z.enum(locales),
  save: z.boolean().optional(), // true → lưu thành 1 project (keyword set)
  // Chọn AI cụ thể để sinh danh sách từ khóa (tùy chọn).
  provider: z.enum(AI_PROVIDERS).optional(),
  model: z.string().max(120).optional(),
  // Người dùng chọn có dùng DataForSEO (số liệu thật) hay không. Mặc định có.
  useDataForSeo: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // AI + DataForSEO (API trả phí) mỗi lần gọi → giới hạn chống lạm dụng chi phí.
  const rl = rateLimit(`keywords:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const { seed, locale, provider: aiProvider, model, useDataForSeo } = parsed.data;
  const override = aiProvider ? { provider: aiProvider, model } : undefined;
  try {
    const provider = await resolveKeywordProvider(override, useDataForSeo);
    let result: KeywordResearch;
    try {
      result = await provider.research(seed, locale as Locale);
    } catch (dfsErr) {
      // DataForSEO lỗi (hết credit, sai tham số...) → tự hạ cấp về AI/mock để KHÔNG vỡ tính năng.
      if (!useDataForSeo) throw dfsErr;
      const fallback = await resolveKeywordProvider(override, false);
      result = await fallback.research(seed, locale as Locale);
    }

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
