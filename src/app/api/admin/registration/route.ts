// GET/POST /api/admin/registration → xem & bật/tắt TỰ ĐĂNG KÝ tài khoản mới (chỉ superadmin).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { getSelfRegistrationEnabled, setSelfRegistrationEnabled } from '@/lib/store/platform-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json({ selfRegistrationEnabled: await getSelfRegistrationEnabled() });
}

const Body = z.object({ enabled: z.boolean() });

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Giá trị không hợp lệ.' }, { status: 400 });
  }
  return NextResponse.json({
    selfRegistrationEnabled: await setSelfRegistrationEnabled(parsed.data.enabled),
  });
}
