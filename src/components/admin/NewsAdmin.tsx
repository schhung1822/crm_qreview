'use client';

// Quản trị BẢNG TIN cột phải: superadmin thêm/sửa/xoá tin (tiêu đề, nội dung markdown, phân loại,
// ngày đăng, ảnh, link, ghim). Tin hiển thị cho mọi user ở cột phải, sắp theo ghim → ngày.
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiErrText } from '@/lib/admin/api-error';
import { markdownToHtml } from '@/lib/content/markdown';

const BODY_ID = 'news-body-md'; // id textarea nội dung → thao tác chèn định dạng theo vùng chọn

type NewsCategory = 'important' | 'update' | 'feature' | 'event' | 'webinar' | 'guide';
const CATEGORIES: NewsCategory[] = ['important', 'update', 'feature', 'event', 'webinar', 'guide'];

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
interface Cfg {
  enabled: boolean;
  items: NewsItem[];
}
type Draft = { isNew: boolean; item: NewsItem };

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return String(Date.now());
  }
}
function todayIso(): string {
  return new Date().toISOString();
}
// ISO → giá trị cho <input type="date"> (YYYY-MM-DD).
function isoToDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function NewsAdmin() {
  const t = useTranslations('admin');
  const tn = useTranslations('news');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Chèn liên kết: mở ô URL inline, giữ lại vùng chọn lúc bấm để chèn đúng chỗ.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkSel, setLinkSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/news');
    if (r.ok) setCfg(await r.json());
    else setCfg({ enabled: false, items: [] });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setLinkOpen(false);
    setDraft({
      isNew: true,
      item: { id: newId(), title: '', body: '', category: 'update', url: '', imageUrl: '', publishedAt: todayIso(), pinned: false, enabled: true },
    });
  }
  function openEdit(it: NewsItem) {
    setLinkOpen(false);
    setDraft({ isNew: false, item: { ...it } });
  }
  function closeDraft() {
    setLinkOpen(false);
    setDraft(null);
  }
  function updDraft(p: Partial<NewsItem>) {
    setDraft((d) => (d ? { ...d, item: { ...d.item, ...p } } : d));
  }

  // ── Công cụ định dạng nội dung (markdown) thao tác trên vùng chọn của textarea ──
  function bodyTextarea(): HTMLTextAreaElement | null {
    return typeof document !== 'undefined' ? (document.getElementById(BODY_ID) as HTMLTextAreaElement | null) : null;
  }
  function selRange(body: string): { start: number; end: number } {
    const ta = bodyTextarea();
    return ta ? { start: ta.selectionStart, end: ta.selectionEnd } : { start: body.length, end: body.length };
  }
  // Bọc vùng chọn bằng before/after (đậm...). Không chọn gì → chèn placeholder rồi bôi đen nó.
  function surround(before: string, after: string, placeholder: string) {
    const body = draft?.item.body ?? '';
    const { start, end } = selRange(body);
    const sel = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + sel + after + body.slice(end);
    updDraft({ body: next });
    requestAnimationFrame(() => {
      const ta = bodyTextarea();
      if (ta) {
        ta.focus();
        ta.setSelectionRange(start + before.length, start + before.length + sel.length);
      }
    });
  }
  // Thêm "## " vào đầu dòng chứa con trỏ (biến dòng thành tiêu đề).
  function heading() {
    const body = draft?.item.body ?? '';
    const { start } = selRange(body);
    const ls = body.lastIndexOf('\n', start - 1) + 1;
    if (body.slice(ls).startsWith('## ')) return;
    const next = body.slice(0, ls) + '## ' + body.slice(ls);
    updDraft({ body: next });
    requestAnimationFrame(() => bodyTextarea()?.focus());
  }
  // Mở ô URL để chèn liên kết: giữ vùng chọn hiện tại làm chữ hiển thị.
  function openLink() {
    const body = draft?.item.body ?? '';
    setLinkSel(selRange(body));
    setLinkUrl('');
    setLinkOpen(true);
  }
  function insertLink() {
    const body = draft?.item.body ?? '';
    const { start, end } = linkSel;
    const text = body.slice(start, end) || t('newsFmtLinkText');
    const url = linkUrl.trim() || 'https://';
    const next = body.slice(0, start) + `[${text}](${url})` + body.slice(end);
    updDraft({ body: next });
    setLinkOpen(false);
    setLinkUrl('');
  }
  function applyDraft() {
    if (!draft) return;
    setCfg((c) => {
      if (!c) return c;
      const items = draft.isNew
        ? [...c.items, draft.item]
        : c.items.map((it) => (it.id === draft.item.id ? draft.item : it));
      return { ...c, items };
    });
    setDraft(null);
  }
  function removeItem(id: string) {
    setCfg((c) => (c ? { ...c, items: c.items.filter((it) => it.id !== id) } : c));
  }

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: cfg.enabled,
          items: cfg.items.map((it) => ({
            id: it.id,
            title: it.title,
            body: it.body,
            category: it.category,
            url: it.url ?? '',
            imageUrl: it.imageUrl ?? '',
            publishedAt: it.publishedAt,
            pinned: it.pinned === true,
            enabled: it.enabled !== false,
          })),
        }),
      });
      if (r.ok) {
        setCfg(await r.json());
        setMsg({ ok: true, text: t('newsSaved') });
      } else {
        setMsg({ ok: false, text: apiErrText(await r.json().catch(() => null), t) });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cfg)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const catOptions = CATEGORIES.map((c) => ({ label: tn(`cat_${c}`), value: c }));
  const draftTitleOk = draft ? draft.item.title.trim().length > 0 : false;
  const bodyHasText = draft ? draft.item.body.trim().length > 0 : false;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued" variant="bodySm">
        {t('newsHelp')}
      </Text>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      <Card>
        <Checkbox
          label={t('newsEnabled')}
          helpText={t('newsEnabledHint')}
          checked={cfg.enabled}
          onChange={(v) => setCfg((c) => (c ? { ...c, enabled: v } : c))}
        />
      </Card>

      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm">
            {t('newsItems')}
          </Text>
          <Button onClick={openAdd}>{t('newsAdd')}</Button>
        </InlineStack>

        {cfg.items.length === 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {t('newsEmpty')}
          </Text>
        ) : (
          cfg.items.map((it) => (
            <Box key={it.id} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Badge tone={it.category === 'important' ? 'critical' : undefined}>{tn(`cat_${it.category}`)}</Badge>
                  <span style={{ maxWidth: '46ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', fontWeight: 500 }}>
                    {it.title.trim() || t('newsNoTitle')}
                  </span>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {fmtDate(it.publishedAt)}
                  </Text>
                  {it.pinned ? <Badge tone="attention">{t('newsPinned')}</Badge> : null}
                  {it.enabled !== false ? <Badge tone="success">{t('annItemEnabled')}</Badge> : <Badge>{t('annHidden')}</Badge>}
                  {it.imageUrl ? <Badge>{t('newsHasImage')}</Badge> : null}
                  {it.url ? <Badge>link</Badge> : null}
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <Button size="slim" onClick={() => openEdit(it)}>
                    {t('trkEdit')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => removeItem(it.id)}>
                    {t('annRemove')}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Box>
          ))
        )}
      </BlockStack>

      <InlineStack>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t('newsSave')}
        </Button>
      </InlineStack>

      {/* Popup thêm/sửa tin */}
      <Modal
        open={!!draft}
        onClose={closeDraft}
        title={draft ? (draft.isNew ? t('newsAdd') : t('newsEditTitle')) : ''}
        primaryAction={{ content: t('trkApply'), onAction: applyDraft, disabled: !draftTitleOk }}
        secondaryActions={[{ content: t('close'), onAction: closeDraft }]}
      >
        <Modal.Section>
          {draft ? (
            <BlockStack gap="300">
              <InlineStack gap="300" wrap>
                <Checkbox label={t('annItemEnabled')} checked={draft.item.enabled !== false} onChange={(v) => updDraft({ enabled: v })} />
                <Checkbox label={t('newsPinnedLabel')} checked={draft.item.pinned === true} onChange={(v) => updDraft({ pinned: v })} />
              </InlineStack>
              <TextField label={t('newsTitle')} value={draft.item.title} onChange={(v) => updDraft({ title: v })} autoComplete="off" maxLength={200} autoFocus />
              <InlineStack gap="300" wrap>
                <Box minWidth="200px">
                  <Select label={t('newsCategory')} options={catOptions} value={draft.item.category} onChange={(v) => updDraft({ category: v as NewsCategory })} />
                </Box>
                <Box minWidth="200px">
                  <TextField label={t('newsDate')} type="date" value={isoToDate(draft.item.publishedAt)} onChange={(v) => updDraft({ publishedAt: v ? new Date(`${v}T00:00:00.000Z`).toISOString() : todayIso() })} autoComplete="off" />
                </Box>
              </InlineStack>
              <BlockStack gap="150">
                <Text as="span" variant="bodyMd" fontWeight="medium">{t('newsBody')}</Text>
                {/* Thanh định dạng: bọc **đậm**, thêm ## tiêu đề, chèn [chữ](url). */}
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Button size="slim" onClick={() => surround('**', '**', t('newsFmtSample'))}>
                    {t('newsFmtBold')}
                  </Button>
                  <Button size="slim" onClick={heading}>{t('newsFmtHeading')}</Button>
                  <Button size="slim" onClick={openLink}>{t('newsFmtLink')}</Button>
                </InlineStack>
                {linkOpen ? (
                  <InlineStack gap="150" blockAlign="center" wrap>
                    <Box minWidth="260px">
                      <TextField label={t('newsFmtLinkUrl')} labelHidden value={linkUrl} onChange={setLinkUrl} placeholder="https://…" autoComplete="off" autoFocus />
                    </Box>
                    <Button size="slim" variant="primary" onClick={insertLink}>{t('newsFmtInsert')}</Button>
                    <Button size="slim" onClick={() => setLinkOpen(false)}>{t('close')}</Button>
                  </InlineStack>
                ) : null}
                <TextField id={BODY_ID} label={t('newsBody')} labelHidden value={draft.item.body} onChange={(v) => updDraft({ body: v })} autoComplete="off" maxLength={8000} multiline={6} helpText={t('newsBodyHint')} />
                {bodyHasText ? (
                  <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                    <BlockStack gap="150">
                      <Text as="span" variant="bodySm" tone="subdued">{t('newsPreview')}</Text>
                      <div className="newsfeed-detail__body newsfeed-md-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(draft.item.body) }} />
                    </BlockStack>
                  </Box>
                ) : null}
              </BlockStack>
              <TextField label={t('newsImageUrl')} value={draft.item.imageUrl ?? ''} onChange={(v) => updDraft({ imageUrl: v })} autoComplete="off" placeholder="https://…/anh.png" helpText={t('newsImageHint')} />
              <TextField label={t('annItemUrl')} value={draft.item.url ?? ''} onChange={(v) => updDraft({ url: v })} autoComplete="off" placeholder="https://noti.vn/…" helpText={t('annItemUrlHint')} />
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
