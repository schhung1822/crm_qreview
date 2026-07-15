import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { retrySocialReport, runSocialReportStep, startSocialAnalysis } from '@/lib/social/runner';
import { toSummary } from '@/lib/social/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 1 tick có thể gồm poll Apify (waitForFinish 20s) hoặc 1 lần gọi AI → cho tối đa 120s.
export const maxDuration = 120;

const ID_RE = /^sr_[a-f0-9]+$/;
const BodySchema = z
  .object({
    retry: z.boolean().optional(),
    // Bắt đầu pha phân tích với AI/model người dùng chọn. provider '' = Tự động.
    analyze: z
      .object({
        provider: z.union([z.literal(''), z.enum(AI_PROVIDERS)]),
        model: z.string().max(120).optional(),
      })
      .optional(),
  })
  .default({});

// POST /api/social-report/[id]/step → chạy đúng 1 bước (client lặp tới khi done/error).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id))
    return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  // Client poll ~4s/lần trong lúc chạy → 30 lần/phút/IP là đủ rộng.
  const rl = rateLimit(`socialstep:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));

  // Lệnh BẮT ĐẦU (analyze/retry): chỉ đổi trạng thái rồi trả về NGAY - không chạy bước
  // AI dài trong cùng request, để UI hiện animation tiến trình tức thì; vòng lặp của
  // client sẽ gọi tick kế tiếp để thực thi bước.
  if (parsed.success && (parsed.data.analyze || parsed.data.retry)) {
    const started = parsed.data.analyze
      ? await startSocialAnalysis(params.id, parsed.data.analyze)
      : await retrySocialReport(params.id);
    if (!started) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
    return NextResponse.json({ report: toSummary(started), warnings: started.warnings });
  }

  const report = await runSocialReportStep(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
  // Tiến trình (stepIndex/stepCount/action/kênh) nằm sẵn trong summary.
  return NextResponse.json({ report: toSummary(report), warnings: report.warnings });
}
