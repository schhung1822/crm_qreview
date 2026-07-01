import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { userCount } from '@/lib/auth/users';

export const dynamic = 'force-dynamic';

// GET /api/auth/me → user hiện tại + cần setup lần đầu hay không.
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user, needsSetup: (await userCount()) === 0 });
}
