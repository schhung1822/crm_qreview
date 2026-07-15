// Quản lý TOKEN API quản trị nền tảng (superadmin, xác thực phiên). Tạo/liệt kê/thu hồi các token
// 'sga_...' dùng cho /api/v1/admin/*. Token thô chỉ hiện DUY NHẤT lúc tạo.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import {
  API_SCOPES,
  createPlatformToken,
  listPlatformTokens,
  revokePlatformToken,
} from '@/lib/store/platform-api-tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json({ tokens: await listPlatformTokens(), scopes: API_SCOPES });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).optional(), // vắng = full 4 scope
});

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const { token, plaintext } = await createPlatformToken(parsed.data.name, chk.userId, parsed.data.scopes);
  // plaintext CHỈ trả về lần này - client phải lưu ngay.
  return NextResponse.json({ ok: true, token, plaintext });
}

export async function DELETE(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id', code: 'errIdMissing' }, { status: 400 });
  const ok = await revokePlatformToken(id);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy token', code: 'errTokenNotFound' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
