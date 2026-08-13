'use client';

import { Frame, Icon, Navigation, TopBar } from '@shopify/polaris';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { canWith, type Permission, type Role } from '@/lib/auth/permissions';
import type { Branding } from '@/lib/store/branding';
import {
  BarsIcon,
  CalendarIcon,
  EditIcon,
  ExitIcon,
  HelpIcon,
  HomeIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  MagicIcon,
  MegaphoneIcon,
  NoteIcon,
  PageIcon,
  PersonIcon,
  PlayCircleIcon,
  SearchIcon,
  SettingsIcon,
  TargetIcon,
  UploadIcon,
} from './icons';

interface FrameUser {
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  isSuperadmin?: boolean;
}

const USER_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#e4e5e7"/><circle cx="20" cy="16" r="6.2" fill="#5c5f62"/><path d="M9 32.5a11 11 0 0 1 22 0z" fill="#5c5f62"/></svg>',
  );

export function AppFrame({
  user,
  tokenIn,
  tokenOut,
  branding,
  children,
}: {
  user: FrameUser;
  tokenIn: number;
  tokenOut: number;
  branding: Branding;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setMobileNav(false);
    setUserMenuOpen(false);
  }, [pathname]);

  const href = (slug: string) => `/${slug}`;
  const isActive = (slug: string) => pathname === href(slug) || pathname.startsWith(`${href(slug)}/`);
  const item = (slug: string, label: string, icon: typeof HomeIcon) => ({
    url: href(slug),
    label,
    icon,
    selected: isActive(slug),
  });

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  const contentItems = [
    canWith(user.permissions, 'content:write') ? item('keywords', t('nav.keywords'), SearchIcon) : null,
    canWith(user.permissions, 'content:write') ? item('plan', t('nav.plan'), ListIcon) : null,
    canWith(user.permissions, 'content:write') ? item('editor', t('nav.editor'), EditIcon) : null,
    canWith(user.permissions, 'content:write') ? item('articles', t('nav.articles'), NoteIcon) : null,
    canWith(user.permissions, 'content:write') ? item('optimize', t('nav.optimize'), TargetIcon) : null,
    canWith(user.permissions, 'content:write') ? item('backlink', t('nav.backlink'), LinkIcon) : null,
    canWith(user.permissions, 'content:write') ? item('image-settings', t('nav.imageSettings'), ImageIcon) : null,
    canWith(user.permissions, 'content:write') ? item('image-compress', t('nav.imageCompress'), ImageIcon) : null,
    canWith(user.permissions, 'content:write') ? item('image-library', 'Thư viện ảnh', ImageIcon) : null,
    canWith(user.permissions, 'content:write') ? item('article-settings', t('nav.articleSettings'), SettingsIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const taskItems = [
    canWith(user.permissions, 'view') ? item('tasks', t('nav.tasks'), PageIcon) : null,
    canWith(user.permissions, 'view') ? item('calendar', t('nav.calendar'), CalendarIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const publishItems = [
    canWith(user.permissions, 'connections:manage') ? item('connections', t('nav.connections'), LinkIcon) : null,
    canWith(user.permissions, 'content:publish') ? item('publish', t('nav.publish'), UploadIcon) : null,
    canWith(user.permissions, 'content:publish') ? item('social-publish', 'Đăng mạng xã hội', MegaphoneIcon) : null,
    canWith(user.permissions, 'content:publish') ? item('social-posts', 'Bài đăng mạng xã hội', ListIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const analyticsItems = [
    item('reports', t('nav.reports'), BarsIcon),
    canWith(user.permissions, 'content:write') ? item('audit', t('nav.audit'), MagicIcon) : null,
    canWith(user.permissions, 'content:write') ? item('landing-audit', t('nav.landingAudit'), MagicIcon) : null,
    canWith(user.permissions, 'content:write') ? item('citations', t('nav.citations'), MagicIcon) : null,
    canWith(user.permissions, 'content:write') ? item('social-report', t('nav.socialReport'), MegaphoneIcon) : null,
    canWith(user.permissions, 'content:write') ? item('script-analysis', t('nav.scriptAnalysis'), PlayCircleIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const systemItems = [
    canWith(user.permissions, 'users:manage') ? item('settings', t('nav.settings'), SettingsIcon) : null,
    item('account', t('nav.account'), PersonIcon),
  ].filter(Boolean) as ReturnType<typeof item>[];

  const navigation = (
    <Navigation location={pathname}>
      <Navigation.Section items={[item('dashboard', t('nav.dashboard'), HomeIcon)]} />
      {contentItems.length ? <Navigation.Section title={t('nav.sectionContent')} items={contentItems} /> : null}
      {taskItems.length ? <Navigation.Section title={t('nav.sectionTasks')} items={taskItems} /> : null}
      {publishItems.length ? <Navigation.Section title={t('nav.sectionPublish')} items={publishItems} /> : null}
      <Navigation.Section title={t('nav.sectionAnalytics')} items={analyticsItems} />
      {systemItems.length ? <Navigation.Section title={t('nav.sectionSystem')} items={systemItems} /> : null}
      <Navigation.Section title={t('nav.sectionGuide')} items={[item('guide', t('nav.guide'), HelpIcon)]} />
      {user.isSuperadmin ? (
        <Navigation.Section title={t('nav.sectionAdmin')} items={[item('admin', t('nav.admin'), SettingsIcon)]} />
      ) : null}
      <div className="nav-bottom">
        <div className="nav-credit"><a href={branding.sourceUrl} target="_blank" rel="noopener noreferrer">{branding.sourceText}</a></div>
      </div>
    </Navigation>
  );

  const compactToken = (value: number) =>
    new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const tokenSummary = (
    <div className="app-topbar-tokens" aria-label="Thống kê token AI">
      <div className="app-topbar-token app-topbar-token--in" title={`${t('dashboard.tokenIn')}: ${tokenIn.toLocaleString('vi-VN')}`}>
        <span className="app-topbar-token__arrow" aria-hidden="true">↘</span>
        <span className="app-topbar-token__content">
          <span className="app-topbar-token__label">{t('dashboard.tokenIn')}</span>
          <strong>{compactToken(tokenIn)}</strong>
        </span>
      </div>
      <div className="app-topbar-token app-topbar-token--out" title={`${t('dashboard.tokenOut')}: ${tokenOut.toLocaleString('vi-VN')}`}>
        <span className="app-topbar-token__arrow" aria-hidden="true">↗</span>
        <span className="app-topbar-token__content">
          <span className="app-topbar-token__label">{t('dashboard.tokenOut')}</span>
          <strong>{compactToken(tokenOut)}</strong>
        </span>
      </div>
    </div>
  );

  const userMenu = (
    <TopBar.UserMenu
      actions={[
        {
          items: [
            { content: 'Cài đặt tài khoản', icon: PersonIcon, url: '/account' },
            { content: t('nav.logout'), icon: ExitIcon, onAction: () => void logout() },
          ],
        },
      ]}
      name={user.name}
      detail={user.email}
      initials={initials || 'A'}
      avatar={USER_AVATAR}
      open={userMenuOpen}
      onToggle={() => setUserMenuOpen((value) => !value)}
      accessibilityLabel={`Mở cài đặt tài khoản của ${user.name}`}
      customActivator={
        <span className="app-topbar-settings">
          <span className="app-topbar-settings__icon" aria-hidden="true">
            <Icon source={SettingsIcon} />
          </span>
          <span className="app-topbar-settings__text">
            <span className="app-topbar-settings__label">Cài đặt</span>
            <span className="app-topbar-settings__name">{user.name}</span>
          </span>
        </span>
      }
    />
  );

  const topBar = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setMobileNav((value) => !value)}
      secondaryMenu={tokenSummary}
      userMenu={userMenu}
    />
  );
  const logo = branding.logoAmBan
    ? {
        width: 184,
        topBarSource: branding.logoAmBan,
        url: '/dashboard',
        accessibilityLabel: branding.title,
      }
    : undefined;

  return (
    <Frame logo={logo} topBar={topBar} navigation={navigation} showMobileNavigation={mobileNav} onNavigationDismiss={() => setMobileNav(false)}>
      {children}
    </Frame>
  );
}
