import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';

// Cho phép index trang công khai; chặn khu vực app/API. Trỏ tới sitemap.
export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/onboarding', '/share/'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
