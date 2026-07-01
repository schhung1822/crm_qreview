'use client';

import {
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineStack,
  Link,
  Page,
  ProgressBar,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { SetupChecklist } from '@/components/SetupChecklist';
import { TokenChart, type SeriesDay } from '@/components/TokenChart';
import { LocaleTag, MetricRow, StatTile, StatusBadge } from '@/components/ui';
import { localeNames } from '@/i18n/config';
import { getConnections, getProject } from '@/lib/data';
import { currencyCode, formatLocal, formatUsd, rateFor, rateLine } from '@/lib/i18n/currency';

interface RealArticle {
  id: string;
  title: string;
  locale: string;
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  status: 'draft' | 'published';
}

interface UsageRow {
  provider: string;
  model: string;
  inTokens: number;
  outTokens: number;
  calls: number;
  costUsd: number | null;
}
interface UsageReport {
  rows: UsageRow[];
  totals: { inTokens: number; outTokens: number; calls: number };
  totalCostUsd: number;
  fx?: { rates: Record<string, number>; asOf: string };
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
  deepseek: 'DeepSeek',
};

// Chi phí: USD gốc + phần quy đổi (in ĐỎ cho dễ nhìn). Locale USD thì chỉ hiện $.
function CostValue({
  usd,
  locale,
  rates,
}: {
  usd: number;
  locale: string;
  rates?: Record<string, number>;
}) {
  if (currencyCode(locale) === 'USD') return <>{formatUsd(usd)}</>;
  return (
    <>
      {formatUsd(usd)}{' '}
      <Text as="span" tone="critical">
        ≈ {formatLocal(usd, locale, rateFor(locale, rates))}
      </Text>
    </>
  );
}

export default function DashboardPage() {
  const t = useTranslations();
  const locale = useLocale();
  const project = getProject();
  const sites = getConnections().length;

  const [articles, setArticles] = useState<RealArticle[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [resetting, setResetting] = useState(false);
  // Sắp xếp bảng Sử dụng AI: mặc định cột AI A→Z.
  const [sortIdx, setSortIdx] = useState(0);
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('ascending');
  // Lượt AI trích dẫn THẬT (từ /api/citations).
  const [cite, setCite] = useState<{ value: string; delta?: string }>({ value: '-' });
  // Số liệu THẬT (bài đăng + điểm TB) từ /api/reports.
  const [stats, setStats] = useState<{
    published: number;
    avgSeo: number;
    avgAeo: number;
    avgGeo: number;
  } | null>(null);
  // Phủ nội dung theo ngôn ngữ - THẬT (từ /api/reports).
  const [coverage, setCoverage] = useState<Array<{ locale: string; count: number; pct: number }>>([]);
  // Biểu đồ token: bộ lọc thời gian (mặc định 7 ngày gần nhất).
  const [chartRange, setChartRange] = useState('7');
  const [chartFrom, setChartFrom] = useState(() =>
    new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
  );
  const [chartTo, setChartTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [chartSeries, setChartSeries] = useState<SeriesDay[]>([]);

  const loadArticles = useCallback(() => {
    fetch('/api/articles/draft')
      .then((r) => r.json())
      .then((d: { articles?: RealArticle[] }) => setArticles(d.articles ?? []))
      .catch(() => setArticles([]));
  }, []);
  const loadUsage = useCallback(() => {
    fetch('/api/ai-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UsageReport | null) => setUsage(d))
      .catch(() => setUsage(null));
  }, []);
  const loadCitations = useCallback(() => {
    fetch('/api/citations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { config?: { lastRun?: { citations: number }; history?: Array<{ citations: number }> } } | null) => {
        const last = d?.config?.lastRun?.citations;
        if (last == null) {
          setCite({ value: '-' });
          return;
        }
        const h = d?.config?.history ?? [];
        const diff = h.length >= 2 ? h[h.length - 1].citations - h[h.length - 2].citations : 0;
        setCite({ value: String(last), delta: diff > 0 ? String(diff) : undefined });
      })
      .catch(() => setCite({ value: '-' }));
  }, []);
  const loadStats = useCallback(() => {
    fetch('/api/reports?range=all')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            totals?: { published: number; avgSeo: number; avgAeo: number; avgGeo: number };
            coverage?: Array<{ locale: string; count: number; pct: number }>;
          } | null,
        ) => {
          if (d?.totals) setStats(d.totals);
          if (d?.coverage) setCoverage(d.coverage);
        },
      )
      .catch(() => setStats(null));
  }, []);
  const loadChart = useCallback(() => {
    let url = '/api/ai-usage/series?';
    if (chartRange === 'custom') {
      if (!chartFrom || !chartTo) return;
      url += `from=${chartFrom}&to=${chartTo}`;
    } else {
      url += `range=${chartRange}`;
    }
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { series?: SeriesDay[] } | null) => setChartSeries(d?.series ?? []))
      .catch(() => setChartSeries([]));
  }, [chartRange, chartFrom, chartTo]);
  useEffect(() => {
    loadArticles();
    loadUsage();
    loadCitations();
    loadStats();
  }, [loadArticles, loadUsage, loadCitations, loadStats]);
  useEffect(() => {
    loadChart();
  }, [loadChart]);

  async function resetUsage() {
    if (!window.confirm(t('dashboard.resetUsageConfirm'))) return;
    setResetting(true);
    try {
      await fetch('/api/ai-usage', { method: 'DELETE' });
      loadUsage();
    } finally {
      setResetting(false);
    }
  }

  async function removeArticle(id: string) {
    if (!window.confirm(t('common.confirmDeleteArticle'))) return;
    setDeleting(id);
    try {
      await fetch(`/api/articles/draft?id=${id}`, { method: 'DELETE' });
      loadArticles();
    } finally {
      setDeleting(null);
    }
  }

  const rows = (articles ?? []).slice(0, 8).map((a) => [
    <Link key={a.id} url={`/${locale}/editor?draft=${a.id}`} removeUnderline>
      <Text as="span" fontWeight="semibold">
        {a.title}
      </Text>
    </Link>,
    <LocaleTag locale={a.locale} key={`${a.id}-l`} />,
    a.seoScore,
    a.aeoScore ?? 0,
    a.geoScore,
    <StatusBadge status={a.status} label={t(`common.${a.status}`)} key={`${a.id}-s`} />,
    <Button
      key={`${a.id}-d`}
      size="micro"
      variant="tertiary"
      tone="critical"
      loading={deleting === a.id}
      onClick={() => removeArticle(a.id)}
    >
      {t('common.delete')}
    </Button>,
  ]);

  return (
    <Page
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle', {
        locales: project.supportedLocales.length,
        sites,
      })}
      primaryAction={{
        content: t('dashboard.newArticle'),
        icon: PlusIcon,
        url: `/${locale}/editor`,
      }}
      secondaryActions={[{ content: t('dashboard.importOld'), url: `/${locale}/optimize` }]}
    >
      <BlockStack gap="400">
        <SetupChecklist />
        <MetricRow
          items={[
            { label: t('dashboard.statSeo'), value: stats ? String(stats.avgSeo) : '-' },
            { label: t('dashboard.statAeo'), value: stats ? String(stats.avgAeo) : '-' },
            { label: t('dashboard.statGeo'), value: stats ? String(stats.avgGeo) : '-' },
            { label: t('dashboard.statCitations'), value: cite.value, delta: cite.delta },
          ]}
        />

        <Card padding="0">
          <Box padding="400" paddingBlockEnd="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text as="h2" variant="headingSm">
                {t('dashboard.aiUsageTitle')}
              </Text>
              {usage && usage.rows.length ? (
                <Button size="slim" variant="tertiary" loading={resetting} onClick={resetUsage}>
                  {t('dashboard.resetUsage')}
                </Button>
              ) : null}
            </InlineStack>
          </Box>

          <Box paddingInline="400" paddingBlockEnd="400">
            <InlineStack gap="400" wrap blockAlign="stretch">
              <div style={{ flex: '1 1 160px', minWidth: 150 }}>
                <StatTile
                  label={t('dashboard.tokenIn')}
                  value={(usage?.totals.inTokens ?? 0).toLocaleString(locale)}
                />
              </div>
              <div style={{ flex: '1 1 160px', minWidth: 150 }}>
                <StatTile
                  label={t('dashboard.tokenOut')}
                  value={(usage?.totals.outTokens ?? 0).toLocaleString(locale)}
                />
              </div>
              {/* Tổng chi phí chiếm 2 cột → rộng hơn. USD gốc + quy đổi CÙNG HÀNG, cùng cỡ chữ. */}
              <div style={{ flex: '2 1 340px', minWidth: 260 }}>
                <Card>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t('dashboard.totalCost')}
                  </Text>
                  <div style={{ marginTop: 6 }}>
                    <Text as="p" variant="headingXl">
                      {formatUsd(usage?.totalCostUsd ?? 0)}
                      {currencyCode(locale) !== 'USD' ? (
                        <Text as="span" variant="headingXl" tone="critical">
                          {' '}
                          ≈ {formatLocal(usage?.totalCostUsd ?? 0, locale, rateFor(locale, usage?.fx?.rates))}
                        </Text>
                      ) : null}
                    </Text>
                  </div>
                </Card>
              </div>
            </InlineStack>
          </Box>

          {usage && usage.rows.length ? (
            <DataTable
              columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
              headings={[
                t('dashboard.colAi'),
                t('dashboard.colModel'),
                t('dashboard.tokenIn'),
                t('dashboard.tokenOut'),
                t('dashboard.estCost'),
              ]}
              sortable={[true, false, true, true, false]}
              defaultSortDirection="ascending"
              initialSortColumnIndex={0}
              onSort={(index, direction) => {
                setSortIdx(index);
                setSortDir(direction === 'descending' ? 'descending' : 'ascending');
              }}
              rows={[...usage.rows]
                .sort((a, b) => {
                  let cmp = 0;
                  if (sortIdx === 2) cmp = a.inTokens - b.inTokens;
                  else if (sortIdx === 3) cmp = a.outTokens - b.outTokens;
                  else
                    cmp = (PROVIDER_LABEL[a.provider] ?? a.provider).localeCompare(
                      PROVIDER_LABEL[b.provider] ?? b.provider,
                    );
                  return sortDir === 'ascending' ? cmp : -cmp;
                })
                .map((r) => [
                  PROVIDER_LABEL[r.provider] ?? r.provider,
                  r.model,
                  r.inTokens.toLocaleString(locale),
                  r.outTokens.toLocaleString(locale),
                  r.costUsd == null ? (
                    '-'
                  ) : (
                    <CostValue usd={r.costUsd} locale={locale} rates={usage.fx?.rates} />
                  ),
                ])}
            />
          ) : (
            <Box paddingInline="400" paddingBlockEnd="400">
              <Text as="p" tone="subdued" variant="bodySm">
                {t('dashboard.noUsage')}
              </Text>
            </Box>
          )}

          <Box paddingInline="400" paddingBlockEnd="400">
            <BlockStack gap="100">
              {rateLine(locale, usage?.fx?.rates) ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  {rateLine(locale, usage?.fx?.rates)}
                  {usage?.fx?.asOf ? ` · ${usage.fx.asOf}` : ''}
                </Text>
              ) : null}
              <Text as="p" tone="subdued" variant="bodySm">
                {t('dashboard.usageNote')}
              </Text>
            </BlockStack>
          </Box>
        </Card>

        {/* Biểu đồ token theo thời gian + đường xu hướng (dưới phần Sử dụng AI) */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="end" wrap gap="300">
              <Text as="h2" variant="headingSm">
                {t('dashboard.usageChartTitle')}
              </Text>
              <InlineStack gap="200" blockAlign="end" wrap>
                <div style={{ minWidth: 150 }}>
                  <Select
                    label={t('dashboard.range')}
                    labelHidden
                    value={chartRange}
                    onChange={setChartRange}
                    options={[
                      { label: t('dashboard.range7'), value: '7' },
                      { label: t('dashboard.range30'), value: '30' },
                      { label: t('dashboard.range60'), value: '60' },
                      { label: t('dashboard.rangeAll'), value: 'all' },
                      { label: t('dashboard.rangeCustom'), value: 'custom' },
                    ]}
                  />
                </div>
                {chartRange === 'custom' ? (
                  <>
                    <div style={{ minWidth: 140 }}>
                      <TextField
                        type="date"
                        label={t('dashboard.from')}
                        labelHidden
                        value={chartFrom}
                        onChange={setChartFrom}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ minWidth: 140 }}>
                      <TextField
                        type="date"
                        label={t('dashboard.to')}
                        labelHidden
                        value={chartTo}
                        onChange={setChartTo}
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : null}
              </InlineStack>
            </InlineStack>
            <TokenChart
              series={chartSeries}
              locale={locale}
              labels={{
                tokenIn: t('dashboard.tokenIn'),
                tokenOut: t('dashboard.tokenOut'),
                trend: t('dashboard.trend'),
                empty: t('dashboard.noUsage'),
              }}
            />
          </BlockStack>
        </Card>

        <InlineStack gap="400" align="start" blockAlign="start" wrap>
          <div style={{ flex: '2 1 420px', minWidth: 240 }}>
            <Card padding="0">
              <Box padding="400">
                <Text as="h2" variant="headingSm">
                  {t('dashboard.recent')}
                </Text>
              </Box>
              {rows.length ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'text', 'text']}
                  headings={[
                    t('keywords.colKeyword'),
                    t('common.language'),
                    t('common.seo'),
                    t('common.aeo'),
                    t('common.geo'),
                    t('common.status'),
                    '',
                  ]}
                  rows={rows}
                />
              ) : (
                <Box padding="400">
                  <BlockStack gap="200" inlineAlign="start">
                    <Text as="p" tone="subdued">
                      {t('dashboard.noArticles')}
                    </Text>
                    <Button variant="primary" url={`/${locale}/keywords`}>
                      {t('plan.goKeywords')}
                    </Button>
                  </BlockStack>
                </Box>
              )}
            </Card>
          </div>

          <div style={{ flex: '1 1 280px', minWidth: 240 }}>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {t('dashboard.coverage')}
                </Text>
                {coverage.length === 0 ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    {t('dashboard.noCoverage')}
                  </Text>
                ) : (
                  [...coverage]
                    .sort((a, b) => b.pct - a.pct)
                    .map((c) => (
                      <BlockStack gap="100" key={c.locale}>
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span">
                            <span className="flag">{flagOf(c.locale)}</span>{' '}
                            {localeNames[c.locale as keyof typeof localeNames]?.native ?? c.locale}{' '}
                            <Text as="span" tone="subdued" variant="bodySm">
                              ({c.count})
                            </Text>
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {c.pct}%
                          </Text>
                        </InlineStack>
                        <ProgressBar progress={c.pct} size="small" />
                      </BlockStack>
                    ))
                )}
                <div>
                  <Button variant="tertiary" url={`/${locale}/translations`}>
                    {t('dashboard.viewAll')}
                  </Button>
                </div>
              </BlockStack>
            </Card>
          </div>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

function flagOf(locale: string): string {
  const map: Record<string, string> = {
    vi: '🇻🇳', en: '🇬🇧', zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷',
    fr: '🇫🇷', de: '🇩🇪', id: '🇮🇩', hi: '🇮🇳', th: '🇹🇭',
  };
  return map[locale] ?? '🏳️';
}
