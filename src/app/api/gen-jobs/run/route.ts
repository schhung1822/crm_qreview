// POST /api/gen-jobs/run → chạy ĐÚNG 1 job tạo bài kế tiếp. Client bấm "Tạo hàng loạt" sẽ gọi LẶP
// endpoint này tới khi hết hàng đợi (chạy được KHÔNG cần cron ngoài). Mỗi call giới hạn 1 bài để
// không vượt thời gian request.
import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { runNextGenJob } from '@/lib/gen/runner';
import { countGenJobs, listGenJobs } from '@/lib/store/gen-jobs';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  // Mỗi call tạo tối đa 1 bài (tốn AI). Rate-limit đủ rộng cho vòng lặp tuần tự của client.
  const rl = rateLimit(`genrun:${clientIp(req)}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.`, retryAfter: rl.retryAfter }, { status: 429 });
  }
  const r = await runNextGenJob();
  const jobs = await listGenJobs();
  return NextResponse.json({ processed: r.processed, job: r.job, counts: countGenJobs(jobs) });
}
