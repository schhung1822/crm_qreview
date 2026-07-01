'use client';

import { useEffect } from 'react';
import { isRtl } from '@/i18n/config';

// Cập nhật <html lang/dir> theo locale (root layout đặt mặc định 'vi').
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }, [locale]);
  return null;
}
