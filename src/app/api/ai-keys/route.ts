import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  AI_PROVIDERS,
  AI_TASKS,
  deleteProviderKey,
  getProvidersStatus,
  setProviderEnabled,
  setProviderKey,
  setProviderModel,
  setRouting,
} from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

// GET /api/ai-keys → trạng thái provider (đã che key) + định tuyến. KHÔNG trả key thật.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json(await getProvidersStatus());
}

const ProviderEnum = z.enum(AI_PROVIDERS);

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setKey'), provider: ProviderEnum, key: z.string().min(8) }),
  z.object({ action: z.literal('enable'), provider: ProviderEnum, enabled: z.boolean() }),
  z.object({ action: z.literal('model'), provider: ProviderEnum, model: z.string().min(1) }),
  z.object({ action: z.literal('routing'), task: z.enum(AI_TASKS), provider: ProviderEnum }),
]);

// POST /api/ai-keys → lưu key / bật-tắt / đổi model / đổi định tuyến.
export async function POST(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const body = parsed.data;

  switch (body.action) {
    case 'setKey':
      await setProviderKey(body.provider, body.key);
      break;
    case 'enable':
      await setProviderEnabled(body.provider, body.enabled);
      break;
    case 'model':
      await setProviderModel(body.provider, body.model);
      break;
    case 'routing':
      await setRouting(body.task, body.provider);
      break;
  }

  return NextResponse.json(await getProvidersStatus());
}

// DELETE /api/ai-keys?provider=openai → xóa key đã lưu của provider.
export async function DELETE(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const provider = new URL(req.url).searchParams.get('provider');
  const parsed = ProviderEnum.safeParse(provider);
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider không hợp lệ' }, { status: 400 });
  }
  await deleteProviderKey(parsed.data);
  return NextResponse.json(await getProvidersStatus());
}
