import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { userCount } from '@/lib/auth/users';
import { getSelfRegistrationEnabled } from '@/lib/store/platform-settings';

export const dynamic = 'force-dynamic';

// GET /api/auth/me → user hiện tại + cần setup lần đầu hay không + tự đăng ký có đang bật không
// (trang đăng nhập dùng cờ này để ẩn/hiện nút tạo tài khoản).
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    needsSetup: (await userCount()) === 0,
    selfRegistrationEnabled: await getSelfRegistrationEnabled(),
  });
}
