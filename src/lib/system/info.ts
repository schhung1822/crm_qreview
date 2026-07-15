// Thông tin máy chủ đang chạy hệ thống (cho tab "Thông tin hệ thống" - Quản trị nền tảng).
// Server-only: dùng os/fs. KHÔNG import vào component client (fetch qua /api/admin/system).
import { statfs } from 'node:fs/promises';
import os from 'node:os';

export interface SystemInfo {
  config: {
    platform: string;
    osType: string;
    osRelease: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    nodeEnv: string;
    systemUptimeSec: number;
    appUptimeSec: number;
  };
  cpu: { model: string; cores: number; speedMhz: number; usagePct: number | null };
  ram: { total: number; free: number; used: number; usedPct: number; processRss: number };
  disk: { path: string; total: number; free: number; used: number; usedPct: number } | null;
}

// Tổng thời gian & thời gian rảnh cộng dồn của mọi nhân (dùng để tính % CPU giữa 2 lần lấy mẫu).
function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}

// % CPU đang dùng: lấy 2 mẫu cách nhau ~150ms rồi so sánh phần "không rảnh".
async function cpuUsagePct(ms = 150): Promise<number | null> {
  try {
    const a = cpuTimes();
    await new Promise((r) => setTimeout(r, ms));
    const b = cpuTimes();
    const idle = b.idle - a.idle;
    const total = b.total - a.total;
    if (total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
  } catch {
    return null;
  }
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  let disk: SystemInfo['disk'] = null;
  try {
    const s = await statfs(process.cwd());
    const dTotal = s.blocks * s.bsize;
    const dFree = s.bfree * s.bsize;
    const dUsed = dTotal - dFree;
    disk = {
      path: process.cwd(),
      total: dTotal,
      free: dFree,
      used: dUsed,
      usedPct: dTotal ? Math.round((dUsed / dTotal) * 100) : 0,
    };
  } catch {
    disk = null; // vài nền tảng không hỗ trợ statfs → ẩn phần ổ đĩa
  }

  return {
    config: {
      platform: os.platform(),
      osType: os.type(),
      osRelease: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV ?? 'production',
      systemUptimeSec: Math.round(os.uptime()),
      appUptimeSec: Math.round(process.uptime()),
    },
    cpu: {
      model: (cpus[0]?.model ?? 'unknown').trim(),
      cores: cpus.length,
      speedMhz: cpus[0]?.speed ?? 0,
      usagePct: await cpuUsagePct(),
    },
    ram: {
      total,
      free,
      used,
      usedPct: total ? Math.round((used / total) * 100) : 0,
      processRss: process.memoryUsage().rss,
    },
    disk,
  };
}

// Đo tốc độ MẠNG của máy chủ: tải thử một tệp từ endpoint speed test của Cloudflare rồi tính Mbps,
// kèm độ trễ (thời gian phản hồi tệp rất nhỏ). CHẠY THEO YÊU CẦU (nút bấm) - có timeout, không ném ra.
export async function measureNetworkSpeed(): Promise<{
  downMbps: number;
  latencyMs: number;
  bytes: number;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    // Độ trễ: thời gian lấy tệp 1 byte.
    const l0 = performance.now();
    await fetch('https://speed.cloudflare.com/__down?bytes=1', { cache: 'no-store', signal: ctrl.signal });
    const latencyMs = Math.round(performance.now() - l0);

    // Thông lượng: tải ~10MB, đo thời gian.
    const wanted = 10_000_000;
    const t0 = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${wanted}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const buf = await res.arrayBuffer();
    const secs = (performance.now() - t0) / 1000;
    const downMbps = secs > 0 ? (buf.byteLength * 8) / secs / 1e6 : 0;
    return {
      downMbps: Math.round(downMbps * 10) / 10,
      latencyMs,
      bytes: buf.byteLength,
    };
  } finally {
    clearTimeout(timer);
  }
}
