import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { defaultLocale, locales } from './i18n/config';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

export default function middleware(req: NextRequest) {
  // Trang chủ marketing "/" là trang CÔNG KHAI (SEO), KHÔNG ép locale-prefix và KHÔNG qua next-intl
  // redirect → để src/app/page.tsx phục vụ. Mọi route app khác vẫn qua next-intl như cũ.
  if (req.nextUrl.pathname === '/') return NextResponse.next();
  return intlMiddleware(req);
}

export const config = {
  // Bỏ qua API, file tĩnh, _next và các trang KHÔNG gắn locale: /login, /onboarding, /generated,
  // /share (trang chia sẻ báo cáo công khai, ngoài [locale]). Thiếu /share sẽ khiến next-intl
  // redirect /share/<token> → /vi/share/<token> → vào [locale] và bị chặn login/404.
  matcher: ['/((?!api|_next|_vercel|login|onboarding|generated|share|.*\\..*).*)'],
};
