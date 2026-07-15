// GET /api/admin/overview?days=30 → số liệu tổng hợp cho tab Tổng quan (superadmin).
import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { getPlatformOverview } from '@/lib/admin/platform-stats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  // Khoảng TÙY CHỈNH from/to (YYYY-MM-DD) hoặc N ngày gần nhất.
  if (isDate(from) && isDate(to)) {
    return NextResponse.json(await getPlatformOverview({ from, to }));
  }
  const days = Math.min(Math.max(7, Number(url.searchParams.get('days')) || 30), 366);
  return NextResponse.json(await getPlatformOverview({ days }));
}
