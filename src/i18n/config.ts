// Cấu hình ngôn ngữ - nguồn chân lý cho i18n UI.
// 10 ngôn ngữ: Việt (mặc định), Anh, Trung, Nhật, Hàn, Pháp, Đức, Indonesia, Ấn Độ, Thái.

export const locales = [
  'vi',
  'en',
  'zh',
  'ja',
  'ko',
  'fr',
  'de',
  'id',
  'hi',
  'th',
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'vi';

export const localeNames: Record<Locale, { native: string; flag: string }> = {
  vi: { native: 'Tiếng Việt', flag: '🇻🇳' },
  en: { native: 'English', flag: '🇬🇧' },
  zh: { native: '中文', flag: '🇨🇳' },
  ja: { native: '日本語', flag: '🇯🇵' },
  ko: { native: '한국어', flag: '🇰🇷' },
  fr: { native: 'Français', flag: '🇫🇷' },
  de: { native: 'Deutsch', flag: '🇩🇪' },
  id: { native: 'Indonesia', flag: '🇮🇩' },
  hi: { native: 'हिन्दी', flag: '🇮🇳' },
  th: { native: 'ไทย', flag: '🇹🇭' },
};

// Ngôn ngữ RTL (chưa có trong danh sách, để sẵn khi mở rộng: ar, he).
export const rtlLocales: string[] = ['ar', 'he', 'fa', 'ur'];

export function isRtl(locale: string): boolean {
  return rtlLocales.includes(locale);
}
