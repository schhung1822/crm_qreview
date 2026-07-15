// Chốt chặn SUPERADMIN cho mọi route /api/admin/*. Chỉ chủ nền tảng (SUPERADMIN_EMAILS) đi qua.
import { NextResponse } from 'next/server';
import { guard } from '../auth/current';
import { isSuperadminUser } from '../auth/superadmin';

export async function requireSuper(): Promise<{ userId: string } | { error: NextResponse }> {
  const g = await guard();
  if ('response' in g) return { error: g.response };
  if (!(await isSuperadminUser(g.user.id))) {
    return { error: NextResponse.json({ error: 'Không đủ quyền.' }, { status: 403 }) };
  }
  return { userId: g.user.id };
}
