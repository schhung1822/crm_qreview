'use client';

import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

// Cho Polaris dùng next/link → Navigation/Button có url sẽ client-navigate.
// url đã chứa prefix locale (do AppFrame tự gắn).
function PolarisLink({
  url = '',
  children,
  external,
  ...rest
}: {
  url?: string;
  children?: ReactNode;
  external?: boolean;
  [key: string]: unknown;
}) {
  // Link RA NGOÀI website (URL tuyệt đối http/https, vd link bài đã đăng / nguồn ngoài)
  // hoặc đánh dấu external → LUÔN mở tab mới. Internal app link (/locale/...) giữ cùng tab.
  const isWeb = /^https?:\/\//.test(url);
  if (external || isWeb || url.startsWith('mailto:')) {
    const newTab = external || isWeb;
    return (
      <a
        href={url}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink href={url} {...rest}>
      {children}
    </NextLink>
  );
}

export function PolarisProvider({ children }: { children: ReactNode }) {
  return (
    <AppProvider i18n={enTranslations} linkComponent={PolarisLink}>
      {children}
    </AppProvider>
  );
}
