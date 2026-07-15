import { NextResponse } from 'next/server';
import { readNewsPublic } from '@/lib/store/news-feed';

export const dynamic = 'force-dynamic';

// GET công khai → bảng tin cột phải (mọi user đăng nhập đều đọc). Chỉ tin đang bật.
export async function GET() {
  return NextResponse.json(await readNewsPublic());
}
