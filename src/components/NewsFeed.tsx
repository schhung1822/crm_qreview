'use client';

// BẢNG TIN cột phải (news-feed). Cột cố định bên phải, thu gọn thành dải mảnh có chuông + badge khi
// có tin CHƯA ĐỌC. Bấm 1 tin → popup nội dung đầy đủ (ảnh + markdown + link) + đánh dấu TIN ĐÓ đã đọc.
// Nội dung do superadmin soạn (Quản trị nền tảng → tab Tin tức).
// ĐÃ ĐỌC THEO TỪNG TIN: lưu TẬP id tin đã đọc ở localStorage (newsfeed:read) → tin nào đã mở mới mất
// tag "Mới"; các tin khác vẫn còn. Badge = số tin chưa đọc. Trạng thái mở/đóng lưu riêng.
import { Badge, Button, Icon, Modal } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { markdownToHtml } from '@/lib/content/markdown';
import { ChevronRightIcon, MegaphoneIcon } from './icons';

type NewsCategory = 'important' | 'update' | 'feature' | 'event' | 'webinar' | 'guide';
interface NewsItem {
  id: string;
  title: string;
  body: string;
  category: NewsCategory;
  url?: string;
  imageUrl?: string;
  publishedAt: string;
  pinned: boolean;
  enabled: boolean;
}

const CATEGORY_ORDER: NewsCategory[] = ['important', 'update', 'feature', 'event', 'webinar', 'guide'];
const CAT_TONE: Record<NewsCategory, 'critical' | 'info' | 'success' | 'attention' | 'new' | 'warning'> = {
  important: 'critical',
  update: 'info',
  feature: 'success',
  event: 'attention',
  webinar: 'new',
  guide: 'warning',
};

const LS_OPEN = 'newsfeed:open';
const LS_READ = 'newsfeed:read'; // JSON mảng id tin ĐÃ ĐỌC
const LS_SEEN = 'newsfeed:seenAt'; // (cũ) mốc "đã xem" chung - chỉ dùng để MIGRATE sang tập đã đọc

export function NewsFeed() {
  const t = useTranslations('news');
  const locale = useLocale();

  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<'all' | NewsCategory>('all');
  const [active, setActive] = useState<NewsItem | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readLoaded, setReadLoaded] = useState(false);

  // Tải bảng tin công khai (mọi user đăng nhập).
  useEffect(() => {
    let alive = true;
    fetch('/api/news')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enabled: boolean; items: NewsItem[] } | null) => {
        if (!alive || !d) return;
        setEnabled(d.enabled);
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Khôi phục trạng thái mở + tập tin đã đọc. Mặc định mở trên màn rộng, đóng trên màn hẹp.
  useEffect(() => {
    try {
      const so = localStorage.getItem(LS_OPEN);
      setOpen(so === null ? window.innerWidth >= 1200 : so === '1');
      const raw = localStorage.getItem(LS_READ);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) setReadIds(new Set(arr.map((x) => String(x))));
    } catch {
      setOpen(window.innerWidth >= 1200);
    } finally {
      setReadLoaded(true);
    }
  }, []);

  // Phản ánh trạng thái ra <html> để CSS co vùng nội dung chính (chỉ trên desktop).
  useEffect(() => {
    const el = document.documentElement;
    if (loaded && enabled && items.length > 0) el.dataset.news = open ? 'open' : 'closed';
    else delete el.dataset.news;
    return () => {
      delete el.dataset.news;
    };
  }, [open, enabled, loaded, items.length]);

  // Đánh dấu 1 TIN đã đọc (thêm id vào tập + lưu localStorage). Chỉ tin đó mất tag "Mới".
  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(LS_READ, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Mở 1 tin = đọc tin đó.
  const openItem = useCallback((it: NewsItem) => {
    setActive(it);
    markRead(it.id);
  }, [markRead]);

  // Đánh dấu TẤT CẢ đã đọc (xoá hết tag "Mới" + badge về 0).
  const markAllRead = useCallback(() => {
    const all = new Set(items.map((i) => i.id));
    setReadIds(all);
    try {
      localStorage.setItem(LS_READ, JSON.stringify([...all]));
    } catch {
      /* ignore */
    }
  }, [items]);

  // MIGRATE 1 lần: chưa có tập đã đọc nhưng có mốc "đã xem" cũ → coi tin cũ (<= mốc) là đã đọc, để
  // user cũ không bị hiện lại tag "Mới" hàng loạt. Tin mới hơn mốc vẫn là chưa đọc (đúng).
  useEffect(() => {
    if (!readLoaded || !loaded || items.length === 0) return;
    try {
      if (localStorage.getItem(LS_READ) !== null) return; // đã có tập mới → không migrate
      const legacy = Number(localStorage.getItem(LS_SEEN) || 0);
      const migrated = new Set(
        legacy ? items.filter((i) => new Date(i.publishedAt).getTime() <= legacy).map((i) => i.id) : [],
      );
      setReadIds(migrated);
      localStorage.setItem(LS_READ, JSON.stringify([...migrated]));
    } catch {
      /* ignore */
    }
  }, [readLoaded, loaded, items]);

  const setOpenPersist = useCallback((v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(LS_OPEN, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const unread = useMemo(
    () => items.filter((i) => !readIds.has(i.id)).length,
    [items, readIds],
  );

  // ── Cầu nối với chuông "Bảng tin" trên header (AppFrame) qua sự kiện window ──
  // Phát trạng thái (bật + số tin mới) để header hiện icon + badge.
  useEffect(() => {
    if (!loaded) return;
    const detail = { enabled: enabled && items.length > 0, count: unread };
    window.dispatchEvent(new CustomEvent('news:state', { detail }));
  }, [loaded, enabled, items.length, unread]);
  // Nghe header: mở panel, hoặc hỏi lại trạng thái (khi header mount sau).
  useEffect(() => {
    const onOpen = () => setOpenPersist(true);
    const onRequest = () =>
      window.dispatchEvent(
        new CustomEvent('news:state', { detail: { enabled: enabled && items.length > 0, count: unread } }),
      );
    window.addEventListener('news:open', onOpen);
    window.addEventListener('news:request', onRequest);
    return () => {
      window.removeEventListener('news:open', onOpen);
      window.removeEventListener('news:request', onRequest);
    };
  }, [enabled, items.length, unread, setOpenPersist]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    [locale],
  );
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
  };
  const catLabel = (c: NewsCategory) => t(`cat_${c}`);

  const cats = useMemo(() => CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c)), [items]);
  const shown = useMemo(
    () => (cat === 'all' ? items : items.filter((i) => i.category === cat)),
    [items, cat],
  );

  const bodyHtml = useMemo(() => (active ? markdownToHtml(active.body) : ''), [active]);

  if (!loaded || !enabled || items.length === 0) return null;

  const badge =
    unread > 0 ? <span className="newsfeed-badge">{unread > 99 ? '99+' : unread}</span> : null;

  return (
    <>
      {/* Thu gọn: dải mảnh (desktop) + nút nổi (mobile). Bấm để mở. */}
      {!open ? (
        <>
          <button
            type="button"
            className="newsfeed-strip"
            onClick={() => setOpenPersist(true)}
            aria-label={t('open')}
            title={t('title')}
          >
            <span className="newsfeed-strip__bell">
              <Icon source={MegaphoneIcon} tone={unread > 0 ? 'base' : 'subdued'} />
              {badge}
            </span>
            <span className="newsfeed-strip__label">{t('title')}</span>
          </button>
          <button
            type="button"
            className="newsfeed-fab"
            onClick={() => setOpenPersist(true)}
            aria-label={t('open')}
            title={t('title')}
          >
            <Icon source={MegaphoneIcon} tone="base" />
            {badge}
          </button>
        </>
      ) : null}

      {/* Nền mờ (chỉ overlay trên mobile). */}
      {open ? <div className="newsfeed-backdrop" onClick={() => setOpenPersist(false)} aria-hidden /> : null}

      <aside className={`newsfeed-panel${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label={t('title')}>
        <div className="newsfeed-panel__head">
          <span className="newsfeed-panel__title">
            <Icon source={MegaphoneIcon} tone="base" />
            {t('title')}
          </span>
          <button
            type="button"
            className="newsfeed-panel__collapse"
            onClick={() => setOpenPersist(false)}
            aria-label={t('collapse')}
            title={t('collapse')}
          >
            <Icon source={ChevronRightIcon} tone="subdued" />
          </button>
        </div>

        {/* Bộ lọc phân loại: Tất cả + các phân loại đang có tin. */}
        <div className="newsfeed-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={cat === 'all'}
            className={`newsfeed-tab${cat === 'all' ? ' is-active' : ''}`}
            onClick={() => setCat('all')}
          >
            {t('all')}
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cat === c}
              className={`newsfeed-tab${cat === c ? ' is-active' : ''}`}
              onClick={() => setCat(c)}
            >
              {catLabel(c)}
            </button>
          ))}
        </div>

        {/* Đánh dấu tất cả đã đọc - chỉ hiện khi còn tin chưa đọc. */}
        {unread > 0 ? (
          <button type="button" className="newsfeed-markall" onClick={markAllRead}>
            {t('markAllRead')} ({unread})
          </button>
        ) : null}

        <div className="newsfeed-list">
          {shown.length === 0 ? (
            <p className="newsfeed-empty">{t('empty')}</p>
          ) : (
            shown.map((it) => {
              const isUnread = !readIds.has(it.id); // chưa đọc → hiện tag "Mới"
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`newsfeed-item${isUnread ? ' is-unread' : ''}`}
                  onClick={() => openItem(it)}
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="newsfeed-item__thumb" src={it.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="newsfeed-item__thumb newsfeed-item__thumb--ph" aria-hidden>
                      <Icon source={MegaphoneIcon} tone="subdued" />
                    </span>
                  )}
                  <span className="newsfeed-item__body">
                    <span className="newsfeed-item__top">
                      {isUnread ? <span className="newsfeed-new-tag">{t('newDot')}</span> : null}
                      <Badge tone={CAT_TONE[it.category]}>{catLabel(it.category)}</Badge>
                      {it.pinned ? <Badge>{t('pinned')}</Badge> : null}
                    </span>
                    <span className="newsfeed-item__title">{it.title}</span>
                    <span className="newsfeed-item__date">{fmtDate(it.publishedAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Popup nội dung đầy đủ. */}
      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.title ?? ''}
        primaryAction={{ content: t('close'), onAction: () => setActive(null) }}
        secondaryActions={
          active?.url
            ? [
                {
                  content: t('openLink'),
                  onAction: () => {
                    const u = active.url as string;
                    if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener,noreferrer');
                    else window.location.href = u;
                  },
                },
              ]
            : undefined
        }
      >
        <Modal.Section>
          {active ? (
            <div className="newsfeed-detail">
              <div className="newsfeed-detail__meta">
                <Badge tone={CAT_TONE[active.category]}>{catLabel(active.category)}</Badge>
                <span className="newsfeed-detail__date">{fmtDate(active.publishedAt)}</span>
              </div>
              {active.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="newsfeed-detail__img" src={active.imageUrl} alt="" />
              ) : null}
              <div className="newsfeed-detail__body markdown-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>
          ) : null}
        </Modal.Section>
      </Modal>
    </>
  );
}
