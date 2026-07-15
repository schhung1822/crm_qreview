'use client';

// Đích đăng "Google Sheet" ở trang Đăng bài: cấu hình sheet đích (tạo mới / dùng sẵn) rồi upsert 1
// dòng theo slug. Mượn OAuth Google Drive per-biz. Nội dung do trang cha truyền vào (article).
import { Badge, Banner, BlockStack, Button, Card, ChoiceList, InlineStack, Spinner, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ExtLink } from '@/components/ui';

export interface SheetArticle {
  articleId?: string;
  title: string;
  slug: string;
  metaDescription: string;
  markdown: string;
  targetKeyword: string;
  tags: string; // chuỗi phân tách bằng dấu phẩy
  categories: string[];
  coverImageUrl: string;
  locale: string;
  hasContent: boolean;
}

interface Target {
  spreadsheetId: string;
  spreadsheetUrl: string;
  tab: string;
}
interface Info {
  driveConnected: boolean;
  driveConfigured: boolean;
  driveEmail?: string;
  target: Target | null;
  columns: string[];
}

export function SheetPublishPanel({ article, settingsHref }: { article: SheetArticle; settingsHref: string }) {
  const t = useTranslations();
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [newTitle, setNewTitle] = useState('');
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/sheets/target');
    if (r.ok) setInfo(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function errMsg(code?: string, fallback?: string): string {
    const map: Record<string, string> = {
      'drive-not-connected': 'sheet.errDriveNotConnected',
      forbidden: 'sheet.errForbidden',
      'not-found': 'sheet.errNotFound',
      noTarget: 'sheet.errNoTarget',
      noSlug: 'sheet.errNoSlug',
      rate: 'sheet.errRate',
    };
    const key = code ? map[code] : undefined;
    return key ? t(key) : fallback || t('sheet.errApi');
  }

  async function setupTarget() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/sheets/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'create' ? { mode, title: newTitle } : { mode, spreadsheet: existing }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setResult({ ok: true, msg: t('sheet.setupSaved') });
        await load();
      } else {
        setResult({ ok: false, msg: errMsg(d?.code, d?.error) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeTarget() {
    setBusy(true);
    try {
      await fetch('/api/sheets/target', { method: 'DELETE' });
      setResult(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setResult(null);
    try {
      const tagArr = article.tags.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch('/api/publish/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: article.articleId || undefined,
          title: article.title,
          slug: article.slug,
          metaDescription: article.metaDescription,
          markdown: article.markdown,
          targetKeyword: article.targetKeyword,
          tags: tagArr,
          categories: article.categories,
          coverImageUrl: article.coverImageUrl,
          locale: article.locale,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        const msg = d.action === 'created' ? t('sheet.resultCreated') : t('sheet.resultUpdated');
        setResult({ ok: true, msg, url: d.spreadsheetUrl });
      } else {
        setResult({ ok: false, msg: errMsg(d?.code, d?.error) });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <Card>
        <BlockStack gap="200" inlineAlign="center">
          <Spinner size="small" />
        </BlockStack>
      </Card>
    );
  }

  // Chưa cấu hình / chưa kết nối Drive → hướng dẫn sang Cài đặt.
  if (!info.driveConfigured || !info.driveConnected) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">{t('sheet.title')}</Text>
          <Banner
            tone="warning"
            title={info.driveConfigured ? t('sheet.driveNotConnected') : t('sheet.driveNotConfigured')}
            action={{ content: t('sheet.driveManage'), url: settingsHref }}
          >
            <Text as="p" variant="bodySm">{t('sheet.reconnectHint')}</Text>
          </Banner>
        </BlockStack>
      </Card>
    );
  }

  const resultBanner = result ? (
    <Banner tone={result.ok ? 'success' : 'critical'}>
      {result.msg} {result.url ? <ExtLink href={result.url}>{t('sheet.openSheet')}</ExtLink> : null}
    </Banner>
  ) : null;

  // Chưa có sheet đích → form tạo mới / dùng sẵn.
  if (!info.target) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">{t('sheet.setupTitle')}</Text>
          {resultBanner}
          <ChoiceList
            title=""
            titleHidden
            choices={[
              { label: t('sheet.modeCreate'), value: 'create' },
              { label: t('sheet.modeExisting'), value: 'existing' },
            ]}
            selected={[mode]}
            onChange={(v) => setMode((v[0] as 'create' | 'existing') ?? 'create')}
          />
          {mode === 'create' ? (
            <TextField label={t('sheet.newTitle')} value={newTitle} onChange={setNewTitle} autoComplete="off" placeholder="SEO-GEO Articles" />
          ) : (
            <TextField label={t('sheet.existingUrl')} value={existing} onChange={setExisting} autoComplete="off" placeholder="https://docs.google.com/spreadsheets/d/…" helpText={t('sheet.existingHint')} />
          )}
          <InlineStack>
            <Button variant="primary" loading={busy} disabled={mode === 'existing' && !existing.trim()} onClick={() => void setupTarget()}>
              {mode === 'create' ? t('sheet.createBtn') : t('sheet.useBtn')}
            </Button>
          </InlineStack>
          <Text as="p" tone="subdued" variant="bodySm">{t('sheet.columnsHint')}</Text>
          <InlineStack gap="100" wrap>
            {info.columns.map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  // Đã có sheet đích → nút đăng.
  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">{t('sheet.title')}</Text>
          {resultBanner}
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">{t('sheet.targetLabel')}</Text>
            <InlineStack gap="200" blockAlign="center" wrap>
              <ExtLink href={info.target.spreadsheetUrl}>{t('sheet.openSheet')}</ExtLink>
              <Badge>{info.target.tab}</Badge>
              <Button variant="plain" onClick={() => void changeTarget()} disabled={busy}>
                {t('sheet.changeTarget')}
              </Button>
            </InlineStack>
          </BlockStack>
          <Text as="p" tone="subdued" variant="bodySm">{t('sheet.upsertHint')}</Text>
        </BlockStack>
      </Card>
      <Button variant="primary" fullWidth size="large" loading={busy} disabled={!article.hasContent || !article.slug.trim()} onClick={() => void publish()}>
        {t('sheet.publishBtn')}
      </Button>
    </BlockStack>
  );
}
