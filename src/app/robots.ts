import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-url';

// Cho phép index trang công khai; chặn khu vực app/API. Trỏ tới sitemap.
// LƯU Ý: KHÔNG chặn /share/ trong robots.txt — nếu chặn, bot đọc OG của MXH (facebookexternalhit,
// Zalo, Twitter…) cũng bị chặn → link chia sẻ báo cáo mất tiêu đề/mô tả/ảnh bìa. Trang /share/ đã
// gắn thẻ meta noindex (trong generateMetadata) nên search engine vẫn KHÔNG index token bí mật.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteOrigin();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/onboarding'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
