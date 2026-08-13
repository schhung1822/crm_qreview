import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/AppFrame';
import { PageViewTracker } from '@/components/PageViewTracker';
import { PixelScripts } from '@/components/PixelScripts';
import { PolarisProvider } from '@/components/PolarisProvider';
import { getCurrentUser } from '@/lib/auth/current';
import { isSuperadminUser } from '@/lib/auth/superadmin';
import { getUsage } from '@/lib/ai/usage';
import { getBrandingSafe } from '@/lib/store/branding';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  if ((await params).locale !== 'vi') notFound();

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [messages, usage, branding, isSuperadmin] = await Promise.all([
    getMessages(),
    getUsage(),
    getBrandingSafe('app-layout'),
    isSuperadminUser(user.id),
  ]);

  return (
    <NextIntlClientProvider locale="vi" messages={messages}>
      <PixelScripts />
      <PageViewTracker />
      <PolarisProvider>
          <AppFrame
            user={{ ...user, isSuperadmin }}
            tokenIn={usage.totals.inTokens}
            tokenOut={usage.totals.outTokens}
            branding={branding}
          >
            {children}
          </AppFrame>
      </PolarisProvider>
    </NextIntlClientProvider>
  );
}
