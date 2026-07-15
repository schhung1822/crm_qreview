import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { listUsers } from '@/lib/auth/users';
import { getBiz } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';

// GET /api/biz/members-lite → thành viên biz đang hoạt động (id + tên) cho dropdown giao việc.
// Bất kỳ thành viên nào cũng đọc được (không lộ thông tin nhạy cảm).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const biz = g.bizId ? await getBiz(g.bizId) : null;
  if (!biz) return NextResponse.json({ members: [], self: g.user.id });
  const users = new Map((await listUsers()).map((u) => [u.id, u]));
  const members = biz.members.map((m) => ({
    id: m.userId,
    name: users.get(m.userId)?.name ?? m.userId,
  }));
  return NextResponse.json({ members, self: g.user.id });
}
