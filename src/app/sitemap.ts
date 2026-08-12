import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';

// Sitemap trang công khai: trang chủ (kèm hreflang các ngôn ngữ) + trang đăng nhập.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteOrigin();
  return [
    {
      url: `${base}/login`,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
