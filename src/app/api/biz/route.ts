import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { setBizCookie } from '@/lib/auth/cookie';
import { canAddBiz } from '@/lib/billing/entitlement';
import { createBiz, listBizesForUser } from '@/lib/store/biz';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/biz → danh sách biz của user + biz đang hoạt động.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const bizes = await listBizesForUser(g.user.id);
  return NextResponse.json({ bizes, activeBizId: g.bizId, activeRole: g.bizRole });
}

const CreateSchema = z.object({ name: z.string().min(1).max(120) });

// POST /api/biz → tạo biz mới (người tạo là chủ sở hữu) + chuyển sang biz đó.
export async function POST(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tên biz không hợp lệ.' }, { status: 400 });
  // Giới hạn số biz theo gói (agency mới tạo được nhiều workspace).
  const lim = await canAddBiz(g.user.id);
  if (!lim.ok) {
    return NextResponse.json(
      { error: `Gói hiện tại chỉ cho phép ${lim.max} biz. Nâng cấp gói để tạo thêm.`, code: 'plan_limit' },
      { status: 403 },
    );
  }
  const biz = await createBiz(parsed.data.name, g.user.id);
  const res = NextResponse.json({ biz: { id: biz.id, name: biz.name } });
  setBizCookie(res, biz.id); // tự chuyển sang biz vừa tạo
  return res;
}
