import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { deletePlan, getPlan, latestPlan, listPlans } from '@/lib/store/plans';

export const dynamic = 'force-dynamic';

// GET /api/plans            → danh sách plan
// GET /api/plans?id=...     → 1 plan
// GET /api/plans?latest=1   → plan mới nhất
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    const plan = await getPlan(id);
    if (!plan) return NextResponse.json({ error: 'Không tìm thấy plan' }, { status: 404 });
    return NextResponse.json({ plan });
  }
  if (url.searchParams.get('latest')) {
    return NextResponse.json({ plan: await latestPlan() });
  }
  return NextResponse.json({ plans: await listPlans() });
}

// DELETE /api/plans?id=... → xóa content plan (cần content:write).
export async function DELETE(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'thiếu id' }, { status: 400 });
  await deletePlan(id);
  return NextResponse.json({ plans: await listPlans() });
}
