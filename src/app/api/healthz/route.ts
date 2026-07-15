import { NextResponse } from 'next/server';

// GET /api/healthz — health check HẠ TẦNG cho load balancer / Docker HEALTHCHECK / uptime monitor.
// KHÔNG cần auth (hạ tầng phải gọi được), KHÔNG lộ thông tin nhạy cảm.
// (Khác /api/health — endpoint đó cần đăng nhập và trả trạng thái tích hợp AI/CMS.)
// - Luôn kiểm "liveness" (tiến trình còn sống).
// - Ở STORAGE_DRIVER=prisma: kiểm thêm "readiness" của DB (SELECT 1). DB hỏng → 503 để LB rút
//   instance khỏi vòng phục vụ thay vì gửi request vào chỗ chết.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_TIMEOUT_MS = 3000;

async function checkDb(): Promise<boolean> {
  try {
    // Nạp động: chế độ file KHÔNG kéo @prisma/client vào bundle.
    const { prisma } = await import('@/lib/prisma');
    const ping = prisma.$queryRaw`SELECT 1`;
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), DB_TIMEOUT_MS),
    );
    await Promise.race([ping, timeout]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const driver = process.env.STORAGE_DRIVER === 'prisma' ? 'prisma' : 'file';
  const checks: Record<string, 'ok' | 'fail' | 'skipped'> = { app: 'ok' };

  if (driver === 'prisma') {
    const dbOk = await checkDb();
    checks.db = dbOk ? 'ok' : 'fail';
    if (!dbOk) {
      return NextResponse.json(
        { status: 'unhealthy', driver, checks },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } else {
    checks.db = 'skipped'; // file mode không dùng DB
  }

  return NextResponse.json(
    { status: 'ok', driver, checks },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
