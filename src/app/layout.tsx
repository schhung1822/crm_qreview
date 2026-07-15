import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildBrandThemeCss } from '@/lib/branding/theme';
import { getBranding } from '@/lib/store/branding';

// Root layout: nơi DUY NHẤT render <html>/<body> (Next 14 bắt buộc, kể cả trang lỗi).
// lang được cập nhật theo locale ở client (HtmlLang) - app quản trị nên không cần SEO.
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

// Render động để tiêu đề/favicon phản ánh cấu hình runtime (không "đóng băng" lúc build cho các
// trang tĩnh như /login, /onboarding).
export const dynamic = 'force-dynamic';

// Tiêu đề / mô tả / favicon lấy TỪ cấu hình "Thông tin hệ thống" (Quản trị nền tảng). Chưa cấu hình
// → mặc định (giữ nguyên diện mạo cũ).
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: b.title,
    description: b.description,
    icons: { icon: b.favicon, shortcut: b.favicon, apple: b.favicon },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Ghi đè token màu Polaris theo màu thương hiệu (nếu superadmin đã đặt). SSR ngay trong <head>
  // để không nhấp nháy màu mặc định. Rỗng → không phát sinh style.
  const b = await getBranding();
  const themeCss = buildBrandThemeCss(b);
  return (
    <html lang="vi" className={inter.variable}>
      <head>{themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}</head>
      <body>{children}</body>
    </html>
  );
}
