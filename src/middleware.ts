import createMiddleware from 'next-intl/middleware';
import { defaultLocale, locales } from './i18n/config';

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

export const config = {
  // Bỏ qua API, file tĩnh, _next, và trang /login (không gắn locale).
  matcher: ['/((?!api|_next|_vercel|login|.*\\..*).*)'],
};
