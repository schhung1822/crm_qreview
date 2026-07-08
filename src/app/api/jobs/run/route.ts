import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { runDueJobs, runDueJobsAllBiz } from '@/lib/publish/runner';

export const dynamic = 'force-dynamic';

// POST /api/jobs/run → chạy các job đăng đến hạn (lịch đăng / retry).
// Cho phép gọi từ:
//  • Worker/cron: header x-cron-secret khớp env CRON_SECRET (không cần đăng nhập).
//  • Người dùng đã đăng nhập có quyền content:publish (nút "Chạy ngay").
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret');
  const viaCron = !!secret && provided === secret;
  if (!viaCron) {
    // Người dùng bấm "Chạy ngay": guard nạp ngữ cảnh biz đang hoạt động (cookie sg_biz) →
    // runDueJobs() chỉ quét job của CHÍNH biz đó.
    const g = await guard('content:publish');
    if ('response' in g) return g.response;
    const result = await runDueJobs({ limit: 25 });
    return NextResponse.json(result);
  }
  // Cron/worker: KHÔNG có ngữ cảnh biz → phải quét job của MỌI biz (nếu không sẽ đọc file .data
  // gốc rỗng và bỏ sót toàn bộ job hẹn giờ của các tenant).
  const result = await runDueJobsAllBiz({ limit: 25 });
  return NextResponse.json(result);
}
