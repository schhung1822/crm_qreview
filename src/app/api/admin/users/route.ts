import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { deleteUser, setPassword, updateUser } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

const uid = z.string().min(1).max(64);
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), userId: uid }),
  z.object({ action: z.literal('activate'), userId: uid }),
  z.object({ action: z.literal('delete'), userId: uid }),
  z.object({ action: z.literal('setPassword'), userId: uid, password: z.string().min(8).max(200) }),
]);

// POST /api/admin/users → thao tác quản trị user (superadmin). updateUser đã có bảo vệ chủ sở hữu.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  const d = parsed.data;

  // Không tự khóa/xóa chính mình (tránh tự khóa cửa).
  if ((d.action === 'suspend' || d.action === 'delete') && d.userId === chk.userId) {
    return NextResponse.json(
      { error: 'Không thể tự khóa/xóa chính tài khoản của bạn.', code: 'errSelfLock' },
      { status: 400 },
    );
  }

  try {
    if (d.action === 'suspend') await updateUser(d.userId, { active: false });
    else if (d.action === 'activate') await updateUser(d.userId, { active: true });
    else if (d.action === 'delete') await deleteUser(d.userId);
    else if (d.action === 'setPassword') await setPassword(d.userId, d.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lỗi thao tác' },
      { status: 400 },
    );
  }
}
