import { NextResponse } from 'next/server';
import { readAnnouncementsPublic } from '@/lib/store/announcements';

export const dynamic = 'force-dynamic';

// GET công khai → thanh thông báo chạy ở header (mọi user đăng nhập đều đọc). Chỉ mục đang bật.
export async function GET() {
  return NextResponse.json(await readAnnouncementsPublic());
}
