'use client';

import { ActionList, Frame, Icon, Modal, Navigation, Popover, TextField, TopBar } from '@shopify/polaris';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localeNames, locales, type Locale } from '@/i18n/config';
import { canWith, type Permission, type Role } from '@/lib/auth/permissions';
import type { Branding } from '@/lib/store/branding';
import { AnnouncementTicker } from './AnnouncementTicker';
import { NewsFeed } from './NewsFeed';
import {
  BarsIcon,
  CalendarIcon,
  ChevronDownIcon,
  EditIcon,
  ExitIcon,
  GlobeIcon,
  HelpIcon,
  HomeIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  ClipboardIcon,
  MagicIcon,
  MegaphoneIcon,
  NoteIcon,
  NotificationIcon,
  PageIcon,
  PersonIcon,
  PlayCircleIcon,
  PlusIcon,
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
  isSuperadmin?: boolean; // chủ nền tảng (SUPERADMIN_EMAILS) → hiện khu Quản trị nền tảng
}

// Ảnh đại diện = icon người dùng SVG (không dùng chữ cái viết tắt). Nhúng data URI để
// TopBar.UserMenu render như ảnh avatar. Nền xám nhạt + hình người xám đậm kiểu Shopify.
const USER_AVATAR =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#e4e5e7"/><circle cx="20" cy="16" r="6.2" fill="#5c5f62"/><path d="M9 32.5a11 11 0 0 1 22 0z" fill="#5c5f62"/></svg>',
  );

interface BizItem {
  id: string;
  name: string;
  role: Role;
}

export function AppFrame({
  locale,
  user,
  bizes,
  activeBizId,
  tokenIn,
  tokenOut,
  branding,
  children,
}: {
  locale: Locale;
  user: FrameUser;
  bizes: BizItem[];
  activeBizId: string;
  tokenIn: number;
  tokenOut: number;
  branding: Branding;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();

  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<
    Array<{
      id: string;
      type: 'assigned' | 'reviewRequested' | 'approved' | 'rejected';
      articleId?: string;
      articleTitle?: string;
      actorName?: string;
      note?: string;
      read: boolean;
    }>
  >([]);
  const [news, setNews] = useState({ enabled: false, count: 0 }); // trạng thái Bảng tin (từ NewsFeed)
  const [bizOpen, setBizOpen] = useState(false); // switcher ở header (desktop)
  const [bizCreateOpen, setBizCreateOpen] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [creatingBiz, setCreatingBiz] = useState(false);

  // Chuyển biz đang hoạt động → tải lại để mọi dữ liệu theo biz mới.
  const switchBiz = useCallback(
    async (bizId: string) => {
      setBizOpen(false);
      if (bizId === activeBizId) return;
      await fetch('/api/biz/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizId }),
      });
      window.location.href = `/${locale}/dashboard`;
    },
    [activeBizId, locale],
  );

  // Tạo biz mới ngay từ header (không cần vào trang riêng) → chuyển sang biz vừa tạo.
  const createBiz = useCallback(async () => {
    if (!newBizName.trim()) return;
    setCreatingBiz(true);
    try {
      const res = await fetch('/api/biz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBizName.trim() }),
      });
      if (res.ok) window.location.href = `/${locale}/dashboard`;
    } finally {
      setCreatingBiz(false);
    }
  }, [newBizName, locale]);

  // Khi chuyển trang (ấn 1 mục menu) → tự đóng menu trượt trên di động.
  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const href = (slug: string) => `/${locale}/${slug}`;
  // Định dạng số token theo ngôn ngữ (phân nhóm hàng nghìn).
  const nf = new Intl.NumberFormat(locale);

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
    canWith(user.permissions,'content:write') ? item('backlink', t('nav.backlink'), LinkIcon) : null,
    canWith(user.permissions,'content:write') ? item('translations', t('nav.translations'), TranslateIcon) : null,
    canWith(user.permissions,'content:write') ? item('image-settings', t('nav.imageSettings'), ImageIcon) : null,
    canWith(user.permissions,'content:write') ? item('image-compress', t('nav.imageCompress'), ImageIcon) : null,
    canWith(user.permissions,'content:write') ? item('image-library', 'Thư viện ảnh', ImageIcon) : null,
    canWith(user.permissions,'content:write') ? item('article-settings', t('nav.articleSettings'), SettingsIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const publishItems = [
    canWith(user.permissions,'content:publish') ? item('publish', t('nav.publish'), UploadIcon) : null,
    canWith(user.permissions,'content:publish') ? item('calendar', t('nav.calendar'), CalendarIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  // "Công việc": khu riêng cho luồng cộng tác (Việc của tôi = bài được giao + bài chờ tôi duyệt).
  const taskItems = [
    canWith(user.permissions, 'content:write') ? item('tasks', t('nav.tasks'), ClipboardIcon) : null,
  ].filter(Boolean) as ReturnType<typeof item>[];

  const systemItems = [
    // "Quản lý kết nối" gộp cả API key AI lẫn kết nối CMS → hiện nếu quản được 1 trong 2.
    canWith(user.permissions, 'aikeys:manage') || canWith(user.permissions, 'connections:manage')
      ? item('settings', t('nav.settings'), LinkIcon)
      : null,
    // Gói cước: ai cũng xem được gói + hạn mức của tài khoản mình.
    item('billing', t('nav.billing'), PageIcon),
  ].filter(Boolean) as ReturnType<typeof item>[];

  // "Hỗ trợ": Hướng dẫn sử dụng - hiện cho MỌI user (không cần quyền), đặt DƯỚI "Hệ thống".
  const guideItems = [item('guide', t('nav.guide'), HelpIcon)];

  // Khu QUẢN TRỊ NỀN TẢNG - CHỈ superadmin (chủ nền tảng). Section riêng, tách khỏi phần biz.
  const adminItems = user.isSuperadmin
    ? [item('admin', t('nav.admin'), PersonIcon)]
    : ([] as ReturnType<typeof item>[]);

  // Biz = phạm vi lớn nhất → đặt Ở ĐẦU Navigation, ngay trên "Tổng quan". Icon SVG, không emoji.
  // Bấm vào tên biz (hoặc logo) → trang Biz: danh sách/tạo/chuyển biz + thông tin, nhân viên, email.
  const activeBiz = bizes.find((b) => b.id === activeBizId);

  // Bộ chuyển biz: bấm LOGO (favicon) + tên biz → Popover: danh sách biz để chuyển + "Tạo biz mới".
  // Bấm nút bánh-răng bên phải → trang cài đặt biz (3 tab). Popover render qua portal.
  // Dùng chung cho HEADER (desktop) và DRAWER điều hướng (mobile) - mỗi nơi 1 state riêng để
  // popover không bung nhầm ở bản đang bị ẩn.
  const renderBizSwitcher = (open: boolean, setOpen: React.Dispatch<React.SetStateAction<boolean>>) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Popover
        active={open}
        onClose={() => setOpen(false)}
        fullWidth
        preferredAlignment="left"
        activator={
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              border: '1px solid var(--p-color-border)',
              borderRadius: 8,
              background: 'var(--p-color-bg-surface)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={t('biz.switchTitle')}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.bizLogo}
                alt={branding.sourceText}
                style={{ height: 22, width: 'auto', flexShrink: 0 }}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {activeBiz?.name ?? t('nav.biz')}
              </span>
              <span style={{ marginLeft: 'auto', flexShrink: 0, lineHeight: 0 }}>
                <Icon source={ChevronDownIcon} tone="subdued" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push(href('biz'))}
              aria-label={t('biz.manage')}
              title={t('biz.manage')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 10px',
                background: 'transparent',
                border: 'none',
                borderInlineStart: '1px solid var(--p-color-border)',
                cursor: 'pointer',
              }}
            >
              <span style={{ lineHeight: 0 }}>
                <Icon source={SettingsIcon} tone="subdued" />
              </span>
            </button>
          </div>
        }
      >
        <ActionList
          actionRole="menuitem"
          sections={[
            {
              title: t('biz.switchTitle'),
              items: bizes.map((b) => ({
                content: b.name,
                active: b.id === activeBizId,
                onAction: () => void switchBiz(b.id),
              })),
            },
            {
              items: [
                {
                  content: t('biz.createNew'),
                  icon: PlusIcon,
                  onAction: () => {
                    setOpen(false);
                    setNewBizName('');
                    setBizCreateOpen(true);
                  },
                },
              ],
            },
          ]}
        />
      </Popover>
    </div>
  );

  // Bộ chuyển biz cho MOBILE: danh sách INLINE ngay trong drawer (KHÔNG dùng Popover - popover
  // render qua portal ở z-index thấp hơn drawer nên bị che, bấm không được). Ẩn ở desktop qua CSS.
  const bizSwitcherMobile = (
    <div className="biz-switcher-mobile">
      <div className="biz-switcher-mobile__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.bizLogo} alt={branding.sourceText} className="biz-switcher-mobile__logo" />
        <span className="biz-switcher-mobile__name">{activeBiz?.name ?? t('nav.biz')}</span>
        <button
          type="button"
          className="biz-switcher-mobile__gear"
          onClick={() => router.push(href('biz'))}
          aria-label={t('biz.manage')}
          title={t('biz.manage')}
        >
          <Icon source={SettingsIcon} tone="subdued" />
        </button>
      </div>
      <div className="biz-switcher-mobile__list">
        {bizes.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`biz-switcher-mobile__item${b.id === activeBizId ? ' is-active' : ''}`}
            onClick={() => void switchBiz(b.id)}
          >
            <span className="dot" aria-hidden>
              {b.id === activeBizId ? '●' : '○'}
            </span>
            <span className="label">{b.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="biz-switcher-mobile__create"
          onClick={() => {
            setNewBizName('');
            setBizCreateOpen(true);
          }}
        >
          <span className="icn" aria-hidden>
            <Icon source={PlusIcon} />
          </span>
          <span>{t('biz.createNew')}</span>
        </button>
      </div>
    </div>
  );

  // Ô tìm kiếm ĐẦU SIDEBAR (chuyển từ header xuống - nhường chỗ giữa header cho ticker thông báo).
  // Kết quả hiện ngay dưới ô. Dùng chung onSearchChange/searchResultsMarkup như bản ở header cũ.
  const navSearch = (
    <div style={{ padding: '10px 12px 4px' }}>
      <TextField
        label={t('app.search')}
        labelHidden
        value={search}
        onChange={onSearchChange}
        placeholder={t('app.search')}
        autoComplete="off"
        prefix={<Icon source={SearchIcon} tone="subdued" />}
        clearButton
        onClearButtonClick={() => setSearch('')}
      />
      {hasQuery ? <div style={{ marginTop: 6 }}>{searchResultsMarkup}</div> : null}
    </div>
  );

  const navigationMarkup = (
    <Navigation location={pathname}>
      {navSearch}
      {bizSwitcherMobile}
      <Navigation.Section
        items={[
          item('dashboard', t('nav.dashboard'), HomeIcon),
          ...(canWith(user.permissions,'content:write') ? [item('audit', t('nav.audit'), GlobeIcon)] : []),
          ...(canWith(user.permissions,'content:write') ? [item('landing-audit', t('nav.landingAudit'), PageIcon)] : []),
        ]}
      />
      {contentItems.length ? (
        <Navigation.Section title={t('nav.sectionContent')} items={contentItems} />
      ) : null}
      {taskItems.length ? (
        <Navigation.Section title={t('nav.sectionTasks')} items={taskItems} />
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
          ...(canWith(user.permissions,'content:write')
            ? [item('social-report', t('nav.socialReport'), MegaphoneIcon)]
            : []),
          ...(canWith(user.permissions,'content:write')
            ? [item('script-analysis', t('nav.scriptAnalysis'), PlayCircleIcon)]
            : []),
        ]}
      />
      {systemItems.length ? (
        <Navigation.Section title={t('nav.sectionSystem')} items={systemItems} />
      ) : null}
      <Navigation.Section title={t('nav.sectionGuide')} items={guideItems} />
      {adminItems.length ? (
        <Navigation.Section title={t('nav.sectionAdmin')} items={adminItems} />
      ) : null}
      {/* Khối đáy: tài khoản [avatar][tên][đăng xuất] rồi token vào / token ra, tới "by: noti.vn". */}
      <div className="nav-bottom">
        <div className="nav-account">
          <div className="nav-account__head">
            {/* Bấm avatar/tên → trang Tài khoản. KHÔNG dùng Popover (drawer mobile che). */}
            <button
              type="button"
              className="nav-account__id"
              onClick={() => router.push(href('account'))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={USER_AVATAR} alt="" className="nav-account__avatar" />
              <span className="nav-account__name">{user.name}</span>
            </button>
            <button
              type="button"
              className="nav-account__logout"
              onClick={logout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <Icon source={ExitIcon} tone="subdued" />
            </button>
          </div>
          <div className="nav-account__tokens">
            <span className="nav-account__token">
              <span className="lbl">{t('dashboard.tokenIn')}</span>
              <b>{nf.format(tokenIn)}</b>
            </span>
            <span className="nav-account__token">
              <span className="lbl">{t('dashboard.tokenOut')}</span>
              <b>{nf.format(tokenOut)}</b>
            </span>
          </div>
        </div>
        <div className="nav-credit">
          <a href={branding.sourceUrl} target="_blank" rel="noopener noreferrer">
            {branding.sourceText}
          </a>
        </div>
      </div>
    </Navigation>
  );

  const langActions = useMemo(
    () => [
      {
        items: locales.map((l) => ({
          content: localeNames[l].native,
          prefix: <span className="flag">{localeNames[l].flag}</span>,
          active: l === locale,
          onAction: () => swapLocale(l),
        })),
      },
    ],
    [locale, swapLocale],
  );

  // ─── Chuông thông báo (được giao bài / chờ duyệt / được duyệt / bị trả lại) ───
  const loadNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) setNotifs((await res.json()).notifs ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void loadNotifs();
  }, [loadNotifs]);

  // ─── Chuông BẢNG TIN: nhận trạng thái từ NewsFeed (cột phải) qua sự kiện window ───
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ enabled: boolean; count: number }>).detail;
      if (d) setNews({ enabled: !!d.enabled, count: Number(d.count) || 0 });
    };
    window.addEventListener('news:state', onState);
    window.dispatchEvent(new CustomEvent('news:request')); // hỏi trạng thái nếu NewsFeed đã sẵn sàng
    return () => window.removeEventListener('news:state', onState);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  async function toggleNotifs() {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && unread > 0) {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {});
      setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
    }
  }

  function notifText(n: (typeof notifs)[number]): string {
    const p = { who: n.actorName ?? '', title: n.articleTitle ?? '' };
    if (n.type === 'assigned') return t('notif.assigned', p);
    if (n.type === 'reviewRequested') return t('notif.reviewRequested', p);
    if (n.type === 'approved') return t('notif.approved', p);
    return t('notif.rejected', p) + (n.note ? ` - ${n.note}` : '');
  }

  const notifMenu = (
    <Popover
      active={notifOpen}
      onClose={() => setNotifOpen(false)}
      preferredAlignment="right"
      activator={
        <button
          type="button"
          onClick={() => void toggleNotifs()}
          aria-label={t('notif.title')}
          title={t('notif.title')}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Icon source={NotificationIcon} tone={unread > 0 ? 'base' : 'subdued'} />
          {unread > 0 ? (
            <span
              style={{
                position: 'absolute',
                top: 3,
                right: 3,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 8,
                background: 'var(--p-color-bg-fill-critical)',
                color: 'var(--p-color-text-critical-on-bg-fill)',
                fontSize: 10,
                lineHeight: '16px',
                textAlign: 'center',
              }}
            >
              {unread}
            </span>
          ) : null}
        </button>
      }
    >
      <div style={{ maxWidth: 340 }}>
        <ActionList
          items={
            notifs.length
              ? notifs.slice(0, 15).map((n) => ({
                  content: notifText(n),
                  onAction: () => {
                    setNotifOpen(false);
                    router.push(href(n.articleId ? `editor?draft=${n.articleId}` : 'tasks'));
                  },
                }))
              : [{ content: t('notif.empty'), disabled: true }]
          }
        />
      </div>
    </Popover>
  );

  // Chuông BẢNG TIN: chỉ hiện khi bảng tin đang bật. Bấm → mở panel cột phải (NewsFeed nghe sự kiện).
  const newsBell = news.enabled ? (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('news:open'))}
      aria-label={t('news.title')}
      title={t('news.title')}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <Icon source={MegaphoneIcon} tone={news.count > 0 ? 'base' : 'subdued'} />
      {news.count > 0 ? (
        <span
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: 'var(--p-color-bg-fill-critical)',
            color: 'var(--p-color-text-critical-on-bg-fill)',
            fontSize: 10,
            lineHeight: '16px',
            textAlign: 'center',
          }}
        >
          {news.count > 99 ? '99+' : news.count}
        </span>
      ) : null}
    </button>
  ) : null;

  const secondaryMenu = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {newsBell}
      {notifMenu}
      <TopBar.Menu
        activatorContent={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span className="flag">{localeNames[locale].flag}</span>
            <span className="topbar-lang-name">{localeNames[locale].native}</span>
          </span>
        }
        open={langOpen}
        onOpen={() => setLangOpen(true)}
        onClose={() => setLangOpen(false)}
        actions={langActions}
      />
    </div>
  );

  // Vùng trái header (cạnh logo): logo + bộ chuyển biz. contextControl là slot Polaris dành riêng
  // cho "context switcher" nằm bên trái top bar, ngay chỗ logo.
  const contextControl = (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingInline: 12, minWidth: 0 }}>
      {renderBizSwitcher(bizOpen, setBizOpen)}
    </div>
  );

  // Dải thông báo CHẠY ở giữa header (slot searchField của TopBar - ô tìm kiếm đã dời xuống
  // sidebar). Nội dung/tốc độ/link chỉnh ở Quản trị nền tảng; tắt hoặc trống thì không hiện gì.
  const topBar = (
    <TopBar
      showNavigationToggle
      contextControl={contextControl}
      searchField={<AnnouncementTicker />}
      secondaryMenu={secondaryMenu}
      onNavigationToggle={() => setMobileNav((v) => !v)}
    />
  );

  // Bấm logo → trang Biz (danh sách biz / tạo biz), theo yêu cầu. Dùng favicon cho gọn (mobile).
  const logo = {
    width: 32,
    topBarSource: branding.bizLogo,
    url: href('biz'),
    accessibilityLabel: branding.sourceText,
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
      <NewsFeed />
      {bizCreateOpen ? (
        <Modal
          open
          onClose={() => setBizCreateOpen(false)}
          title={t('biz.createNew')}
          primaryAction={{
            content: t('biz.create'),
            onAction: () => void createBiz(),
            loading: creatingBiz,
            disabled: !newBizName.trim(),
          }}
          secondaryActions={[{ content: t('biz.cancel'), onAction: () => setBizCreateOpen(false) }]}
        >
          <Modal.Section>
            <TextField
              label={t('biz.createName')}
              value={newBizName}
              onChange={setNewBizName}
              autoComplete="off"
              placeholder={t('biz.createPlaceholder')}
              autoFocus
            />
          </Modal.Section>
        </Modal>
      ) : null}
    </Frame>
  );
}
