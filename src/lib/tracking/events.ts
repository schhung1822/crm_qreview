// Ghi DỮ LIỆU HÀNH VI người dùng vào DB (UserEvent + UserSessionActivity + rollup DailyUsageMetric).
// NGUYÊN TẮC: fire-and-forget, KHÔNG BAO GIỜ ném lỗi ra luồng chính (chỉ log). Chỉ chạy khi
// STORAGE_DRIVER=prisma (các bảng nằm trong DB). Server-only.
import { createHash, randomBytes } from 'node:crypto';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';

const isDb = () => storageDriver() === 'prisma';

// Chuyển IP (chuỗi) → 16 byte varbinary. Lỗi/không nhận dạng → null (không chặn ghi sự kiện).
export function ipToBytes(ip?: string | null): Buffer | null {
  if (!ip) return null;
  const s = ip.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const parts = s.split('.').map(Number);
    if (parts.some((p) => p > 255)) return null;
    return Buffer.from(parts);
  }
  if (s.includes(':')) {
    try {
      const hasZip = s.includes('::');
      const [head, tail = ''] = s.split('::');
      const h = head ? head.split(':').filter(Boolean) : [];
      const t = tail ? tail.split(':').filter(Boolean) : [];
      const groups = hasZip
        ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
        : s.split(':');
      if (groups.length !== 8) return null;
      const buf = Buffer.alloc(16);
      groups.forEach((g, i) => {
        const v = parseInt(g || '0', 16);
        if (Number.isNaN(v) || v > 0xffff) throw new Error('bad group');
        buf.writeUInt16BE(v, i * 2);
      });
      return buf;
    } catch {
      return null;
    }
  }
  return null;
}

export type EventType = 'interaction' | 'pageview' | 'action' | 'conversion' | 'system';

export interface UserEventInput {
  eventName: string; // vd 'website_check', 'article_publish', 'page_view'
  eventType?: EventType;
  area?: string; // nhóm tính năng: 'audit' | 'landing_audit' | 'billing' | 'auth' | 'editor'...
  path?: string;
  routeName?: string;
  entityType?: string; // 'article' | 'connection' | 'order'...
  entityId?: string;
  source?: string;
  value?: number;
  currency?: string;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  metadata?: Record<string, unknown>;
  // ngữ cảnh
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  bizId?: string;
  ip?: string;
  userAgent?: string;
}

// FK khóa ngoại (userId→User, bizId→Biz): id lạ (cookie cũ, user/biz đã xóa) → P2003. Thử lại 1 lần
// với ref null để KHÔNG mất sự kiện.
function isFkError(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2003';
}

// Ghi 1 sự kiện hành vi (kèm rollup ngày). KHÔNG await ở nơi gọi.
export function recordUserEvent(input: UserEventInput): void {
  if (!isDb() || !input.eventName) return;
  void (async () => {
    const data = {
      id: 'evt_' + randomBytes(12).toString('hex'),
      userId: input.userId ?? null,
      anonymousId: input.anonymousId ?? null,
      sessionId: input.sessionId ?? null,
      bizId: input.bizId ?? null,
      eventName: input.eventName.slice(0, 128),
      eventType: input.eventType ?? 'interaction',
      area: input.area ?? null,
      path: input.path?.slice(0, 512) ?? null,
      routeName: input.routeName ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      source: input.source ?? null,
      value: input.value ?? null,
      currency: input.currency ?? null,
      durationMs: input.durationMs ?? null,
      success: input.success ?? null,
      errorCode: input.errorCode ?? null,
      metadata: (input.metadata as object) ?? undefined,
      ip: ipToBytes(input.ip),
      userAgent: input.userAgent ?? null,
    };
    try {
      await prisma.userEvent.create({ data });
      await rollupDaily(input);
    } catch (e) {
      if (isFkError(e)) {
        try {
          await prisma.userEvent.create({ data: { ...data, userId: null, bizId: null } });
          await rollupDaily(input);
          return;
        } catch {
          /* bỏ qua */
        }
      }
      console.warn('[tracking] recordUserEvent failed:', (e as Error).message);
    }
  })();
}

// Cộng dồn bảng tổng hợp NGÀY (best-effort, raw SQL ON DUPLICATE KEY → atomic, không cần model mới).
async function rollupDaily(input: UserEventInput): Promise<void> {
  try {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const area = (input.area ?? '').slice(0, 96);
    const eventName = input.eventName.slice(0, 128);
    const path = input.path?.slice(0, 512) ?? null;
    const bizId = (input.bizId ?? '').slice(0, 64);
    const userId = (input.userId ?? '').slice(0, 64);
    const pathHash = createHash('md5').update(path ?? '').digest();
    const dur = Math.max(0, Math.round(input.durationMs ?? 0));
    await prisma.$executeRaw`
      INSERT INTO DailyUsageMetric
        (date, bizId, userId, area, eventName, pathHash, path, count, uniqueUsers, uniqueSessions, totalDurationMs, updatedAt)
      VALUES (${day}, ${bizId}, ${userId}, ${area}, ${eventName}, ${pathHash}, ${path}, 1, 0, 0, ${dur}, NOW(3))
      ON DUPLICATE KEY UPDATE count = count + 1, totalDurationMs = totalDurationMs + ${dur}, updatedAt = NOW(3)`;
  } catch (e) {
    console.warn('[tracking] rollupDaily failed:', (e as Error).message);
  }
}

export interface SessionTouchInput {
  sessionId: string;
  userId?: string;
  anonymousId?: string;
  bizId?: string;
  path?: string;
  referrer?: string;
  utm?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  incPageViews?: number;
  incEvents?: number;
  attribution?: {
    fbp?: string;
    fbc?: string;
    ttclid?: string;
    ttp?: string;
    gclid?: string;
    gaClientId?: string;
  };
  device?: { deviceType?: string; browser?: string; os?: string };
}

// Cập nhật phiên hoạt động (gộp theo sessionId): tạo mới hoặc chạm lastSeenAt + tăng đếm.
export function touchSession(input: SessionTouchInput): void {
  if (!isDb() || !input.sessionId) return;
  void (async () => {
    const now = new Date();
    const a = input.attribution ?? {};
    const d = input.device ?? {};
    const run = (userId: string | null, bizId: string | null) =>
      prisma.userSessionActivity.upsert({
        where: { sessionId: input.sessionId },
        create: {
          id: 'ses_' + randomBytes(12).toString('hex'),
          sessionId: input.sessionId,
          userId,
          anonymousId: input.anonymousId ?? null,
          bizId,
          startedAt: now,
          lastSeenAt: now,
          entryPath: input.path ?? null,
          landingPage: input.path ?? null,
          referrer: input.referrer ?? null,
          utm: (input.utm as object) ?? undefined,
          fbp: a.fbp ?? null,
          fbc: a.fbc ?? null,
          ttclid: a.ttclid ?? null,
          ttp: a.ttp ?? null,
          gclid: a.gclid ?? null,
          gaClientId: a.gaClientId ?? null,
          ip: ipToBytes(input.ip),
          userAgent: input.userAgent ?? null,
          deviceType: d.deviceType ?? null,
          browser: d.browser ?? null,
          os: d.os ?? null,
          pageViews: input.incPageViews ?? 0,
          events: input.incEvents ?? 0,
        },
        update: {
          lastSeenAt: now,
          ...(userId ? { userId } : {}),
          ...(bizId ? { bizId } : {}),
          ...(input.incPageViews ? { pageViews: { increment: input.incPageViews } } : {}),
          ...(input.incEvents ? { events: { increment: input.incEvents } } : {}),
        },
      });
    try {
      await run(input.userId ?? null, input.bizId ?? null);
    } catch (e) {
      if (isFkError(e)) {
        try {
          await run(null, null);
          return;
        } catch {
          /* bỏ qua */
        }
      }
      console.warn('[tracking] touchSession failed:', (e as Error).message);
    }
  })();
}
