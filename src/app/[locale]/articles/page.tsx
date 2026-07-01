'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExtLink, LocaleTag } from '@/components/ui';

interface Article {
  id: string;
  title: string;
  locale: string;
  status: 'draft' | 'published';
  updatedAt: string;
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  targetKeyword?: string;
  publishedUrl?: string;
  translationGroupId?: string;
}

export default function ArticlesPage() {
  const t = useTranslations('articles');
  const locale = useLocale();

  const [items, setItems] = useState<Article[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const [status, setStatus] = useState<'all' | 'draft' | 'published'>('all');
  const [time, setTime] = useState<'all' | '7' | '30' | '90'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/articles/draft');
    if (res.ok) {
      const all = ((await res.json()).articles as Article[]) ?? [];
      setItems(all);
      setSelected((prev) => new Set([...prev].filter((id) => all.some((x) => x.id === id))));
    } else {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const now = Date.now();
    const days = time === 'all' ? 0 : Number(time);
    const cutoff = days ? now - days * 86400_000 : 0;
    const kw = q.trim().toLowerCase();
    return items.filter((a) => {
      if (status !== 'all' && a.status !== status) return false;
      if (cutoff && new Date(a.updatedAt).getTime() < cutoff) return false;
      if (kw && !`${a.title} ${a.targetKeyword ?? ''}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [items, status, time, q]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) =>
      s.size === filtered.length ? new Set() : new Set(filtered.map((a) => a.id)),
    );
  }

  async function deleteSelected() {
    if (selected.size === 0 || !confirm(t('deleteConfirm', { n: selected.size }))) return;
    setDeleting(true);
    try {
      for (const id of selected) await fetch(`/api/articles/draft?id=${id}`, { method: 'DELETE' });
      setSelected(new Set());
      await load();
    } finally {
      setDeleting(false);
    }
  }

  const allChecked = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  // Độ phủ bản dịch: gom các bài theo translationGroupId → tập locale của mỗi nhóm.
  const groupLocales = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of items ?? []) {
      if (!a.translationGroupId) continue;
      const set = map.get(a.translationGroupId) ?? new Set<string>();
      set.add(a.locale);
      map.set(a.translationGroupId, set);
    }
    return map;
  }, [items]);

  const rows = filtered.map((a) => [
    <Checkbox key={`${a.id}-c`} label="" labelHidden checked={selected.has(a.id)} onChange={() => toggle(a.id)} />,
    <Button key={`${a.id}-e`} variant="plain" url={`/${locale}/editor?draft=${a.id}&from=articles`}>
      {a.title || '(không tiêu đề)'}
    </Button>,
    <LocaleTag locale={a.locale} key={`${a.id}-l`} />,
    (() => {
      // Các locale KHÁC đã có bản dịch trong cùng nhóm (không tính locale của chính bài).
      const siblings = a.translationGroupId
        ? [...(groupLocales.get(a.translationGroupId) ?? [])].filter((l) => l !== a.locale).sort()
        : [];
      return siblings.length ? (
        <InlineStack key={`${a.id}-tr`} gap="100" wrap>
          {siblings.map((l) => (
            <LocaleTag locale={l} key={`${a.id}-tr-${l}`} />
          ))}
        </InlineStack>
      ) : (
        <Text as="span" tone="subdued" key={`${a.id}-tr`}>
          -
        </Text>
      );
    })(),
    <Badge key={`${a.id}-s`} tone={a.status === 'published' ? 'success' : undefined}>
      {a.status === 'published' ? t('statusPublished') : t('statusDraft')}
    </Badge>,
    `${a.seoScore} / ${a.aeoScore ?? 0} / ${a.geoScore}`,
    new Date(a.updatedAt).toLocaleDateString(),
    <InlineStack key={`${a.id}-act`} gap="200" wrap={false}>
      {a.status === 'published' && a.publishedUrl ? (
        <ExtLink key={`${a.id}-v`} href={a.publishedUrl}>
          {t('edit')}
        </ExtLink>
      ) : (
        <Button key={`${a.id}-b`} size="slim" url={`/${locale}/editor?draft=${a.id}&from=articles`}>
          {t('edit')}
        </Button>
      )}
      <Button
        key={`${a.id}-t`}
        size="slim"
        variant="plain"
        url={`/${locale}/translations?source=${a.id}`}
      >
        {t('translate')}
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: t('write'), url: `/${locale}/editor` }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            {/* Mobile: 2 select ngắn cùng 1 hàng; ô tìm kiếm full width bên dưới */}
            <InlineGrid columns={{ xs: 2, sm: '1fr 1fr' }} gap="300">
              <Select
                label={t('filterStatus')}
                options={[
                  { label: t('filterAll'), value: 'all' },
                  { label: t('statusDraft'), value: 'draft' },
                  { label: t('statusPublished'), value: 'published' },
                ]}
                value={status}
                onChange={(v) => setStatus(v as 'all' | 'draft' | 'published')}
              />
              <Select
                label={t('filterTime')}
                options={[
                  { label: t('timeAll'), value: 'all' },
                  { label: t('time7'), value: '7' },
                  { label: t('time30'), value: '30' },
                  { label: t('time90'), value: '90' },
                ]}
                value={time}
                onChange={(v) => setTime(v as 'all' | '7' | '30' | '90')}
              />
            </InlineGrid>
            <TextField
              label={t('searchKeyword')}
              value={q}
              onChange={setQ}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setQ('')}
            />
          </BlockStack>
        </Card>

        {items === null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : items.length === 0 ? (
          <Card>
            <Text as="p" tone="subdued">
              {t('empty')}
            </Text>
          </Card>
        ) : (
          <Card padding="0">
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <Checkbox label={t('selectAll')} checked={allChecked} onChange={toggleAll} />
                <Button
                  tone="critical"
                  variant="primary"
                  disabled={selected.size === 0}
                  loading={deleting}
                  onClick={deleteSelected}
                >
                  {t('deleteSelected', { n: selected.size })}
                </Button>
              </InlineStack>
            </Box>
            {filtered.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued">
                  {t('noResults')}
                </Text>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
                headings={[
                  '',
                  t('colTitle'),
                  t('colLang'),
                  t('colTranslations'),
                  t('colStatus'),
                  'SEO / AEO / GEO',
                  t('colUpdated'),
                  '',
                ]}
                rows={rows}
              />
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
