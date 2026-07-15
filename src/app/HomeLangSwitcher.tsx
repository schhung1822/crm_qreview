'use client';

import { HtmlLang } from '@/components/HtmlLang';
import { localeNames, locales, type Locale } from '@/i18n/config';

// Bộ chọn ngôn ngữ cho trang chủ công khai: lưu cookie NEXT_LOCALE + điều hướng ?lang=... để
// server render đúng ngôn ngữ (đồng bộ với cơ chế next-intl của phần app). Cập nhật <html lang>.
export function HomeLangSwitcher({ current, label }: { current: Locale; label: string }) {
  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const loc = e.target.value;
    document.cookie = `NEXT_LOCALE=${loc}; path=/; max-age=31536000; samesite=lax`;
    const url = new URL(window.location.href);
    url.searchParams.set('lang', loc);
    window.location.href = url.toString();
  };
  return (
    <>
      <HtmlLang locale={current} />
      <label className="lp-lang" title={label}>
        <svg className="lp-lang__icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M2 10h16M10 2c2.5 2.2 2.5 13.8 0 16M10 2c-2.5 2.2-2.5 13.8 0 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
        <select value={current} onChange={onChange} aria-label={label}>
          {locales.map((l) => (
            <option key={l} value={l}>
              {localeNames[l].native}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
