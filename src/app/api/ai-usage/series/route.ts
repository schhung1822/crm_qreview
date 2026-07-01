import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { getUsageSeries } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/ai-usage/series?range=7|30|60|all  hoặc  ?from=YYYY-MM-DD&to=YYYY-MM-DD
// → chuỗi token theo ngày cho biểu đồ, theo khoảng thời gian đã lọc.
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;

  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const range = sp.get('range') ?? '7';

  let series;
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    series = await getUsageSeries({ from, to });
  } else if (range === 'all') {
    series = await getUsageSeries({ all: true });
  } else {
    const days = Number(range);
    series = await getUsageSeries({ days: Number.isFinite(days) && days > 0 ? days : 7 });
  }
  return NextResponse.json({ series });
}
