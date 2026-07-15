import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { accountInfo, DataForSeoError } from '@/lib/dataforseo/client';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Có thể test credential đang nhập (chưa lưu) hoặc credential đã lưu (body rỗng).
const BodySchema = z
  .object({
    login: z.string().min(3).max(200).optional(),
    password: z.string().min(3).max(400).optional(),
  })
  .optional();

// POST /api/dataforseo/test → gọi /appendix/user_data để xác thực + trả số dư tài khoản.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rl = rateLimit(`dfstest:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => undefined));
  const body = parsed.success ? parsed.data : undefined;
  const override =
    body?.login && body?.password
      ? { login: body.login, password: body.password, source: 'store' as const }
      : undefined;

  try {
    const acc = await accountInfo(override);
    return NextResponse.json({ ok: true, ...acc });
  } catch (err) {
    const message = err instanceof DataForSeoError ? err.message : 'Không kết nối được DataForSEO.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
