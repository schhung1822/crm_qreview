import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAudit } from '@/lib/audit/run';
import { guard } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // audit crawl nhiều trang → cho phép chạy lâu

const BodySchema = z.object({
  url: z.string().min(3).max(2000),
  maxPages: z.number().int().min(1).max(25).optional(),
  performance: z.boolean().optional(),
  llmsMinScore: z.number().int().min(0).max(100).optional(),
  aiProvider: z.string().max(40).optional(), // '' tự động · 'none' tắt · tên provider
  aiModel: z.string().max(120).optional(),
});

// POST /api/audit → kiểm SEO/AEO/GEO toàn website (robots/AI-bot, render-không-JS,
// sitemap, schema, on-page mẫu, link gãy, và CWV nếu bật performance).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Audit tải nhiều trang + gọi ra ngoài → chống lạm dụng.
  const rl = rateLimit(`audit:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều lượt kiểm tra. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  try {
    const report = await runAudit(parsed.data);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi kiểm tra website.' },
      { status: 502 },
    );
  }
}
