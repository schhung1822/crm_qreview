import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/AppFrame';
import { EntitlementProvider } from '@/components/EntitlementProvider';
import { HtmlLang } from '@/components/HtmlLang';
import { PageViewTracker } from '@/components/PageViewTracker';
import { PixelScripts } from '@/components/PixelScripts';
import { PolarisProvider } from '@/components/PolarisProvider';
import { BIZ_COOKIE, getCurrentUser } from '@/lib/auth/current';
import { isSuperadminUser } from '@/lib/auth/superadmin';
import { entitlementsForBiz } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { getBranding } from '@/lib/store/branding';
import { getUsage } from '@/lib/ai/usage';
import { effectivePermissions } from '@/lib/auth/permissions';
import { ensureMigrated, listBizesForUser, memberOf, resolveActiveBiz } from '@/lib/store/biz';
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

  // Biz là phạm vi lớn nhất: tài khoản CHƯA có biz nào → bắt buộc qua onboarding tạo biz trước.
  await ensureMigrated();
  const cookieBiz = cookies().get(BIZ_COOKIE)?.value;
  const { bizId: activeBizId, role: activeRole } = await resolveActiveBiz(user.id, cookieBiz);
  if (!activeBizId) redirect('/onboarding');
  const bizes = await listBizesForUser(user.id);

  // QUYỀN THEO BIZ: gạn menu theo quyền của user TRONG biz đang hoạt động (không phải quyền toàn cục).
  const member = await memberOf(activeBizId, user.id);
  const bizPermissions = member
    ? effectivePermissions(member.role, member.permissions ?? null)
    : [];
  const frameUser = {
    name: user.name,
    email: user.email,
    role: activeRole ?? user.role,
    permissions: bizPermissions,
    isSuperadmin: await isSuperadminUser(user.id),
  };

  // Token vào/ra của BIZ đang hoạt động (hiện ở khối tài khoản trong Navigation). runWithBiz để
  // store trỏ chắc chắn đúng .data/biz/<activeBizId>/ dù cookie có lệch.
  const usage = await runWithBiz({ userId: user.id, bizId: activeBizId }, () => getUsage());

  // Cờ tính năng theo gói của biz đang hoạt động → cổng vào FeatureGate ở các trang.
  const features = (await entitlementsForBiz(activeBizId)).plan.features;

  // Thương hiệu dùng chung (logo/nguồn) từ "Thông tin hệ thống" → truyền xuống khung ứng dụng.
  const branding = await getBranding();

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLang locale={locale} />
      <PixelScripts />
      <PageViewTracker />
      <PolarisProvider>
        <EntitlementProvider features={features}>
          <AppFrame
            locale={locale}
            user={frameUser}
            bizes={bizes}
            activeBizId={activeBizId}
            tokenIn={usage.totals.inTokens}
            tokenOut={usage.totals.outTokens}
            branding={branding}
          >
            {children}
          </AppFrame>
        </EntitlementProvider>
      </PolarisProvider>
    </NextIntlClientProvider>
  );
}
