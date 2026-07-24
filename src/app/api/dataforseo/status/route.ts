import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { getDataForSeoState } from '@/lib/store/dataforseo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dataforseo/status → { configured, credSource, login? } (KHÔNG lộ password).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const ctx = { userId: g.user.id, bizId: g.bizId };
  return NextResponse.json(await runWithBiz(ctx, () => getDataForSeoState()));
}
