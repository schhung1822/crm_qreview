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
import { ProviderLogo } from '@/components/provider-logos';
import { StatTile } from '@/components/ui';
import type { SocialProvider } from '@/lib/connection-providers';
import type { SocialMediaType } from '@/lib/social-publishing';

type SocialStatus = 'published' | 'processing' | 'failed';

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
  series: Array<{ date: string; count: number; published: number }>;
  top: Array<{ id: string; title: string; seoScore: number; aeoScore: number; geoScore: number; status: string }>;
  social: {
    totals: {
      attempts: number;
      uniquePosts: number;
      published: number;
      processing: number;
      failed: number;
      successRate: number;
    };
    series: Array<{ date: string; total: number; published: number; failed: number }>;
    byProvider: Array<{ provider: SocialProvider; total: number; published: number; processing: number; failed: number }>;
    byMediaType: Array<{ mediaType: SocialMediaType; total: number }>;
    recent: Array<{
      id: string;
      provider: SocialProvider;
      connectionLabel: string;
      title?: string;
      text: string;
      mediaType: SocialMediaType;
      status: SocialStatus;
      publishedUrl?: string;
      createdAt: string;
    }>;
  };
}

const PROVIDER_LABEL: Record<SocialProvider, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  threads: 'Threads',
  youtube: 'YouTube',
};

const MEDIA_LABEL: Record<SocialMediaType, string> = {
  text: 'Bài viết',
  image: 'Hình ảnh',
  video: 'Video',
};

const STATUS_LABEL: Record<SocialStatus, string> = {
  published: 'Đã đăng',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
};

const STATUS_TONE: Record<SocialStatus, 'success' | 'info' | 'critical'> = {
  published: 'success',
  processing: 'info',
  failed: 'critical',
};

export default function ReportsPage() {
  const t = useTranslations('reports');
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
    const header = 'date,updated,published,social_total,social_published,social_failed\n';
    const body = data.series.map((s, index) => {
      const social = data.social.series[index] ?? { total: 0, published: 0, failed: 0 };
      return `${s.date},${s.count},${s.published},${social.total},${social.published},${social.failed}`;
    }).join('\n');
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
      String(a.seoScore),
      String(a.aeoScore ?? 0),
      String(a.geoScore),
      <Badge key={`${a.id}-s`} tone={a.status === 'published' ? 'success' : undefined}>
        {a.status === 'published' ? t('published') : t('drafts')}
      </Badge>,
    ]) ?? [];

  const providerRows =
    data?.social.byProvider.map((item) => [
      <InlineStack key={item.provider} gap="200" blockAlign="center" wrap={false}>
        <ProviderLogo id={item.provider} size={24} />
        <Text as="span" fontWeight="semibold">{PROVIDER_LABEL[item.provider]}</Text>
      </InlineStack>,
      String(item.total),
      String(item.published),
      String(item.processing),
      String(item.failed),
      `${pct(item.published, item.total)}%`,
    ]) ?? [];

  const mediaRows =
    data?.social.byMediaType.map((item) => [
      MEDIA_LABEL[item.mediaType],
      String(item.total),
      `${pct(item.total, data.social.totals.attempts)}%`,
    ]) ?? [];

  const recentSocialRows =
    data?.social.recent.map((post) => [
      <InlineStack key={post.id} gap="200" blockAlign="center" wrap={false}>
        <ProviderLogo id={post.provider} size={24} />
        <BlockStack gap="050">
          <Text as="span" fontWeight="semibold">{post.title || '(Không tiêu đề)'}</Text>
          <Text as="span" tone="subdued" variant="bodySm">{post.connectionLabel}</Text>
        </BlockStack>
      </InlineStack>,
      MEDIA_LABEL[post.mediaType],
      <Badge key={`${post.id}-st`} tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>,
      new Date(post.createdAt).toLocaleString('vi-VN'),
      post.publishedUrl ? (
        <a key={`${post.id}-url`} href={post.publishedUrl} target="_blank" rel="noreferrer">
          Xem bài
        </a>
      ) : (
        <Text key={`${post.id}-empty-url`} as="span" tone="subdued">-</Text>
      ),
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

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingSm">
                      Báo cáo đăng mạng xã hội
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Số liệu lấy từ lịch sử đăng bài trên Facebook, Instagram, TikTok, Threads và YouTube.
                    </Text>
                  </BlockStack>
                  <a href="/social-posts">Xem lịch sử bài đăng</a>
                </InlineStack>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="400">
                  <StatTile label="Lượt gửi theo kênh" value={String(data.social.totals.attempts)} />
                  <StatTile label="Bài nội dung" value={String(data.social.totals.uniquePosts)} />
                  <StatTile label="Đã đăng" value={String(data.social.totals.published)} />
                  <StatTile label="Đang xử lý" value={String(data.social.totals.processing)} />
                  <StatTile label="Tỷ lệ thành công" value={`${data.social.totals.successRate}%`} />
                </InlineGrid>
                {data.social.totals.failed ? (
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="critical">{`${data.social.totals.failed} lỗi đăng bài`}</Badge>
                    <Text as="span" tone="subdued">Mở lịch sử để xem lỗi chi tiết theo từng nền tảng.</Text>
                  </InlineStack>
                ) : null}
              </BlockStack>
            </Card>

            <InlineGrid columns={{ xs: 1 }} gap="400">
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
                    Hoạt động đăng mạng xã hội theo ngày
                  </Text>
                  <SocialActivityChart series={data.social.series} />
                </BlockStack>
              </Card>
            </InlineGrid>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card padding="0">
                <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                  <Text as="h2" variant="headingSm">
                    Theo nền tảng mạng xã hội
                  </Text>
                </Box>
                {providerRows.length === 0 ? (
                  <Box padding="400">
                    <Text as="p" tone="subdued">Chưa có dữ liệu đăng mạng xã hội trong khoảng này.</Text>
                  </Box>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                    headings={['Nền tảng', 'Tổng', 'Đã đăng', 'Đang xử lý', 'Lỗi', 'Tỷ lệ']}
                    rows={providerRows}
                  />
                )}
              </Card>

              <Card padding="0">
                <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                  <Text as="h2" variant="headingSm">
                    Theo loại nội dung social
                  </Text>
                </Box>
                {mediaRows.length === 0 ? (
                  <Box padding="400">
                    <Text as="p" tone="subdued">Chưa có dữ liệu media trong khoảng này.</Text>
                  </Box>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric']}
                    headings={['Loại nội dung', 'Lượt gửi', 'Tỷ trọng']}
                    rows={mediaRows}
                  />
                )}
              </Card>
            </InlineGrid>

            <Card padding="0">
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <Text as="h2" variant="headingSm">
                  Bài đăng mạng xã hội gần đây
                </Text>
              </Box>
              {recentSocialRows.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">Chưa có bài đăng mạng xã hội trong khoảng này.</Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Bài đăng', 'Loại', 'Trạng thái', 'Thời gian', 'Link']}
                  rows={recentSocialRows}
                />
              )}
            </Card>

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
                  columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'text']}
                  headings={[t('colTitle'), t('colSeo'), t('colAeo'), t('colGeo'), t('colStatus')]}
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

function SocialActivityChart({ series }: { series: Array<{ date: string; total: number; published: number; failed: number }> }) {
  const max = Math.max(1, ...series.map((s) => s.total));
  const w = 320;
  const h = 120;
  const bw = w / Math.max(1, series.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 130 }}>
      {series.map((s, i) => {
        const totalHeight = (s.total / max) * (h - 16);
        const publishedHeight = (s.published / max) * (h - 16);
        const failedHeight = (s.failed / max) * (h - 16);
        const x = i * bw + 1;
        const width = Math.max(1, bw - 2);
        return (
          <g key={s.date}>
            <rect x={x} y={h - totalHeight} width={width} height={totalHeight} fill="#dbeafe" rx={1} />
            <rect x={x} y={h - publishedHeight} width={width} height={publishedHeight} fill="#16a34a" rx={1} />
            {failedHeight ? (
              <rect x={x} y={h - totalHeight} width={width} height={failedHeight} fill="#dc2626" rx={1} />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
