import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { setBizCookie } from '@/lib/auth/cookie';
import { memberRole } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ bizId: z.string().min(1).max(60) });

// POST /api/biz/switch → chuyển biz đang hoạt động (chỉ khi user là thành viên biz đó).
export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const role = await memberRole(parsed.data.bizId, g.user.id);
  if (!role) return NextResponse.json({ error: 'Bạn không thuộc biz này.' }, { status: 403 });

  const res = NextResponse.json({ ok: true, bizId: parsed.data.bizId });
  setBizCookie(res, parsed.data.bizId);
  return res;
}
