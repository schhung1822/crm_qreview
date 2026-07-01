import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { auditFixGuide } from '@/lib/ai/content';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  label: z.string().min(1).max(300),
  shortFix: z.string().max(2000).optional().default(''),
  group: z.string().max(20),
  value: z.string().max(2000).optional(),
  url: z.string().min(3).max(2000),
  locale: z.string().max(12),
  aiProvider: z.string().max(40).optional(),
  aiModel: z.string().max(120).optional(),
});

// POST /api/audit/fix-guide → sinh hướng dẫn khắc phục chi tiết (Markdown) cho 1 lỗi audit,
// dùng AI người dùng chọn ở form. Trả { guide: string | null } (null khi chưa có key AI).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`fixguide:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  try {
    const guide = await auditFixGuide(parsed.data);
    return NextResponse.json({ guide });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi sinh hướng dẫn.' },
      { status: 502 },
    );
  }
}
