import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { listUsers } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await guard();
  if ('response' in auth) return auth.response;
  const members = (await listUsers())
    .filter((user) => user.active)
    .map((user) => ({ id: user.id, name: user.name }));
  return NextResponse.json({ members, self: auth.user.id });
}
