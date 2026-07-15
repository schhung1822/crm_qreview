import { NextResponse } from 'next/server';
import { getTrackingPublic } from '@/lib/store/tracking-config';

export const dynamic = 'force-dynamic';

// GET công khai → id pixel + bật/tắt cho trình duyệt nhúng Facebook/TikTok Pixel. KHÔNG có token.
export async function GET() {
  return NextResponse.json(await getTrackingPublic());
}
