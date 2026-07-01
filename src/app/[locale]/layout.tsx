import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/AppFrame';
import { HtmlLang } from '@/components/HtmlLang';
import { PolarisProvider } from '@/components/PolarisProvider';
import { getCurrentUser } from '@/lib/auth/current';
import { locales, type Locale } from '@/i18n/config';

// App quản trị → render động (next-intl đọc headers + cookie phiên). Không prerender tĩnh.
export const dynamic = 'force-dynamic';

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: Locale };
}) {
  if (!(locales as readonly string[]).includes(locale)) notFound();

  // Chốt chặn đăng nhập: chưa có phiên hợp lệ → về trang /login.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLang locale={locale} />
      <PolarisProvider>
        <AppFrame locale={locale} user={user}>
          {children}
        </AppFrame>
      </PolarisProvider>
    </NextIntlClientProvider>
  );
}
