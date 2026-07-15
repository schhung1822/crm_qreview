// Định dạng chi phí AI: hiện tiền tệ GỐC ($) + quy đổi sang tiền tệ theo NGÔN NGỮ web.
// Tỷ giá THẬT truyền vào từ getUsdRates() (API). Nếu không có → dùng fallback tĩnh (ước lượng).
// Dùng được ở client.

interface CurrencyInfo {
  code: string; // mã ISO-4217 cho Intl
  intlLocale: string; // BCP-47 để định dạng
  fallbackRate: number; // 1 USD = ? (dùng khi chưa có tỷ giá thật)
}

const CURRENCY: Record<string, CurrencyInfo> = {
  vi: { code: 'VND', intlLocale: 'vi-VN', fallbackRate: 25400 },
  en: { code: 'USD', intlLocale: 'en-US', fallbackRate: 1 },
  zh: { code: 'CNY', intlLocale: 'zh-CN', fallbackRate: 7.2 },
  ja: { code: 'JPY', intlLocale: 'ja-JP', fallbackRate: 157 },
  ko: { code: 'KRW', intlLocale: 'ko-KR', fallbackRate: 1380 },
  fr: { code: 'EUR', intlLocale: 'fr-FR', fallbackRate: 0.92 },
  de: { code: 'EUR', intlLocale: 'de-DE', fallbackRate: 0.92 },
  id: { code: 'IDR', intlLocale: 'id-ID', fallbackRate: 16200 },
  hi: { code: 'INR', intlLocale: 'hi-IN', fallbackRate: 83.5 },
  th: { code: 'THB', intlLocale: 'th-TH', fallbackRate: 36.5 },
};

function infoFor(locale: string): CurrencyInfo {
  return CURRENCY[locale.split('-')[0]] ?? CURRENCY.en;
}

export function currencyCode(locale: string): string {
  return infoFor(locale).code;
}

// Tỷ giá 1 USD = ? đơn vị tiền tệ của locale. Ưu tiên rates thật; thiếu → fallback tĩnh.
export function rateFor(locale: string, rates?: Record<string, number>): number {
  const info = infoFor(locale);
  const live = rates?.[info.code];
  return typeof live === 'number' && live > 0 ? live : info.fallbackRate;
}

function fmt(amount: number, intlLocale: string, code: string): string {
  const zeroDecimal = ['VND', 'JPY', 'KRW', 'IDR'].includes(code);
  const maxFrac = zeroDecimal ? 0 : amount > 0 && amount < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(maxFrac)} ${code}`;
  }
}

// Số tiền USD gốc.
export function formatUsd(usd: number): string {
  return fmt(usd, 'en-US', 'USD');
}

// Số tiền quy đổi sang tiền tệ của locale theo tỷ giá đã cho.
export function formatLocal(usd: number, locale: string, rate: number): string {
  const info = infoFor(locale);
  return fmt(usd * rate, info.intlLocale, info.code);
}

// Dòng tỷ giá: "1 $ ≈ 25.960 ₫" (rỗng nếu locale dùng USD).
export function rateLine(locale: string, rates?: Record<string, number>): string {
  const info = infoFor(locale);
  if (info.code === 'USD') return '';
  return `1 $ ≈ ${formatLocal(1, locale, rateFor(locale, rates))}`;
}
