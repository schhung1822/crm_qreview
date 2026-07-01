'use client';

import { ActionList, Frame, Navigation, TopBar } from '@shopify/polaris';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localeNames, locales, type Locale } from '@/i18n/config';
import { canWith, type Permission, ROLE_LABELS, type Role } from '@/lib/auth/permissions';
import {
  BarsIcon,
  CalendarIcon,
  EditIcon,
  GlobeIcon,
  HomeIcon,
  ImageIcon,
  KeyIcon,
  LinkIcon,
  ListIcon,
  MagicIcon,
  NoteIcon,
  PersonIcon,
  SearchIcon,
  SettingsIcon,
  TargetIcon,
  TranslateIcon,
  UploadIcon,
} from './icons';

interface FrameUser {
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
}

// Ảnh đại diện = icon người dùng SVG (không dùng chữ cái viết tắt). Nhúng data URI để
// TopBar.UserMenu render như ảnh avatar. Nền xám nhạt + hình người xám đậm kiểu Shopify.
const USER_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#e4e5e7"/><circle cx="20" cy="16" r="6.2" fill="#5c5f62"/><path d="M9 32.5a11 11 0 0 1 22 0z" fill="#5c5f62"/></svg>',
  );

export function AppFrame({
  locale,
  user,
  children,
}: {
  locale: Locale;
  user: FrameUser;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Khi chuyển trang (ấn 1 mục menu) → tự đóng menu trượt trên di động.
  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const href = (slug: string) => `/${locale}/${slug}`;

  // ─── Tìm kiếm ở header: tìm bài viết / project từ khóa / content plan ───
  interface SearchData {
    articles: Array<{ id: string; title: string }>;
    sets: Array<{ id: string; seed: string }>;
    plans: Array<{ id: string; title: string; seed?: string }>;
  }
  const [searchData, setSearchData] = useState<SearchData | null>(null);
  const loadingRef = useRef(false);

  const loadSearchData = useCallback(async () => {
    if (loadingRef.current || searchData) return;
    loadingRef.current = true;
    try {
      const [a, k, p] = await Promise.all([
        fetch('/api/articles/draft').then((r) => r.json()).catch(() => ({})),
        fetch('/api/keywordsets').then((r) => r.json()).catch(() => ({})),
        fetch('/api/plans').then((r) => r.json()).catch(() => ({})),
      ]);
      setSearchData({
        articles: Array.isArray(a.articles) ? a.articles : [],
        sets: Array.isArray(k.keywordSets) ? k.keywordSets : [],
        plans: Array.isArray(p.plans) ? p.plans : [],
      });
    } finally {
      loadingRef.current = false;
    }
  }, [searchData]);

  const norm = (s: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const onSearchChange = useCallback(
    (v: string) => {
      setSearch(v);
      if (v.trim()) void loadSearchData();
    },
    [loadSearchData],
  );
  const dismissSearch = useCallback(() => setSearch(''), []);
  const go = useCallback(
    (slug: string) => {
      setSearch('');
      router.push(`/${locale}/${slug}`);
    },
    [locale, router],
  );

  const searchSections = useMemo(() => {
    const q = norm(search.trim());
    if (!q || !searchData) return [];
    const limit = 6;
    const sections: Array<{ title: string; items: Array<{ content: string; onAction: () => void }> }> = [];

    const articleItems = searchData.articles
      .filter((x) => norm(x.title).includes(q))
      .slice(0, limit)
      .map((x) => ({ content: x.title || '(không tiêu đề)', onAction: () => go(`editor?draft=${x.id}`) }));
    if (articleItems.length) sections.push({ title: t('nav.articles'), items: articleItems });

    const setItems = searchData.sets
      .filter((x) => norm(x.seed).includes(q))
      .slice(0, limit)
      .map((x) => ({ content: x.seed, onAction: () => go(`keywords?open=${x.id}`) }));
    if (setItems.length) sections.push({ title: t('nav.keywords'), items: setItems });

    const planItems = searchData.plans
      .filter((x) => norm(x.title).includes(q) || norm(x.seed ?? '').includes(q))
      .slice(0, limit)
      .map((x) => ({ content: x.title || x.seed || '(plan)', onAction: () => go(`plan?id=${x.id}`) }));
    if (planItems.length) sections.push({ title: t('nav.plan'), items: planItems });

    return sections;
  }, [search, searchData, go, t]);

  const hasQuery = search.trim().length > 0;
  const searchResultsMarkup =
    searchSections.length > 0 ? (
      <ActionList sections={searchSections} />
    ) : searchData ? (
      // Đã tải dữ liệu mà không khớp → báo không có kết quả.
      <ActionList items={[{ content: t('app.searchNoResults'), disabled: true }]} />
    ) : (
      // Đang tải dữ liệu lần đầu → tránh chớp "không có kết quả".
      <ActionList items={[{ content: '…', disabled: true }]} />
    );
  const isActive = (slug: string) =>
    pathname === href(slug) || pathname.startsWith(href(slug) + '/');

  const swapLocale = useCallback(
    (next: string) => {
      const parts = pathname.split('/');
      parts[1] = next;
      router.push(parts.join('/') || `/${next}`);
      setLangOpen(false);
    },
    [pathname, router],
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);

  const item = (slug: string, label: string, icon: typeof HomeIcon, badge?: string) => ({
    url: href(slug),
    label,
    icon,
    selected: isActive(slug),
    ...(badge ? { badge } : {}),
  });

  const contentItems = [
    canWith(user.permissions,'content:write') ? item('keywords', t('nav.keywords'), SearchIcon) : null,
    canWith(user.permissions,'content:write') ? item('plan', t('nav.plan'), ListIcon) : null,
    canWith(user.permissions,'content:write') ? item('editor', t('nav.editor'), EditIcon) : null,
    canWith(user.permissions,'content:write') ? item('articles', t('nav.articles'), NoteIcon) : null,
    canWith(user.permissions,'content:write') ? item('optimize', t('nav.optimize'), TargetIcon) : null,
    canWith(user.permissions,'content:write') ? item('translations', t('nav.translations'), TranslateIcon) : null,
    canWith(user.permissions,'content:write') ? item('image-settings', t('nav.imageSettings'), ImageIcon) : null,
    canWith(user.permissions,'content:write') ? item('article-settings', t('nav.articleSettings'), SettingsIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const publishItems = [
    canWith(user.permissions,'content:publish') ? item('publish', t('nav.publish'), UploadIcon) : null,
    canWith(user.permissions,'content:publish') ? item('calendar', t('nav.calendar'), CalendarIcon) : null,
    canWith(user.permissions,'connections:manage') ? item('connections', t('nav.connections'), LinkIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const systemItems = [
    canWith(user.permissions,'aikeys:manage') ? item('settings', t('nav.settings'), KeyIcon) : null,
    canWith(user.permissions,'users:manage') ? item('users', t('nav.users'), PersonIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const navigationMarkup = (
    <Navigation location={pathname}>
      <Navigation.Section
        items={[
          item('dashboard', t('nav.dashboard'), HomeIcon),
          ...(canWith(user.permissions,'content:write') ? [item('audit', t('nav.audit'), GlobeIcon)] : []),
        ]}
      />
      {contentItems.length ? (
        <Navigation.Section title={t('nav.sectionContent')} items={contentItems} />
      ) : null}
      {publishItems.length ? (
        <Navigation.Section title={t('nav.sectionPublish')} items={publishItems} />
      ) : null}
      <Navigation.Section
        title={t('nav.sectionAnalytics')}
        items={[
          item('reports', t('nav.reports'), BarsIcon),
          ...(canWith(user.permissions,'content:write')
            ? [item('citations', t('nav.citations'), MagicIcon)]
            : []),
        ]}
      />
      {systemItems.length ? (
        <Navigation.Section title={t('nav.sectionSystem')} items={systemItems} />
      ) : null}
    </Navigation>
  );

  const langActions = useMemo(
    () => [
      {
        items: locales.map((l) => ({
          content: `${localeNames[l].flag}  ${localeNames[l].native}`,
          active: l === locale,
          onAction: () => swapLocale(l),
        })),
      },
    ],
    [locale, swapLocale],
  );

  const userMenu = (
    <TopBar.UserMenu
      actions={[{ items: [{ content: t('nav.logout'), onAction: logout }] }]}
      name={user.name}
      detail={ROLE_LABELS[user.role]}
      avatar={USER_AVATAR}
      initials=""
      open={userOpen}
      onToggle={() => setUserOpen((v) => !v)}
    />
  );

  const secondaryMenu = (
    <TopBar.Menu
      activatorContent={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="flag">{localeNames[locale].flag}</span>
          <span>{localeNames[locale].native}</span>
        </span>
      }
      open={langOpen}
      onOpen={() => setLangOpen(true)}
      onClose={() => setLangOpen(false)}
      actions={langActions}
    />
  );

  const topBar = (
    <TopBar
      showNavigationToggle
      userMenu={userMenu}
      secondaryMenu={secondaryMenu}
      searchField={
        <TopBar.SearchField
          onChange={onSearchChange}
          value={search}
          placeholder={t('app.search')}
          showFocusBorder
        />
      }
      searchResultsVisible={hasQuery}
      searchResults={searchResultsMarkup}
      onSearchResultsDismiss={dismissSearch}
      onNavigationToggle={() => setMobileNav((v) => !v)}
    />
  );

  const logo = {
    width: 110,
    topBarSource: 'https://noti.vn/image/new/logo-am-ban.png',
    url: href('dashboard'),
    accessibilityLabel: 'Noti',
  };

  return (
    <Frame
      logo={logo}
      topBar={topBar}
      navigation={navigationMarkup}
      showMobileNavigation={mobileNav}
      onNavigationDismiss={() => setMobileNav(false)}
    >
      {children}
    </Frame>
  );
}
