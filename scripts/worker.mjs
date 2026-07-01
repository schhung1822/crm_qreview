// Worker LỊCH ĐĂNG — định kỳ gọi /api/jobs/run để chạy các job đăng đến hạn (lịch đăng
// & retry). Chạy như tiến trình nền lâu dài (self-host): `npm run worker`.
// Trên serverless (Vercel) thì KHÔNG cần worker này — dùng Vercel Cron gọi
// POST /api/jobs/run kèm header x-cron-secret: $CRON_SECRET.
const BASE = process.env.APP_URL || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET || '';
const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 60_000);

if (!SECRET) {
  console.error('[worker] Thiếu CRON_SECRET trong env — không thể gọi /api/jobs/run an toàn.');
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/jobs/run`, {
      method: 'POST',
      headers: { 'x-cron-secret': SECRET },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.ran) {
        console.log(
          `[worker] ${new Date().toISOString()} ran=${data.ran} done=${data.done} failed=${data.failed}`,
        );
      }
    } else {
      console.error(`[worker] /api/jobs/run lỗi HTTP ${res.status}: ${data.error || ''}`);
    }
  } catch (e) {
    console.error('[worker] không gọi được app:', e instanceof Error ? e.message : e);
  }
}

console.log(`[worker] lịch đăng — gọi ${BASE}/api/jobs/run mỗi ${INTERVAL}ms`);
tick();
setInterval(tick, INTERVAL);
