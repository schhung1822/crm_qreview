import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { deleteJob, listJobs } from '@/lib/store/publish-jobs';

export const dynamic = 'force-dynamic';

// GET /api/jobs → danh sách job đăng (lịch đăng + lịch sử). KHÔNG trả nội dung bài đầy
// đủ ra ngoài (gọn + tránh lộ), chỉ metadata cần cho UI.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const jobs = await listJobs();
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      connectionId: j.connectionId,
      title: j.article.title,
      status: j.status,
      runAt: j.runAt,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      resultUrl: j.resultUrl,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  });
}

// DELETE /api/jobs?id=... → xóa/hủy 1 job (vd hủy lịch đăng).
export async function DELETE(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'thiếu id' }, { status: 400 });
  await deleteJob(id);
  return NextResponse.json({ ok: true });
}
