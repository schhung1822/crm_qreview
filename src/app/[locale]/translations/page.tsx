'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  InlineGrid,
  InlineStack,
  Link,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TranslateIcon } from '@/components/icons';
import { AiWorking, LocaleTag } from '@/components/ui';
import { localeNames, locales } from '@/i18n/config';

interface Draft {
  id: string;
  title: string;
  locale: string;
  status: 'draft' | 'published';
  translationGroupId?: string;
}

export default function TranslationsPage() {
  const t = useTranslations('translations');
  const locale = useLocale();
  const params = useSearchParams();
  const sourceParam = params.get('source');

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [target, setTarget] = useState('en');
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'critical'; text: string; url?: string } | null>(null);

  // Chọn AI + model để dịch.
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);

  // Chọn nhiều để xóa.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/articles/draft');
    if (res.ok) {
      const d = (await res.json()).articles as Draft[];
      setDrafts(d);
      setSelected((prev) => new Set([...prev].filter((id) => d.some((x) => x.id === id))));
      if (!sourceId) {
        // Ưu tiên ?source= (đến từ nút "Dịch" ở trang Bài viết) nếu hợp lệ.
        const pick = sourceParam && d.some((x) => x.id === sourceParam) ? sourceParam : d[0]?.id;
        if (pick) setSourceId(pick);
      }
    }
  }, [sourceId, sourceParam]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean; enabled: boolean }> }) => {
        setProviders(d.providers);
        setAiReady(d.providers.some((p) => p.hasKey && p.enabled));
      })
      .catch(() => setAiReady(false));
  }, []);

  async function loadModels(provider: string) {
    if (!provider) {
      setAiModels([]);
      return;
    }
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      setAiModels(res.ok && Array.isArray(d.models) ? d.models : []);
    } catch {
      setAiModels([]);
    } finally {
      setModelsBusy(false);
    }
  }

  function selectProvider(v: string) {
    setAiProvider(v);
    setAiModel('');
    void loadModels(v);
  }

  function toggleRow(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(t('deleteConfirm', { n: selected.size }))) return;
    setDeleting(true);
    setNotice(null);
    try {
      const ids = [...selected];
      for (const id of ids) {
        await fetch(`/api/articles/draft?id=${id}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      setNotice({ tone: 'success', text: t('deletedN', { n: ids.length }) });
      await load();
    } finally {
      setDeleting(false);
    }
  }

  async function translate() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/articles/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: sourceId,
          targetLocale: target,
          ...(aiProvider ? { provider: aiProvider } : {}),
          ...(aiProvider && aiModel ? { model: aiModel } : {}),
        }),
      });
      const d = await res.json();
      if (d.needsKey) setNotice({ tone: 'critical', text: t('noKeyBody') });
      else if (d.ok && d.draft) {
        setNotice({ tone: 'success', text: t('translateDone'), url: `/${locale}/editor?draft=${d.draft.id}` });
        await load();
      } else setNotice({ tone: 'critical', text: d.error ?? 'Lỗi dịch' });
    } finally {
      setBusy(false);
    }
  }

  const rows =
    drafts?.map((a) => [
      <Checkbox
        key={`${a.id}-c`}
        label=""
        labelHidden
        checked={selected.has(a.id)}
        onChange={() => toggleRow(a.id)}
      />,
      <Link key={a.id} url={`/${locale}/editor?draft=${a.id}`} removeUnderline>
        <Text as="span" fontWeight="semibold">
          {a.title}
        </Text>
      </Link>,
      <LocaleTag locale={a.locale} key={`${a.id}-l`} />,
      a.translationGroupId ? (
        <Badge tone="info" key={`${a.id}-g`}>
          {t('groupBadge')}
        </Badge>
      ) : (
        <Text as="span" tone="subdued" key={`${a.id}-g`}>
          -
        </Text>
      ),
    ]) ?? [];

  return (
    <Page title={t('title')} subtitle={t('subtitle')} primaryAction={undefined}>
      <BlockStack gap="400">
        <Banner tone="info">{t('explainer')}</Banner>

        {busy ? <AiWorking text={t('translatingAI')} /> : null}

        {aiReady === false ? (
          <Banner tone="warning" title={t('noKeyTitle')} action={{ content: t('goSettings'), url: `/${locale}/settings` }}>
            {t('noKeyBody')}
          </Banner>
        ) : null}

        {notice ? (
          <Banner tone={notice.tone}>
            {notice.text}{' '}
            {notice.url ? <Link url={notice.url}>{t('open')}</Link> : null}
          </Banner>
        ) : null}

        {drafts === null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : drafts.length === 0 ? (
          <Card>
            <BlockStack gap="300" inlineAlign="start">
              <Text as="p" tone="subdued">
                {t('noDrafts')}
              </Text>
              <Button variant="primary" url={`/${locale}/keywords`}>
                {t('goWrite')}
              </Button>
            </BlockStack>
          </Card>
        ) : (
          <>
            <Card>
              <BlockStack gap="300">
                <InlineGrid columns={{ xs: 1, md: '2fr 1fr auto' }} gap="300" alignItems="end">
                  <Select
                    label={t('source')}
                    options={drafts.map((d) => ({
                      label: `${localeNames[d.locale as keyof typeof localeNames]?.flag ?? ''} ${d.title}`,
                      value: d.id,
                    }))}
                    value={sourceId}
                    onChange={setSourceId}
                  />
                  <Select
                    label={t('target')}
                    options={locales.map((l) => ({ label: `${localeNames[l].flag} ${localeNames[l].native}`, value: l }))}
                    value={target}
                    onChange={setTarget}
                  />
                  <Button
                    variant="primary"
                    icon={TranslateIcon}
                    loading={busy}
                    disabled={busy || aiReady === false || !sourceId}
                    onClick={translate}
                  >
                    {busy ? t('translating') : t('translateBtn')}
                  </Button>
                </InlineGrid>

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select
                    label={t('aiProvider')}
                    options={[
                      { label: t('aiAuto'), value: '' },
                      ...providers
                        .filter((p) => p.hasKey)
                        .map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={aiProvider}
                    onChange={selectProvider}
                  />
                  <Select
                    label={t('aiModel')}
                    disabled={!aiProvider || modelsBusy}
                    options={[
                      { label: modelsBusy ? t('aiModelLoading') : t('aiModelDefault'), value: '' },
                      ...aiModels.map((m) => ({ label: m, value: m })),
                    ]}
                    value={aiModel}
                    onChange={setAiModel}
                  />
                </InlineGrid>
              </BlockStack>
            </Card>

            <Card padding="0">
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Checkbox
                      label={t('selectAll')}
                      checked={(drafts?.length ?? 0) > 0 && selected.size === drafts?.length}
                      onChange={() =>
                        setSelected((s) =>
                          s.size === (drafts?.length ?? 0)
                            ? new Set()
                            : new Set((drafts ?? []).map((d) => d.id)),
                        )
                      }
                    />
                    <Text as="h2" variant="headingSm">
                      {t('allArticles')}
                    </Text>
                  </InlineStack>
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
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['', t('colTitle'), t('colLang'), t('hreflang')]}
                rows={rows}
              />
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
