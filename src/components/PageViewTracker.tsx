'use client';

// Gửi PAGE_VIEW mỗi lần đổi route (client) tới /api/track qua sendBeacon (không chặn điều hướng).
// Cũng export track() để ghi sự kiện tùy chỉnh từ nút bấm nếu cần.
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

function readUtm(): Record<string, string> | undefined {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
      const v = q.get('utm_' + k);
      if (v) utm[k] = v.slice(0, 200);
    }
    return Object.keys(utm).length ? utm : undefined;
  } catch {
    return undefined;
  }
}

function send(body: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([json], { type: 'application/json' }));
    } else {
      void fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: true,
      });
    }
  } catch {
    /* theo dõi là phụ - lỗi thì bỏ qua */
  }
}

// Ghi 1 sự kiện tùy chỉnh từ client (vd click nút quan trọng).
export function track(eventName: string, props?: Record<string, unknown>): void {
  send({ type: 'event', eventName, ...props });
}

export function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string>('');
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    send({
      type: 'page_view',
      path: pathname,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      utm: readUtm(),
    });
  }, [pathname]);
  return null;
}
