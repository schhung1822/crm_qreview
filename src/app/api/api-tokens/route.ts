import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { runWithBiz } from '@/lib/biz/context';
import { createToken, listTokensForBiz, revokeToken } from '@/lib/store/api-tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const tokens = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listTokensForBiz(g.bizId));
  return NextResponse.json({ tokens });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ten token khong hop le' }, { status: 400 });
  }

  const created = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () =>
    createToken(g.bizId, parsed.data.name, g.user.id),
  );
  return NextResponse.json(created);
}

export async function DELETE(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thieu id' }, { status: 400 });

  const ok = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => revokeToken(g.bizId, id));
  if (!ok) return NextResponse.json({ error: 'Khong tim thay token' }, { status: 404 });

  const tokens = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listTokensForBiz(g.bizId));
  return NextResponse.json({ tokens });
}
