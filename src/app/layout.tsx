import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

// Root layout: nơi DUY NHẤT render <html>/<body> (Next 14 bắt buộc, kể cả trang lỗi).
// lang được cập nhật theo locale ở client (HtmlLang) - app quản trị nên không cần SEO.
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'SEO · AEO · GEO Platform',
  description:
    'Nghiên cứu từ khóa, viết bài mới & tối ưu bài cũ bằng AI, chấm điểm SEO · AEO · GEO và đăng tự động lên WordPress / Wix - đa ngôn ngữ.',
  icons: {
    icon: 'https://noti.vn/image/new/favicon.png',
    shortcut: 'https://noti.vn/image/new/favicon.png',
    apple: 'https://noti.vn/image/new/favicon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
