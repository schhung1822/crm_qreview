import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { AI_PROVIDERS } from '@/lib/secrets/store';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { analyzeStyle } from '@/lib/social/analyze';
import { getSocialReport, updateSocialReport } from '@/lib/store/social-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // 1 lần gọi AI trên digest nhiều chữ

const ID_RE = /^sr_[a-f0-9]+$/;
const BodySchema = z
  .object({
    provider: z.union([z.literal(''), z.enum(AI_PROVIDERS)]).default(''),
    model: z.string().max(120).optional(),
  })
  .default({});

// POST /api/social-report/[id]/style → rút hồ sơ style thương hiệu từ nội dung đã thu
// (chạy theo yêu cầu; lưu vào báo cáo để lần sau mở lại không tốn thêm token).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id))
    return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const report = await getSocialReport(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
  if (!['collected', 'done'].includes(report.status))
    return NextResponse.json(
      { error: 'Báo cáo chưa có dữ liệu nội dung - chờ thu thập xong đã.' },
      { status: 400 },
    );

  try {
    const style = await analyzeStyle(report, parsed.data);
    await updateSocialReport(params.id, (x) => {
      x.style = style;
    });
    return NextResponse.json({ style });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi rút style thương hiệu.' },
      { status: 502 },
    );
  }
}
