import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { citationEngines, runCitationCheck } from '@/lib/citations/run';
import { getCitationConfig, saveCitationRun, setCitationConfig } from '@/lib/citations/store';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // chạy nhiều câu hỏi qua engine AI → cho phép lâu

// GET /api/citations → cấu hình + lần chạy gần nhất + engine khả dụng.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  const [config, engines] = await Promise.all([getCitationConfig(), citationEngines()]);
  return NextResponse.json({ config, engines });
}

const ConfigSchema = z.object({
  action: z.literal('config'),
  domain: z.string().max(200),
  queries: z.array(z.string().max(300)).max(20),
});
const RunSchema = z.object({ action: z.literal('run') });
const BodySchema = z.discriminatedUnion('action', [ConfigSchema, RunSchema]);

// POST /api/citations → lưu cấu hình (action=config) hoặc chạy kiểm tra (action=run).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  if (parsed.data.action === 'config') {
    const queries = parsed.data.queries.map((q) => q.trim()).filter(Boolean);
    const config = await setCitationConfig(parsed.data.domain, queries);
    return NextResponse.json({ config });
  }

  // action === 'run' - tốn AI → chống lạm dụng.
  const rl = rateLimit(`citations:${clientIp(req)}`, 4, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều lượt chạy. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }
  const cfg = await getCitationConfig();
  try {
    const run = await runCitationCheck(cfg.domain, cfg.queries);
    const config = await saveCitationRun(run);
    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi chạy kiểm tra.' },
      { status: 502 },
    );
  }
}
