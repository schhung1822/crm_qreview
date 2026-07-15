// Nhật ký thao tác quản trị nền tảng qua API (superadmin). GET ?limit=.
import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { listAudit } from '@/lib/store/admin-audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const limit = Math.min(Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 200), 2000);
  return NextResponse.json({ entries: await listAudit(limit) });
}
