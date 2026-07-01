import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { AI_PROVIDERS, getActiveKey } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const ProviderEnum = z.enum(AI_PROVIDERS);

// GET /api/ai-keys/reveal?provider=openai → trả FULL key đã lưu (chỉ cho người quản lý
// API key, để xem lại khóa của chính mình qua icon mắt). Không log key.
export async function GET(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const parsed = ProviderEnum.safeParse(new URL(req.url).searchParams.get('provider'));
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider không hợp lệ' }, { status: 400 });
  }
  const key = await getActiveKey(parsed.data);
  if (!key) {
    return NextResponse.json({ error: 'Chưa có API key' }, { status: 404 });
  }
  return NextResponse.json({ key });
}
