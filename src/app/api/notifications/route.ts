import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { listNotifs, markRead } from '@/lib/store/notifications';

export const dynamic = 'force-dynamic';

// GET /api/notifications → thông báo của tôi trong biz đang hoạt động + số chưa đọc.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const notifs = await listNotifs(g.user.id);
  return NextResponse.json({ notifs, unread: notifs.filter((n) => !n.read).length });
}

const Schema = z.object({ id: z.string().max(64).optional() });

// POST /api/notifications → đánh dấu đã đọc: { id } cho 1, hoặc không id → tất cả.
export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  await markRead(g.user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
