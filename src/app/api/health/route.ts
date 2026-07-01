import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { hasDatabase, hasKeywordProvider } from '@/lib/env';
import { getProvidersStatus } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

// GET /api/health → trạng thái tích hợp (để biết đang chạy mock hay thật).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const { providers, routing } = await getProvidersStatus();
  const aiReady = providers.some((p) => p.hasKey && p.enabled);
  return NextResponse.json({
    ok: true,
    integrations: {
      ai: Object.fromEntries(providers.map((p) => [p.id, p.hasKey && p.enabled])),
      routing,
      keywordProvider: hasKeywordProvider(),
      database: hasDatabase(),
    },
    mode: aiReady ? 'live' : 'mock-fallback',
  });
}
