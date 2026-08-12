// Cấu hình ngôn ngữ - nguồn chân lý cho i18n UI.
// 10 ngôn ngữ: Việt (mặc định), Anh, Trung, Nhật, Hàn, Pháp, Đức, Indonesia, Ấn Độ, Thái.

export const locales = ['vi'] as const;

export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const defaultLocale: Locale = 'vi';

export const localeNames: Record<Locale, { native: string; flag: string }> = {
  vi: { native: 'Tiếng Việt', flag: '🇻🇳' },
};

// Ngôn ngữ RTL (chưa có trong danh sách, để sẵn khi mở rộng: ar, he).
export const rtlLocales: string[] = ['ar', 'he', 'fa', 'ur'];

export function isRtl(locale: string): boolean {
  return rtlLocales.includes(locale);
}
