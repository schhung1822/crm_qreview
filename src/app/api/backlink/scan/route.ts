import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { listConnections } from '@/lib/store/connections';
import { getScan, setScan, STALE_SCAN_MS } from '@/lib/store/backlink';
import { runBacklinkScan } from '@/lib/backlink/scan';
import type { BacklinkScan } from '@/lib/backlink/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  locale: z.string().optional(),
});

// POST /api/backlink/scan → bắt đầu quét backlink chéo site (chạy nền). GET → poll tiến độ + kết quả.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (g.bizId && !(await bizHasFeature(g.bizId, 'backlinks'))) {
    return NextResponse.json({ error: 'Biz của bạn không có quyền dùng chức năng Backlink.' }, { status: 403 });
  }
  // Quét gọi AI đọc nhiều bài → chặn tần suất.
  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  const opts = parsed.success ? parsed.data : {};

  const connections = await listConnections();
  if (connections.length < 2) {
    return NextResponse.json(
      { error: 'Cần ít nhất 2 kết nối CMS để đi backlink chéo site.' },
      { status: 400 },
    );
  }

  // Chặn chạy chồng: nếu đang có lượt quét 'running' chưa cũ → báo bận (tránh 2 scan cùng lúc).
  const cur = await getScan();
  if (cur && cur.status === 'running' && Date.now() - Date.parse(cur.updatedAt) < STALE_SCAN_MS) {
    return NextResponse.json(
      { error: 'Đang có một lượt quét chạy. Vui lòng chờ hoàn tất.', scanId: cur.id },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const scan: BacklinkScan = {
    id: 'blscan_' + randomBytes(6).toString('hex'),
    status: 'running',
    phase: 'fetching',
    sitesTotal: connections.length,
    sitesDone: 0,
    postsFound: 0,
    nodes: [],
    edges: [],
    suggestions: [],
    aiError: null,
    createdAt: now,
    updatedAt: now,
  };
  await setScan(scan);

  // Fire-and-forget TRONG ngữ cảnh biz (server standalone giữ tiến trình sống → task nền chạy tiếp).
  const ctx = { userId: g.user.id, bizId: g.bizId };
  void runWithBiz(ctx, () => runBacklinkScan(scan.id, connections, opts)).catch(() => {});

  return NextResponse.json({ scanId: scan.id, status: 'running' });
}

export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const scan = await getScan();
  // Đánh dấu bản quét treo (tiến trình chết) để UI cho quét lại.
  const stale =
    !!scan && scan.status === 'running' && Date.now() - Date.parse(scan.updatedAt) > STALE_SCAN_MS;
  return NextResponse.json({ scan, stale });
}
