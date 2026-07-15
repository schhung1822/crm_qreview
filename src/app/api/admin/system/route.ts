import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getSystemInfo, measureNetworkSpeed } from '@/lib/system/info';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // cần os/fs → không chạy edge

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await getSystemInfo());
}

const Body = z.object({ action: z.literal('netspeed') });

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });

  // Đo mạng gọi ra Internet + tốn băng thông → giới hạn tần suất.
  const rl = rateLimit(`netspeed:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { ok: false, error: `Thử quá nhiều lần. Đợi ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );

  try {
    const r = await measureNetworkSpeed();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'error', code: 'sysNetErr' },
      { status: 502 },
    );
  }
}
