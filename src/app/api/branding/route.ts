import { NextResponse } from 'next/server';
import { getBrandingSafe } from '@/lib/store/branding';

// Thương hiệu công khai (KHÔNG chứa bí mật) → trang đăng nhập/onboarding (chưa đăng nhập) đọc được
// để hiện logo/nguồn theo cấu hình. Cache ngắn ở CDN/trình duyệt cho nhẹ.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getBrandingSafe('api/branding'), {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
