'use client';

import { BlockStack, Box, DataTable, Spinner, Text } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { currencyCode, formatLocal, formatUsd, rateFor } from '@/lib/i18n/currency';

interface Row {
  userId: string;
  name: string | null;
  email: string | null;
  inTokens: number;
  outTokens: number;
  calls: number;
  images: number;
  costUsd: number | null;
}

// Báo cáo token AI theo từng nhân viên trong biz (chủ/quản trị). Đọc /api/biz/[id]/token-usage.
export function TokenUsageReportPanel({ bizId }: { bizId: string }) {
  const t = useTranslations('biz');
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number> | undefined>(undefined);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const showLocal = currencyCode(locale) !== 'USD';
  const cost = (usd: number | null) =>
    usd == null ? '-' : showLocal ? formatLocal(usd, locale, rateFor(locale, fxRates)) : formatUsd(usd);

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/token-usage`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.rows ?? []);
      setFxRates(d.fx?.rates);
    } else setRows([]);
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = (r: Row) =>
    r.userId === 'unknown' ? t('usageUnknown') : r.name || t('usageDeletedUser');

  const totals = (rows ?? []).reduce(
    (a, r) => ({
      inTokens: a.inTokens + r.inTokens,
      outTokens: a.outTokens + r.outTokens,
      calls: a.calls + r.calls,
      costUsd: a.costUsd + (r.costUsd ?? 0),
    }),
    { inTokens: 0, outTokens: 0, calls: 0, costUsd: 0 },
  );

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">
          {t('usageTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('usageHelp')}
        </Text>
      </BlockStack>

      {rows === null ? (
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      ) : rows.length === 0 ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {t('usageEmpty')}
        </Text>
      ) : (
        <DataTable
          columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
          headings={[
            t('usageColStaff'),
            t('usageColIn'),
            t('usageColOut'),
            t('usageColCalls'),
            t('usageColImages'),
            t('costColCost'),
          ]}
          rows={rows.map((r) => [
            label(r),
            nf.format(r.inTokens),
            nf.format(r.outTokens),
            nf.format(r.calls),
            nf.format(r.images),
            cost(r.costUsd),
          ])}
          totals={[
            '',
            nf.format(totals.inTokens),
            nf.format(totals.outTokens),
            nf.format(totals.calls),
            '',
            cost(totals.costUsd),
          ]}
          showTotalsInFooter
        />
      )}
    </BlockStack>
  );
}
