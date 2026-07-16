'use client';

// Pixel theo dõi TOÀN HỆ THỐNG (Meta Pixel + TikTok Pixel). Render ở root layout → áp cho MỌI trang
// (trang chủ, app, /share...). ID cấu hình ở Quản trị → Thông tin hệ thống. Rỗng = không chèn.
// Bắn lại PageView khi điều hướng SPA (App Router không reload trang).
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// Phòng thủ: chỉ giữ ký tự chữ+số (dù API đã validate) → an toàn tuyệt đối khi nhúng inline script.
function clean(id?: string): string {
  return (id || '').replace(/[^A-Za-z0-9]/g, '');
}

export function TrackingPixels({ fb, tiktok }: { fb?: string; tiktok?: string }) {
  const fbId = clean(fb);
  const ttId = clean(tiktok);
  const pathname = usePathname();
  const first = useRef(true);

  // Đổi route trong SPA → bắn lại PageView (lần đầu đã bắn trong snippet init nên bỏ qua).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const w = window as unknown as {
      fbq?: (...a: unknown[]) => void;
      ttq?: { page?: () => void };
    };
    if (fbId && typeof w.fbq === 'function') w.fbq('track', 'PageView');
    if (ttId && w.ttq?.page) w.ttq.page();
  }, [pathname, fbId, ttId]);

  if (!fbId && !ttId) return null;

  return (
    <>
      {fbId ? (
        <>
          <Script
            id="meta-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbId}');fbq('track','PageView');`,
            }}
          />
          {/* Fallback không-JS: ảnh 1x1. */}
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              alt=""
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${fbId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}

      {ttId ? (
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{},n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;var i=d.getElementsByTagName("script")[0];i.parentNode.insertBefore(n,i)};ttq.load('${ttId}');ttq.page()}(window,document,'ttq');`,
          }}
        />
      ) : null}
    </>
  );
}
