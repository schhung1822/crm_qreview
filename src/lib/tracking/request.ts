// Trích NGỮ CẢNH theo dõi từ 1 Request (IP, UA, path, cookie định danh). Không đụng DB.
import { clientIp } from '../security/rate-limit';

// Cookie định danh phục vụ analytics (KHÁC cookie phiên đăng nhập sg_session):
export const TRACK_ANON_COOKIE = 'sg_aid'; // định danh ẩn danh, sống lâu (1 năm)
export const TRACK_SESSION_COOKIE = 'sg_tsid'; // phiên analytics, trượt ~30 phút
export const BIZ_COOKIE_NAME = 'sg_biz';
export const TRACK_SESSION_TTL_MS = 30 * 60 * 1000;

export interface TrackingContext {
  ip?: string;
  userAgent?: string;
  path?: string;
  referrer?: string;
  sessionId?: string;
  anonymousId?: string;
  bizId?: string;
}

function parseCookies(header: string | null): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (!k) continue;
    jar[k] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return jar;
}

export function trackingContext(req: Request): TrackingContext {
  const h = req.headers;
  const jar = parseCookies(h.get('cookie'));
  let path: string | undefined;
  try {
    path = new URL(req.url).pathname;
  } catch {
    path = undefined;
  }
  return {
    ip: clientIp(req),
    userAgent: h.get('user-agent') ?? undefined,
    path,
    referrer: h.get('referer') ?? undefined,
    sessionId: jar[TRACK_SESSION_COOKIE] || undefined,
    anonymousId: jar[TRACK_ANON_COOKIE] || undefined,
    bizId: jar[BIZ_COOKIE_NAME] || undefined,
  };
}

// Gói ngữ cảnh phẳng để truyền thẳng vào recordUserEvent từ 1 route (kèm userId/bizId đã biết).
export function eventContext(
  req: Request,
  ids?: { userId?: string; bizId?: string },
): {
  userId?: string;
  bizId?: string;
  sessionId?: string;
  anonymousId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
} {
  const c = trackingContext(req);
  return {
    userId: ids?.userId,
    bizId: ids?.bizId || c.bizId,
    sessionId: c.sessionId,
    anonymousId: c.anonymousId,
    ip: c.ip,
    userAgent: c.userAgent,
    path: c.path,
  };
}

// Nhận diện thô loại thiết bị / trình duyệt / hệ điều hành từ User-Agent (đủ cho thống kê).
export function parseUserAgent(ua?: string): { deviceType?: string; browser?: string; os?: string } {
  if (!ua) return {};
  const s = ua.toLowerCase();
  const deviceType = /ipad|tablet/.test(s)
    ? 'tablet'
    : /mobi|iphone|android.*mobile/.test(s)
      ? 'mobile'
      : 'desktop';
  const browser = /edg\//.test(s)
    ? 'Edge'
    : /opr\/|opera/.test(s)
      ? 'Opera'
      : /chrome|crios/.test(s)
        ? 'Chrome'
        : /firefox|fxios/.test(s)
          ? 'Firefox'
          : /safari/.test(s)
            ? 'Safari'
            : undefined;
  const os = /windows/.test(s)
    ? 'Windows'
    : /iphone|ipad|ios/.test(s)
      ? 'iOS'
      : /mac os/.test(s)
        ? 'macOS'
        : /android/.test(s)
          ? 'Android'
          : /linux/.test(s)
            ? 'Linux'
            : undefined;
  return { deviceType, browser, os };
}
