import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, locales, type Locale } from './config';

// Nạp message theo locale; fallback về English cho key còn thiếu để UI không vỡ.
// Chỉ cần duy trì đầy đủ vi.json + en.json; các ngôn ngữ khác bổ sung dần.
export default getRequestConfig(async (params) => {
  // Hỗ trợ cả API cũ (locale) lẫn mới (requestLocale) của next-intl v3.
  const p = params as {
    locale?: string;
    requestLocale?: Promise<string | undefined>;
  };
  const requested = p.requestLocale ? await p.requestLocale : p.locale;

  const active: Locale = (locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : defaultLocale;

  const base = (await import('../messages/en.json')).default as AbstractIntlMessages;
  let messages = base;

  if (active !== 'en') {
    try {
      const localeMessages = (await import(`../messages/${active}.json`))
        .default as AbstractIntlMessages;
      messages = { ...base, ...localeMessages };
    } catch {
      // chưa có file cho locale này → dùng English
    }
  }

  return { locale: active, messages };
});
