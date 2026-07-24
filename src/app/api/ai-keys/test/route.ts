import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { testProviderKey } from '@/lib/ai/providers';
import { AI_PROVIDERS, getActiveKey } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  // Nếu gửi key → test key đó; nếu không → test key đã lưu trong store/env.
  key: z.string().optional(),
});

// POST /api/ai-keys/test → kiểm tra kết nối tới provider.
export async function POST(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const ctx = { userId: g.user.id, bizId: g.bizId };
  const key = parsed.data.key ?? (await runWithBiz(ctx, () => getActiveKey(parsed.data.provider)));
  if (!key) {
    return NextResponse.json({ ok: false, error: 'Chưa có API key' }, { status: 400 });
  }

  const result = await testProviderKey(parsed.data.provider, key);
  return NextResponse.json(result);
}
