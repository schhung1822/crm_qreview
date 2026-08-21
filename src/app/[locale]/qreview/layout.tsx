import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { QreviewPageShell } from '@/components/qreview/PageShell';
import { resolveQreviewAdmin } from '@/lib/qreview/guard';

import './qreview-admin.css';

export const metadata: Metadata = {
  title: {
    default: 'Website Qreview',
    template: '%s · Website Qreview',
  },
  robots: { index: false, follow: false },
};

/** Phu thuoc cookie phien nen bat buoc render dong. */
export const dynamic = 'force-dynamic';

/**
 * Cong kiem soat cho toan bo `/qreview`.
 *
 * Day la lop bao ve THAT SU: chay trong tien trinh Node, doc phien tu CSDL CRM,
 * va bao trum moi trang con. Middleware (`src/proxy.ts`) chi lo phan locale nen
 * khong the coi la lop kiem soat quyen.
 *
 * Layout `[locale]/layout.tsx` o tren da lo dang nhap, AppFrame va Polaris; o
 * day chi con viec sieu quan tri va nap bo style rieng cua khu nay.
 */
export default async function QreviewAdminLayout({ children }: { children: ReactNode }) {
  const access = await resolveQreviewAdmin();

  if (access.state === 'forbidden') {
    // Da dang nhap nhung khong du quyen: bao ro thay vi day ve trang dang nhap,
    // neu khong nguoi dung se mac ket trong vong lap dang nhap.
    return (
      <div className="qreview-admin">
        <div className="qreview-denied">
          <h1>Bạn không có quyền truy cập</h1>
          <p>
            Tài khoản <strong>{access.user.email}</strong> không phải quản trị nền tảng nên
            không mở được khu quản trị website Qreview. Liên hệ chủ hệ thống nếu bạn cần quyền
            này.
          </p>
          <a className="qreview-denied-action" href="/dashboard">
            Về Dashboard
          </a>
        </div>
      </div>
    );
  }

  // `anonymous` da duoc layout cha chuyen huong sang /login; nhanh nay chi de
  // TypeScript thu hep kieu va phong khi thu tu layout thay doi ve sau.
  if (access.state === 'anonymous') {
    return null;
  }

  return (
    <div className="qreview-admin">
      <QreviewPageShell>{children}</QreviewPageShell>
    </div>
  );
}
