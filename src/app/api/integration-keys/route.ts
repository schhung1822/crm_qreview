import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  deleteIntegrationKey,
  getIntegrationKey,
  INTEGRATIONS,
  integrationStatus,
  setIntegrationKey,
} from '@/lib/store/integrations';

export const dynamic = 'force-dynamic';

// GET /api/integration-keys → trạng thái các khóa (masked). Với ?reveal=<id> → trả FULL
// key (chỉ cho người quản lý API key, để xem lại khóa của mình qua icon mắt).
export async function GET(req: Request) {
  const reveal = new URL(req.url).searchParams.get('reveal');
  if (reveal) {
    const g = await guard('aikeys:manage');
    if ('response' in g) return g.response;
    if (!INTEGRATIONS.some((i) => i.id === reveal)) {
      return NextResponse.json({ error: 'id không hợp lệ' }, { status: 400 });
    }
    const key = await getIntegrationKey(reveal);
    if (!key) return NextResponse.json({ error: 'Chưa có API key' }, { status: 404 });
    return NextResponse.json({ key });
  }
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json({ integrations: await integrationStatus() });
}

const ids = INTEGRATIONS.map((i) => i.id) as [string, ...string[]];
const BodySchema = z.object({
  id: z.enum(ids),
  value: z.string().min(1).max(500),
});

// POST /api/integration-keys → lưu 1 khóa (cần quyền quản lý API key).
export async function POST(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  await setIntegrationKey(parsed.data.id, parsed.data.value);
  return NextResponse.json({ integrations: await integrationStatus() });
}

// DELETE /api/integration-keys?id=... → xóa 1 khóa.
export async function DELETE(req: Request) {
  const g = await guard('aikeys:manage');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !INTEGRATIONS.some((i) => i.id === id)) {
    return NextResponse.json({ error: 'id không hợp lệ' }, { status: 400 });
  }
  await deleteIntegrationKey(id);
  return NextResponse.json({ integrations: await integrationStatus() });
}
