import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { clearDriveCreds, setDriveCreds } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  clientId: z.string().min(5).max(400),
  clientSecret: z.string().min(5).max(400),
});

// POST /api/drive/config → lưu OAuth credential (Client ID/Secret) người dùng nhập (mã hóa).
// Cấu hình credential/kết nối là thao tác NHẠY CẢM → yêu cầu 'connections:manage' (owner/admin có;
// editor CHỈ có content:write nên KHÔNG đụng được secret OAuth của biz).
export async function POST(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Client ID / Secret không hợp lệ.' }, { status: 400 });
  }
  await setDriveCreds(parsed.data.clientId, parsed.data.clientSecret);
  return NextResponse.json({ ok: true });
}

// DELETE /api/drive/config → xóa credential + ngắt kết nối.
export async function DELETE() {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  await clearDriveCreds();
  return NextResponse.json({ ok: true });
}
