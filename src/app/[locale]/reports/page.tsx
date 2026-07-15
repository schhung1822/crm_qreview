'use client';

import {
  Badge,
  BlockStack,
  Box,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LocaleTag, StatTile } from '@/components/ui';

interface ReportData {
  range: string;
  totals: {
    articles: number;
    published: number;
    drafts: number;
    avgSeo: number;
    avgAeo: number;
    avgGeo: number;
    keywordSets: number;
    plans: number;
  };
  byLocale: Array<{ locale: string; count: number }>;
  series: Array<{ date: string; count: number; published: number }>;
  top: Array<{ id: string; title: string; locale: string; seoScore: number; aeoScore: number; geoScore: number; status: string }>;
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const [range, setRange] = useState('30');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?range=${range}`)
      .then((r) => r.json())
      .then((d: ReportData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [range]);

  function exportCsv() {
    if (!data) return;
    const header = 'date,updated,published\n';
    const body = data.series.map((s) => `${s.date},${s.count},${s.published}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rangeSelect = (
    <Select
      label={t('range')}
      labelInline
      options={[
        { label: t('range7'), value: '7' },
        { label: t('range30'), value: '30' },
        { label: t('range90'), value: '90' },
        { label: t('rangeAll'), value: 'all' },
      ]}
      value={range}
      onChange={setRange}
    />
  );

  const topRows =
    data?.top.map((a) => [
      <Text as="span" fontWeight="semibold" key={a.id}>
        {a.title}
      </Text>,
      <LocaleTag locale={a.locale} key={`${a.id}-l`} />,
      String(a.seoScore),
      String(a.aeoScore ?? 0),
      String(a.geoScore),
      <Badge key={`${a.id}-s`} tone={a.status === 'published' ? 'success' : undefined}>
        {a.status === 'published' ? t('published') : t('drafts')}
      </Badge>,
    ]) ?? [];

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      secondaryActions={[{ content: t('exportCsv'), onAction: exportCsv, disabled: !data }]}
    >
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <Box>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('note')}
              </Text>
            </Box>
            {rangeSelect}
          </InlineStack>
        </Card>

        {loading ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : !data ? (
          <Card>
            <Text as="p" tone="subdued">
              {t('empty')}
            </Text>
          </Card>
        ) : (
          <>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              <StatTile label={t('totalArticles')} value={String(data.totals.articles)} />
              <StatTile label={t('published')} value={String(data.totals.published)} />
              <StatTile label={t('avgSeo')} value={String(data.totals.avgSeo)} />
              <StatTile label={t('avgAeo')} value={String(data.totals.avgAeo)} />
              <StatTile label={t('avgGeo')} value={String(data.totals.avgGeo)} />
            </InlineGrid>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              <StatTile label={t('drafts')} value={String(data.totals.drafts)} />
              <StatTile label={t('keywordSets')} value={String(data.totals.keywordSets)} />
              <StatTile label={t('plans')} value={String(data.totals.plans)} />
              <StatTile label={`${t('published')} %`} value={`${pct(data.totals.published, data.totals.articles)}%`} />
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('activityTitle')}
                  </Text>
                  <ActivityChart series={data.series} />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('byLocaleTitle')}
                  </Text>
                  {data.byLocale.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('empty')}
                    </Text>
                  ) : (
                    data.byLocale.map((l) => (
                      <InlineStack key={l.locale} align="space-between" blockAlign="center">
                        <LocaleTag locale={l.locale} />
                        <Box width="60%">
                          <div style={{ background: '#eef0f2', borderRadius: 6, height: 10 }}>
                            <div
                              style={{
                                width: `${pct(l.count, data.byLocale[0].count)}%`,
                                background: '#5b3ce0',
                                height: 10,
                                borderRadius: 6,
                              }}
                            />
                          </div>
                        </Box>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {l.count}
                        </Text>
                      </InlineStack>
                    ))
                  )}
                </BlockStack>
              </Card>
            </InlineGrid>

            <Card padding="0">
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <Text as="h2" variant="headingSm">
                  {t('topTitle')}
                </Text>
              </Box>
              {topRows.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    {t('empty')}
                  </Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'text']}
                  headings={[t('colTitle'), tc('language'), t('colSeo'), t('colAeo'), t('colGeo'), t('colStatus')]}
                  rows={topRows}
                />
              )}
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  );
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

// Biểu đồ cột đơn giản (SVG) từ chuỗi ngày thật. Cột nhạt = cập nhật, cột đậm = đã đăng.
function ActivityChart({ series }: { series: Array<{ date: string; count: number; published: number }> }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const w = 320;
  const h = 120;
  const bw = w / Math.max(1, series.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 130 }}>
      {series.map((s, i) => {
        const bh = (s.count / max) * (h - 16);
        const ph = (s.published / max) * (h - 16);
        return (
          <g key={s.date}>
            <rect x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} fill="#c9d2f0" rx={1} />
            <rect x={i * bw + 1} y={h - ph} width={Math.max(1, bw - 2)} height={ph} fill="#5b3ce0" rx={1} />
          </g>
        );
      })}
    </svg>
  );
}
