import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
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

function apiError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown server error';
  console.error('[api/ai-keys]', message, err);
  const isEncryption = message.includes('ENCRYPTION_KEY') || message.toLowerCase().includes('encryption');
  return NextResponse.json(
    {
      error: isEncryption
        ? 'Chua cau hinh ENCRYPTION_KEY hop le tren server production. Vui long them bien moi truong ENCRYPTION_KEY base64 32 bytes roi deploy lai.'
        : message,
    },
    { status: 500 },
  );
}

export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const ctx = { userId: g.user.id, bizId: g.bizId };
  try {
    return NextResponse.json(await runWithBiz(ctx, () => getProvidersStatus()));
  } catch (err) {
    return apiError(err);
  }
}

const ProviderEnum = z.enum(AI_PROVIDERS);

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setKey'), provider: ProviderEnum, key: z.string().min(8) }),
  z.object({ action: z.literal('enable'), provider: ProviderEnum, enabled: z.boolean() }),
  z.object({ action: z.literal('model'), provider: ProviderEnum, model: z.string().min(1) }),
  z.object({ action: z.literal('routing'), task: z.enum(AI_TASKS), provider: ProviderEnum }),
]);

export async function POST(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham so khong hop le' }, { status: 400 });
  }
  const body = parsed.data;

  const ctx = { userId: g.user.id, bizId: g.bizId };
  try {
    await runWithBiz(ctx, async () => {
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
    });

    return NextResponse.json(await runWithBiz(ctx, () => getProvidersStatus()));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;

  const provider = new URL(req.url).searchParams.get('provider');
  const parsed = ProviderEnum.safeParse(provider);
  if (!parsed.success) {
    return NextResponse.json({ error: 'provider khong hop le' }, { status: 400 });
  }
  const ctx = { userId: g.user.id, bizId: g.bizId };
  try {
    await runWithBiz(ctx, () => deleteProviderKey(parsed.data));
    return NextResponse.json(await runWithBiz(ctx, () => getProvidersStatus()));
  } catch (err) {
    return apiError(err);
  }
}
