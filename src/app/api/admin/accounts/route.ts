import { NextResponse } from 'next/server';
import { requireSuper } from '@/lib/admin/guard';
import { listUsers } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  const check = await requireSuper();
  if ('error' in check) return check.error;
  const accounts = (await listUsers()).map(({ id, email, name, role, active, createdAt }) => ({
    id,
    email,
    name,
    role,
    active,
    createdAt,
  }));
  return NextResponse.json({ accounts });
}
