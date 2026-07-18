import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { requestBaseUrl } from '@/lib/base-url';
import { getDriveState } from '@/lib/store/drive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/drive/status → { configured, connected, email, credSource, redirectUri }.
// redirectUri để hiển thị cho người dùng đăng ký trong Google Cloud Console.
export async function GET(req: Request) {
  const g = await guard();
  if ('response' in g) return g.response;
  const state = await getDriveState();
  // redirectUri hiển thị cho người dùng đăng ký ở Google Console → phải là domain CÔNG KHAI.
  const redirectUri = `${requestBaseUrl(req)}/api/drive/callback`;
  return NextResponse.json({ ...state, redirectUri });
}
