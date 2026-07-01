'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineStack,
  Page,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
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
  const locale = useLocale();
  const [data, setData] = useState<ApiData | null>(null);
  const [domain, setDomain] = useState('');
  const [queries, setQueries] = useState('');
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <AiWorking text={t('running')} />
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
                          style={{ color: 'var(--p-color-text-link)', textDecoration: 'none' }}
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
