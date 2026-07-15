import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';
import { locales } from '@/i18n/config';

// Sitemap trang công khai: trang chủ (kèm hreflang các ngôn ngữ) + trang đăng nhập.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `${base}/?lang=${l}`;
  return [
    {
      url: `${base}/`,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: { languages },
    },
    {
      url: `${base}/login`,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
