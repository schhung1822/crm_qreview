import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { memberRole } from '@/lib/store/biz';
import { createToken, listTokensForBiz, revokeToken } from '@/lib/store/api-tokens';

export const dynamic = 'force-dynamic';

// Quản lý API token của biz - CHỈ chủ/quản trị (token cấp quyền ghi bài diện rộng).
async function requireManager(bizId: string) {
  const g = await guard();
  if ('response' in g) return { error: g.response as NextResponse };
  const role = await memberRole(bizId, g.user.id);
  if (role !== 'owner' && role !== 'admin') {
    return { error: NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 }) };
  }
  return { userId: g.user.id };
}

// GET → danh sách token (không lộ token thô/hash).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  return NextResponse.json({ tokens: await listTokensForBiz(params.id) });
}

const CreateSchema = z.object({ name: z.string().max(80).optional() });

// POST → tạo token mới; TRẢ token thô DUY NHẤT lần này.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  if (!(await bizHasFeature(params.id, 'api'))) {
    return NextResponse.json(
      { error: 'API/Webhook thuộc gói Pro trở lên. Nâng cấp gói để dùng.', code: 'plan_feature' },
      { status: 403 },
    );
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  const { token, plaintext } = await createToken(
    params.id,
    parsed.data.name ?? 'API token',
    chk.userId,
  );
  return NextResponse.json({ token, plaintext }, { status: 201 });
}

// DELETE ?tokenId=... → thu hồi token.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const chk = await requireManager(params.id);
  if ('error' in chk) return chk.error;
  const tokenId = new URL(req.url).searchParams.get('tokenId');
  if (!tokenId) return NextResponse.json({ error: 'Thiếu tokenId' }, { status: 400 });
  const ok = await revokeToken(params.id, tokenId);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy token' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
