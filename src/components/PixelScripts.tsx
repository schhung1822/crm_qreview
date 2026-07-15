'use client';

// Nhúng phía trình duyệt: NHIỀU Facebook Pixel + NHIỀU TikTok Pixel + GA4 (gtag) + Google Tag
// Manager. Id lấy từ /api/tracking (công khai, không token). Sự kiện Purchase gửi qua Conversion
// API/Measurement Protocol ở server (dedup theo event_id = mã đơn) nên ở đây chỉ nạp + PageView.
import { useEffect } from 'react';

type W = Window & { fbq?: unknown; ttq?: unknown; dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };

interface Public {
  fb?: string[];
  tt?: string[];
  ga4Enabled?: boolean;
  ga4MeasurementId?: string;
  gtmEnabled?: boolean;
  gtmContainerId?: string;
}

function injectInline(code: string) {
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.text = code;
  document.head.appendChild(s);
}
function injectSrc(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

const FB_BASE = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`;

const TT_BASE = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};`;

export function PixelScripts() {
  useEffect(() => {
    let alive = true;
    fetch('/api/tracking')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Public | null) => {
        if (!alive || !d) return;
        const w = window as W;

        // Facebook: nạp base 1 lần, init NHIỀU pixel, rồi PageView (bắn cho mọi pixel đã init).
        const fb = (d.fb ?? []).filter(Boolean);
        if (fb.length) {
          const inits = fb.map((id) => `fbq('init', ${JSON.stringify(id)});`).join('\n');
          if (!w.fbq) injectInline(`${FB_BASE}\n${inits}\nfbq('track', 'PageView');`);
          else injectInline(`${inits}\nfbq('track', 'PageView');`);
        }

        // TikTok: nạp base 1 lần rồi load từng pixel.
        const tt = (d.tt ?? []).filter(Boolean);
        if (tt.length) {
          const loads = tt.map((c) => `ttq.load(${JSON.stringify(c)});`).join('\n');
          if (!w.ttq) injectInline(`${TT_BASE}\n${loads}\nttq.page();\n}(window,document,'ttq');`);
          else injectInline(`${loads}\nttq.page();`);
        }

        // GA4 (gtag.js).
        if (d.ga4Enabled && d.ga4MeasurementId && !w.gtag) {
          const gid = d.ga4MeasurementId;
          injectSrc(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gid)}`);
          injectInline(
            `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js', new Date());gtag('config', ${JSON.stringify(gid)});`,
          );
        }

        // Google Tag Manager.
        if (d.gtmEnabled && d.gtmContainerId) {
          const gtm = d.gtmContainerId;
          injectInline(
            `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtm)});`,
          );
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return null;
}
