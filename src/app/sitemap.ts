import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';

// Sitemap các trang công khai có thể được tìm kiếm mà không cần đăng nhập.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteOrigin();
  return [
    {
      url: `${base}/login`,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${base}/term`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${base}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
