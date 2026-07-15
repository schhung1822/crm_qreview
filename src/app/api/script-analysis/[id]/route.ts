import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { deleteScriptAnalysis, getScriptAnalysis, STALE_MS } from '@/lib/store/script-analyses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET → chi tiết 1 bản phân tích (poll tiến độ + kết quả). DELETE → xóa khỏi lịch sử.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const record = await getScriptAnalysis(params.id);
  if (!record) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  const stale = record.status === 'running' && Date.now() - Date.parse(record.updatedAt) > STALE_MS;
  return NextResponse.json({ record, stale });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const ok = await deleteScriptAnalysis(params.id);
  return NextResponse.json({ ok });
}
