'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { MagicIcon } from '@/components/icons';
import { AiWorking } from '@/components/ui';

interface CitationHit {
  engine: string;
  url: string;
  title?: string;
}
interface CitationRun {
  at: string;
  engines: string[];
  citations: number;
  checks: number;
  perQuery: Array<{ query: string; hits: CitationHit[] }>;
}
interface CitationConfig {
  domain: string;
  queries: string[];
  lastRun?: CitationRun;
  history: Array<{ at: string; citations: number }>;
}
interface ApiData {
  config: CitationConfig;
  engines: { perplexity: boolean };
}

export default function CitationsPage() {
  const t = useTranslations('citations');
  const ta = useTranslations('audit');
  const locale = useLocale();
  const [data, setData] = useState<ApiData | null>(null);
  const [domain, setDomain] = useState('');
  const [queries, setQueries] = useState('');
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Quét bài viết từ CMS → AI đọc keyword → đề xuất câu hỏi GEO (giống chế độ tối ưu bài cũ) ──
  const to = useTranslations('optimize');
  const [conns, setConns] = useState<
    Array<{ id: string; label: string; provider: string; locale: string; baseUrl?: string }> | null
  >(null);
  const [connId, setConnId] = useState('');
  const [scanMode, setScanMode] = useState<'recent' | 'all' | 'time' | 'keyword'>('recent');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [posts, setPosts] = useState<Array<{ id: string; title: string; slug: string; date?: string }> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedPost, setSelectedPost] = useState('');

  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<{ tone: 'success' | 'critical'; text: string } | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  // Nguồn câu hỏi: có dùng "People Also Ask" thật từ DataForSEO không. Chỉ hiện khi đã kết nối.
  const [dfsConfigured, setDfsConfigured] = useState(false);
  const [useDfs, setUseDfs] = useState('on');
  useEffect(() => {
    fetch('/api/dataforseo/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDfsConfigured(Boolean(d?.configured)))
      .catch(() => {});
  }, []);
  const [modelsBusy, setModelsBusy] = useState(false);

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean }> }) => setProviders(d.providers))
      .catch(() => {});
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d: { connections: Array<{ id: string; label: string; provider: string; locale: string; baseUrl?: string }> }) => {
        setConns(d.connections);
        if (d.connections?.[0]) setConnId(d.connections[0].id);
      })
      .catch(() => setConns([]));
  }, []);

  async function loadModels(provider: string) {
    if (!provider || provider === 'none') {
      setAiModels([]);
      return;
    }
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, kind: 'text' }),
      });
      const d = await res.json();
      setAiModels(res.ok && Array.isArray(d.models) ? d.models : []);
    } catch {
      setAiModels([]);
    } finally {
      setModelsBusy(false);
    }
  }
  function selectAiProvider(v: string) {
    setAiProvider(v);
    setAiModel('');
    void loadModels(v);
  }

  // Chọn kết nối → reset danh sách bài + tự điền domain (nếu đang trống) từ baseUrl kết nối.
  function pickConn(v: string) {
    setConnId(v);
    setPosts(null);
    setSelectedPost('');
    const c = conns?.find((x) => x.id === v);
    if (c?.baseUrl && !domain.trim()) {
      try {
        setDomain(new URL(c.baseUrl).host.replace(/^www\./i, ''));
      } catch {
        /* baseUrl lạ → bỏ qua */
      }
    }
  }

  // Quét bài viết từ CMS (giống chế độ tối ưu bài cũ).
  async function scan() {
    if (!connId) return;
    setScanning(true);
    setSuggestMsg(null);
    setPosts(null);
    setSelectedPost('');
    try {
      const p: Record<string, string> = {};
      if (scanMode === 'all') p.mode = 'all';
      if (scanMode === 'time') {
        if (fromDate) p.after = fromDate;
        if (toDate) p.before = toDate;
      }
      if (scanMode === 'keyword' && search.trim()) p.search = search.trim();
      const qs = new URLSearchParams(p);
      const res = await fetch(`/api/connections/${connId}/posts?${qs.toString()}`);
      const d = await res.json();
      if (res.ok && Array.isArray(d.posts)) {
        setPosts(d.posts);
        if (d.posts[0]) setSelectedPost(d.posts[0].id);
      } else {
        setSuggestMsg({ tone: 'critical', text: d.error ?? to('noPosts') });
      }
    } catch {
      setSuggestMsg({ tone: 'critical', text: to('noPosts') });
    } finally {
      setScanning(false);
    }
  }

  // Đọc bài đã chọn → nhận câu hỏi GEO → GỘP vào ô câu hỏi (giữ câu đang có, bỏ trùng).
  async function suggestQuestions() {
    if (!connId || !selectedPost) {
      setSuggestMsg({ tone: 'critical', text: t('suggestNeedPost') });
      return;
    }
    if (aiProvider === 'none') {
      setSuggestMsg({ tone: 'critical', text: t('suggestNeedAi') });
      return;
    }
    setSuggestBusy(true);
    setSuggestMsg(null);
    try {
      const res = await fetch('/api/citations/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connId,
          postId: selectedPost,
          locale,
          aiProvider,
          useDataForSeo: useDfs === 'on',
          ...(aiProvider && aiProvider !== 'none' && aiModel ? { aiModel } : {}),
        }),
      });
      const d = await res.json();
      if (d.needsKey) {
        setSuggestMsg({ tone: 'critical', text: t('suggestNeedAi') });
        return;
      }
      if (!res.ok || !Array.isArray(d.questions)) {
        setSuggestMsg({ tone: 'critical', text: d.error ?? t('suggestError') });
        return;
      }
      const existing = queries
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean);
      const seen = new Set(existing.map((q) => q.toLowerCase()));
      const added: string[] = [];
      for (const q of d.questions as string[]) {
        const k = q.trim().toLowerCase();
        if (q.trim() && !seen.has(k)) {
          seen.add(k);
          added.push(q.trim());
        }
      }
      const merged = [...existing, ...added].slice(0, 20);
      setQueries(merged.join('\n'));
      const realCount = typeof d.realCount === 'number' ? d.realCount : 0;
      setSuggestMsg({
        tone: 'success',
        text:
          realCount > 0
            ? t('suggestAddedReal', { n: added.length, real: realCount })
            : t('suggestAdded', { n: added.length }),
      });
    } catch {
      setSuggestMsg({ tone: 'critical', text: t('suggestError') });
    } finally {
      setSuggestBusy(false);
    }
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/citations');
    if (res.ok) {
      const d: ApiData = await res.json();
      setData(d);
      setDomain(d.config.domain);
      setQueries(d.config.queries.join('\n'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const queryList = queries
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  async function saveConfig() {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/citations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', domain, queries: queryList }),
      });
      const d = await res.json();
      if (res.ok) setData((prev) => (prev ? { ...prev, config: d.config } : prev));
      else setError(d.error ?? 'error');
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    setBusy('run');
    setError(null);
    try {
      await saveConfigSilent();
      const res = await fetch('/api/citations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      const d = await res.json();
      if (res.ok) setData((prev) => (prev ? { ...prev, config: d.config } : prev));
      else setError(d.error ?? 'error');
    } finally {
      setBusy(null);
    }
  }
  // Lưu cấu hình trước khi chạy (để chạy đúng domain/queries vừa nhập).
  async function saveConfigSilent() {
    await fetch('/api/citations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'config', domain, queries: queryList }),
    });
  }

  const engineReady = Boolean(data?.engines.perplexity);
  const lastRun = data?.config.lastRun;

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Banner tone="info">{t('how')}</Banner>

        {data && !engineReady ? (
          <Banner tone="warning" title={t('engineMissingTitle')}>
            <BlockStack gap="200">
              <Text as="p">{t('engineMissing')}</Text>
              <Box>
                <Button url={`/${locale}/settings`}>{t('engineSetup')}</Button>
              </Box>
            </BlockStack>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('configTitle')}
            </Text>
            <TextField
              label={t('domainLabel')}
              value={domain}
              onChange={setDomain}
              autoComplete="off"
              placeholder="example.com"
              helpText={t('domainHelp')}
            />
            {/* Quét bài viết từ CMS (giống chế độ tối ưu bài cũ) → chọn bài + AI → đề xuất câu hỏi GEO. */}
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h3" variant="headingSm">
                    {t('suggestTitle')}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {t('suggestHint')}
                  </Text>
                </BlockStack>

                {conns && conns.length === 0 ? (
                  <Banner
                    tone="warning"
                    title={to('noConnections')}
                    action={{ content: to('goConnections'), url: `/${locale}/settings` }}
                  />
                ) : (
                  <>
                    {/* Chọn site + chế độ quét */}
                    <InlineGrid columns={{ xs: 1, md: '1fr 1fr' }} gap="200">
                      <Select
                        label={to('selectSite')}
                        options={(conns ?? []).map((c) => ({
                          label: `${c.label} · ${c.provider} · ${c.locale}`,
                          value: c.id,
                        }))}
                        value={connId}
                        onChange={pickConn}
                      />
                      <Select
                        label={to('scanMode')}
                        options={[
                          { label: to('scanRecent'), value: 'recent' },
                          { label: to('scanAll'), value: 'all' },
                          { label: to('scanTime'), value: 'time' },
                          { label: to('scanKeyword'), value: 'keyword' },
                        ]}
                        value={scanMode}
                        onChange={(v) => setScanMode(v as typeof scanMode)}
                      />
                    </InlineGrid>
                    {scanMode === 'time' ? (
                      <InlineGrid columns={{ xs: 1, md: 2 }} gap="200">
                        <TextField type="date" label={to('fromDate')} value={fromDate} onChange={setFromDate} autoComplete="off" />
                        <TextField type="date" label={to('toDate')} value={toDate} onChange={setToDate} autoComplete="off" />
                      </InlineGrid>
                    ) : null}
                    {scanMode === 'keyword' ? (
                      <TextField label={to('searchTitle')} value={search} onChange={setSearch} autoComplete="off" />
                    ) : null}
                    {dfsConfigured ? (
                      <Select
                        label={t('dataSource')}
                        helpText={t('dataSourceHint')}
                        options={[
                          { label: t('dataSourceDfs'), value: 'on' },
                          { label: t('dataSourceAi'), value: 'off' },
                        ]}
                        value={useDfs}
                        onChange={setUseDfs}
                      />
                    ) : null}
                    <InlineStack>
                      <Button loading={scanning} disabled={!connId || scanning} onClick={scan}>
                        {scanning ? to('scanning') : to('scan')}
                      </Button>
                    </InlineStack>

                    {scanning ? <AiWorking text={to('scanning')} progress="indeterminate" /> : null}

                    {/* Sau khi quét: chọn bài + AI/model → đề xuất câu hỏi */}
                    {posts ? (
                      posts.length === 0 ? (
                        <Text as="p" tone="subdued" variant="bodySm">
                          {to('noResults')}
                        </Text>
                      ) : (
                        <BlockStack gap="200">
                          <Select
                            label={to('postsFound', { n: posts.length })}
                            options={posts.map((p) => ({ label: p.title || p.slug || p.id, value: p.id }))}
                            value={selectedPost}
                            onChange={setSelectedPost}
                          />
                          <InlineGrid columns={{ xs: 1, md: '1fr 1fr auto' }} gap="200" alignItems="end">
                            <Select
                              label={ta('aiLabel')}
                              options={[
                                { label: ta('aiAuto'), value: '' },
                                { label: ta('aiNone'), value: 'none' },
                                ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                              ]}
                              value={aiProvider}
                              onChange={selectAiProvider}
                            />
                            <Select
                              label={ta('aiModel')}
                              disabled={!aiProvider || aiProvider === 'none' || modelsBusy}
                              options={[
                                { label: modelsBusy ? ta('aiModelLoading') : ta('aiModelDefault'), value: '' },
                                ...aiModels.map((m) => ({ label: m, value: m })),
                              ]}
                              value={aiModel}
                              onChange={setAiModel}
                            />
                            <Button
                              icon={MagicIcon}
                              variant="primary"
                              loading={suggestBusy}
                              disabled={suggestBusy || !selectedPost}
                              onClick={suggestQuestions}
                            >
                              {t('suggestBtn')}
                            </Button>
                          </InlineGrid>
                        </BlockStack>
                      )
                    ) : null}
                  </>
                )}

                {suggestBusy ? <AiWorking text={t('suggestRunning')} progress="indeterminate" /> : null}
                {suggestMsg ? <Banner tone={suggestMsg.tone === 'success' ? 'success' : 'critical'}>{suggestMsg.text}</Banner> : null}
              </BlockStack>
            </Box>

            <TextField
              label={t('queriesLabel')}
              value={queries}
              onChange={setQueries}
              multiline={6}
              autoComplete="off"
              placeholder={t('queriesPlaceholder')}
              helpText={t('queriesHelp', { n: queryList.length })}
            />
            <InlineStack gap="200">
              <Button loading={busy === 'save'} onClick={saveConfig}>
                {t('save')}
              </Button>
              <Button
                variant="primary"
                loading={busy === 'run'}
                disabled={!engineReady || queryList.length === 0 || busy != null}
                onClick={runCheck}
              >
                {t('run')}
              </Button>
            </InlineStack>
            {error ? <Banner tone="critical">{error}</Banner> : null}
          </BlockStack>
        </Card>

        {busy === 'run' ? (
          <Card>
            <AiWorking text={t('running')} progress="indeterminate" />
          </Card>
        ) : lastRun ? (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  {t('resultTitle')}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {t('lastRunAt', { at: new Date(lastRun.at).toLocaleString(locale) })}
                </Text>
              </InlineStack>
              <Text as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  {t('summary', { c: lastRun.citations, m: lastRun.checks })}
                </Text>
              </Text>
              <DataTable
                columnContentTypes={['text', 'text', 'text']}
                headings={[t('colQuery'), t('colStatus'), t('colSource')]}
                rows={lastRun.perQuery.map((q) => [
                  q.query,
                  q.hits.length ? (
                    <Badge key="s" tone="success">
                      {t('cited')}
                    </Badge>
                  ) : (
                    <Badge key="s">{t('notCited')}</Badge>
                  ),
                  q.hits.length ? (
                    <BlockStack key="u" gap="050">
                      {q.hits.map((h, i) => (
                        <a
                          key={i}
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--p-color-text-link)', textDecoration: 'none', wordBreak: 'break-all' }}
                        >
                          {h.url}
                        </a>
                      ))}
                    </BlockStack>
                  ) : (
                    '-'
                  ),
                ])}
              />
            </BlockStack>
          </Card>
        ) : data ? (
          <Card>
            <Box padding="200">
              <Text as="p" tone="subdued">
                {t('noRun')}
              </Text>
            </Box>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
