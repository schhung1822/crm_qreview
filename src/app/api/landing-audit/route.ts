import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { auditLanding } from '@/lib/landing/audit';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_HTML = 3_000_000; // 3MB — landing 1 file (HTML+CSS+JS inline) dư sức nằm trong ngưỡng này.

const BodySchema = z.object({
  html: z.string().min(1).max(MAX_HTML),
  fileName: z.string().max(300).optional(),
  baseUrl: z.string().max(2000).optional(), // khi kiểm bằng link → dùng URL đó trong bản vá đề xuất
});

// POST /api/landing-audit → chấm SEO/AEO/GEO 1 file landing (thuần tĩnh, không fetch mạng).
// Trả { report }. Không ghi gì ra ngoài — chỉ phân tích chuỗi HTML nhận được.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`landingaudit:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'File HTML không hợp lệ hoặc quá lớn (tối đa 3MB).' }, { status: 400 });
  }

  try {
    const report = auditLanding(parsed.data);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Không chấm được file.' },
      { status: 500 },
    );
  }
}
