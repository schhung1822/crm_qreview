import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { defaultLocale, locales } from './i18n/config';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'never',
});

// Các trang đứng ngoài cây [locale] và không yêu cầu phiên đăng nhập. Giữ danh sách chính xác để
// không vô tình mở công khai một nhánh route mới chỉ vì trùng tiền tố.
const PUBLIC_STANDALONE_PATHS = new Set(['/', '/term', '/privacy']);

// Bot đọc thẻ OG của mạng xã hội / trình nhắn tin. Các bot này KHÔNG chạy JS và dễ bỏ cuộc với trang
// SPA nặng → phục vụ chúng trang OG tối giản riêng (/api/og/share/<token>).
const OG_BOT_RE =
  /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|Slackbot|LinkedInBot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|Google-InspectionTool|SkypeUriPreview|vkShare|Embedly|Iframely|Zalo|zalo/i;

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Link rút gọn dạng blog: /bao-cao-... (báo cáo) hoặc /kich-ban-... (phân tích kịch bản)
  // → route xử lý (bot đọc OG, người thật redirect).
  if (/^\/(bao-cao|kich-ban)-[a-z0-9-]+$/.test(pathname)) {
    return NextResponse.rewrite(new URL(`/api/link${pathname}`, req.url));
  }

  // Trang chia sẻ công khai: nếu là BOT MXH → rewrite sang trang OG tối giản (chắc chắn đọc được thẻ).
  // Người dùng thật → phục vụ trang /share đầy đủ, KHÔNG qua next-intl (tránh redirect locale).
  // /share/video/<token> = phân tích kịch bản; /share/<token> = báo cáo social.
  if (pathname.startsWith('/share/')) {
    const ua = req.headers.get('user-agent') || '';
    if (OG_BOT_RE.test(ua)) {
      const parts = pathname.split('/'); // ['', 'share', 'video'|token, token?]
      if (parts[2] === 'video') {
        return NextResponse.rewrite(new URL(`/api/og/video/${parts[3] || ''}`, req.url));
      }
      return NextResponse.rewrite(new URL(`/api/og/share/${parts[2] || ''}`, req.url));
    }
    return NextResponse.next();
  }

  // Trang công khai không ép locale-prefix và không qua next-intl; nếu không middleware sẽ rewrite
  // sang cây [locale], nơi layout yêu cầu đăng nhập. Chuẩn hóa dấu "/" cuối để /term/ cũng an toàn.
  const standalonePath = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_STANDALONE_PATHS.has(standalonePath)) return NextResponse.next();
  return intlMiddleware(req);
}

export const config = {
  // Bỏ qua API, file tĩnh, _next và các trang KHÔNG gắn locale: /login, /onboarding, /generated,
  // /share. RIÊNG /share/:path* được thêm vào để middleware chạy được (bắt bot MXH ở trên); người
  // dùng thật vẫn được next() trả trang đầy đủ.
  matcher: [
    '/((?!api|_next|_vercel|login|onboarding|generated|share|.*\\..*).*)',
    '/share/:path*',
  ],
};
