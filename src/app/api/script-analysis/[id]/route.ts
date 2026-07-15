import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { runScriptAnalysis } from '@/lib/script-analysis/runner';
import {
  deleteScriptAnalysis,
  getScriptAnalysis,
  STALE_MS,
  updateScriptAnalysis,
} from '@/lib/store/script-analyses';

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

const RetrySchema = z.object({
  provider: z.string().max(40).optional(),
  model: z.string().max(120).optional(),
});

// POST → PHÂN TÍCH LẠI một bản đã lỗi (hoặc xong) bằng AI/model MỚI người dùng chọn.
// Tái dùng transcript đã lấy (runner tự bỏ qua bước Apify nếu record đã có transcript).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (g.bizId && !(await bizHasFeature(g.bizId, 'videoScriptAnalysis'))) {
    return NextResponse.json(
      { error: 'Biz của bạn không có quyền dùng chức năng Phân tích kịch bản video.' },
      { status: 403 },
    );
  }
  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const record = await getScriptAnalysis(params.id);
  if (!record) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
  if (record.status === 'running') {
    return NextResponse.json({ error: 'Đang chạy, vui lòng đợi.' }, { status: 409 });
  }
  const parsed = RetrySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const hasTranscript = Boolean(record.transcript && record.transcript.trim().length >= 20);
  await updateScriptAnalysis(params.id, {
    ai: parsed.data.provider ? { provider: parsed.data.provider, model: parsed.data.model } : undefined,
    status: 'running',
    phase: hasTranscript ? 'analyzing' : 'transcript',
    error: undefined,
  });

  const ctx = { userId: g.user.id, bizId: g.bizId };
  void runWithBiz(ctx, () => runScriptAnalysis(params.id)).catch(() => {});
  return NextResponse.json({ id: params.id });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const ok = await deleteScriptAnalysis(params.id);
  return NextResponse.json({ ok });
}
