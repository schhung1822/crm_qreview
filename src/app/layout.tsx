import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

import localFont from 'next/font/local';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TrackingPixels } from '@/components/TrackingPixels';
import { buildBrandThemeCss } from '@/lib/branding/theme';
import { getBrandingSafe } from '@/lib/store/branding';

// Root layout: nơi DUY NHẤT render <html>/<body> (Next 14 bắt buộc, kể cả trang lỗi).
// lang được cập nhật theo locale ở client (HtmlLang) - app quản trị nên không cần SEO.
// SELF-HOST Inter (variable, có sẵn glyph tiếng Việt) → build KHÔNG cần tải Google Fonts
// (tránh fail ETIMEDOUT khi VPS chặn/không ra được fonts.googleapis.com lúc build).
const inter = localFont({
  src: './fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

// Render động để tiêu đề/favicon phản ánh cấu hình runtime (không "đóng băng" lúc build cho các
// trang tĩnh như /login, /onboarding).
export const dynamic = 'force-dynamic';

// Tiêu đề / mô tả / favicon lấy TỪ cấu hình "Thông tin hệ thống" (Quản trị nền tảng). Chưa cấu hình
// → mặc định (giữ nguyên diện mạo cũ).
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrandingSafe('metadata');
  // Ảnh bìa chia sẻ MXH: ưu tiên ogImage (superadmin đặt), fallback logo. Áp cho MỌI trang app
  // (trang chưa tự khai openGraph riêng sẽ dùng mặc định này).
  const ogImg = b.ogImage || b.logoDuongBan;
  return {
    title: b.title,
    description: b.description,
    icons: { icon: b.favicon, shortcut: b.favicon, apple: b.favicon },
    openGraph: {
      title: b.title,
      description: b.description,
      siteName: b.title,
      images: ogImg ? [{ url: ogImg }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: b.title,
      description: b.description,
      images: ogImg ? [ogImg] : undefined,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Ghi đè token màu Polaris theo màu thương hiệu (nếu superadmin đã đặt). SSR ngay trong <head>
  // để không nhấp nháy màu mặc định. Rỗng → không phát sinh style.
  const b = await getBrandingSafe('root-layout');
  const themeCss = buildBrandThemeCss(b);
  return (
    <html lang="vi" className={inter.variable}>
      <head>{themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}</head>
      <body>
        <TrackingPixels fb={b.facebookPixelId} tiktok={b.tiktokPixelId} />
        {children}
      </body>
    </html>
  );
}
