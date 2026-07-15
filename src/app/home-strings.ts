// Nội dung trang chủ marketing (ngoài [locale] nên KHÔNG dùng next-intl - tự chứa 10 ngôn ngữ,
// giống trang /login). Dữ liệu ở home-strings.data.json; sửa nội dung ở đó.
import { defaultLocale, locales, type Locale } from '@/i18n/config';
import data from './home-strings.data.json';

export interface HomeItem {
  title: string;
  desc: string;
}
export interface HomeSaving {
  value: string;
  label: string;
}
export interface HomeFaq {
  q: string;
  a: string;
}
export interface HomeStrings {
  metaTitle: string;
  metaDescription: string;
  login: string;
  skipToContent: string;
  langLabel: string;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  heroNote: string;
  integrationsLabel: string;
  problemTitle: string;
  problems: HomeItem[];
  featuresTitle: string;
  featuresSubtitle: string;
  features: HomeItem[];
  audienceTitle: string;
  audience: HomeItem[];
  howTitle: string;
  steps: HomeItem[];
  savingsTitle: string;
  savingsSubtitle: string;
  savings: HomeSaving[];
  faqTitle: string;
  faqs: HomeFaq[];
  ctaTitle: string;
  ctaSubtitle: string;
  ctaButton: string;
  footerTagline: string;
  footerRights: string;
}

const HOME = data as unknown as Record<string, HomeStrings>;

// Chọn locale hợp lệ từ nhiều nguồn (query ?lang → cookie → Accept-Language), fallback mặc định.
export function pickHomeLocale(
  queryLang?: string | string[],
  cookieLang?: string,
  acceptLanguage?: string,
): Locale {
  const q = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  const accept = acceptLanguage?.split(',')[0]?.split('-')[0]?.toLowerCase();
  for (const c of [q, cookieLang, accept]) {
    if (c && (locales as readonly string[]).includes(c)) return c as Locale;
  }
  return defaultLocale;
}

export function getHomeStrings(locale: string): HomeStrings {
  return HOME[locale] ?? HOME.en ?? HOME.vi;
}
