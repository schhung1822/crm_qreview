import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { userCount } from '@/lib/auth/users';
import { getSelfRegistrationEnabled } from '@/lib/store/platform-settings';

export const dynamic = 'force-dynamic';

async function settle<T>(label: string, task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (error) {
    console.error(`[api/auth/me] failed to load ${label}`, error);
    return fallback;
  }
}

// Public bootstrap for login/onboarding. It must not take the whole login page
// down if one optional storage read fails on serverless runtime.
export async function GET() {
  const [user, count, selfRegistrationEnabled] = await Promise.all([
    settle('current user', getCurrentUser(), null),
    settle('user count', userCount(), 1),
    settle('self registration setting', getSelfRegistrationEnabled(), true),
  ]);

  return NextResponse.json({
    user,
    needsSetup: count === 0,
    selfRegistrationEnabled,
  });
}
