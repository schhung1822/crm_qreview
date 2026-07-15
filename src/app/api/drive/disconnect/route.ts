import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { disconnectDrive } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/drive/disconnect → gỡ kết nối Google Drive (xóa refresh token đã lưu).
export async function POST() {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;
  await disconnectDrive();
  return NextResponse.json({ ok: true });
}
