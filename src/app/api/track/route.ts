import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/current';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { recordUserEvent, touchSession } from '@/lib/tracking/events';
import {
  TRACK_ANON_COOKIE,
  TRACK_SESSION_COOKIE,
  TRACK_SESSION_TTL_MS,
  parseUserAgent,
  trackingContext,
} from '@/lib/tracking/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Beacon THU sự kiện hành vi từ trình duyệt (page_view + sự kiện tùy chỉnh). Ẩn danh cũng ghi được
// (trang công khai); tự cấp cookie định danh sg_aid (1 năm) + phiên analytics sg_tsid (trượt 30').
const Schema = z.object({
  type: z.enum(['page_view', 'event']).default('event'),
  eventName: z.string().min(1).max(128).optional(),
  area: z.string().max(96).optional(),
  path: z.string().max(512).optional(),
  routeName: z.string().max(191).optional(),
  entityType: z.string().max(191).optional(),
  entityId: z.string().max(191).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  value: z.number().optional(),
  currency: z.string().max(16).optional(),
  referrer: z.string().max(1024).optional(),
  utm: z.record(z.string().max(200)).optional(),
  attribution: z
    .object({
      fbp: z.string().max(255).optional(),
      fbc: z.string().max(255).optional(),
      ttclid: z.string().max(255).optional(),
      ttp: z.string().max(255).optional(),
      gclid: z.string().max(255).optional(),
      gaClientId: z.string().max(255).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // navigator.sendBeacon/fetch same-origin không luôn gửi Origin
  try {
    const host = req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });

  const rl = rateLimit(`track:${clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return new NextResponse(null, { status: 429 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const b = parsed.data;

  const ctx = trackingContext(req);
  const user = await getCurrentUser().catch(() => null);

  // Cấp định danh nếu thiếu (đặt lại cookie ở response).
  const anonymousId = ctx.anonymousId || randomUUID();
  const sessionId = ctx.sessionId || randomUUID();

  const isPageView = b.type === 'page_view';
  const device = parseUserAgent(ctx.userAgent);

  touchSession({
    sessionId,
    userId: user?.id,
    anonymousId,
    path: b.path ?? ctx.path,
    referrer: b.referrer ?? ctx.referrer,
    utm: b.utm,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    incPageViews: isPageView ? 1 : 0,
    incEvents: isPageView ? 0 : 1,
    attribution: b.attribution,
    device,
  });

  recordUserEvent({
    eventName: isPageView ? 'page_view' : (b.eventName ?? 'event'),
    eventType: isPageView ? 'pageview' : 'interaction',
    area: b.area,
    path: b.path ?? ctx.path,
    routeName: b.routeName,
    entityType: b.entityType,
    entityId: b.entityId,
    durationMs: b.durationMs,
    value: b.value,
    currency: b.currency,
    metadata: b.metadata,
    userId: user?.id,
    anonymousId,
    sessionId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const res = new NextResponse(null, { status: 204 });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(TRACK_ANON_COOKIE, anonymousId, {
    httpOnly: false, // để pixel/attribution client đọc được nếu cần
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  res.cookies.set(TRACK_SESSION_COOKIE, sessionId, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(TRACK_SESSION_TTL_MS / 1000),
  });
  return res;
}
