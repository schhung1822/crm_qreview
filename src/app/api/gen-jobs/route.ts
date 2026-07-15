// GET  /api/gen-jobs  → danh sách job tạo bài + đếm trạng thái (để hiện tiến độ, khôi phục sau reload).
// POST /api/gen-jobs  { action: 'retry' | 'clear' } → thử lại job lỗi / dọn job đã xong.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  clearFinishedGenJobs,
  countGenJobs,
  listGenJobs,
  retryErroredGenJobs,
} from '@/lib/store/gen-jobs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const jobs = await listGenJobs();
  return NextResponse.json({ jobs, counts: countGenJobs(jobs) });
}

const Body = z.object({ action: z.enum(['retry', 'clear']) });

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  if (parsed.data.action === 'retry') await retryErroredGenJobs();
  else await clearFinishedGenJobs();
  const jobs = await listGenJobs();
  return NextResponse.json({ ok: true, counts: countGenJobs(jobs) });
}
