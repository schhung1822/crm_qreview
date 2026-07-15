'use client';

import { BlockStack, Box, Card, InlineGrid, InlineStack, Select, Spinner, Text, TextField } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { PLAN_ORDER } from '@/lib/billing/plans';
import type { PlatformOverview } from '@/lib/admin/platform-stats';
import { BarList, CHART_COLORS, Donut, LineAreaChart, type BarItem } from '@/components/admin/charts';
import { useCallback, useEffect, useMemo, useState } from 'react';

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box background="bg-surface" borderColor="border" borderWidth="025" borderRadius="300" padding="300" minHeight="100%">
      <BlockStack gap="050">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="span" variant="headingLg" fontWeight="semibold">{value}</Text>
        {sub ? <Text as="span" variant="bodySm" tone="subdued">{sub}</Text> : null}
      </BlockStack>
    </Box>
  );
}

const ORDER_STATUSES = ['pending', 'paid', 'canceled', 'refunded'] as const;
const SUB_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'free'] as const;
const STATUS_COLOR: Record<string, string> = { pending: '#b7791f', paid: '#2f855a', canceled: '#c53030', refunded: '#805ad5' };

export function OverviewAdmin() {
  const t = useTranslations('admin');
  const tb = useTranslations('billing');
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = mode === 'custom' && from && to ? `from=${from}&to=${to}` : `days=${days}`;
      const r = await fetch(`/api/admin/overview?${qs}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [mode, days, from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  function onRangeChange(v: string) {
    if (v === 'custom') {
      if (!from || !to) {
        setTo(new Date().toISOString().slice(0, 10));
        setFrom(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
      }
      setMode('custom');
    } else {
      setMode('preset');
      setDays(Number(v));
    }
  }

  const usd = (n: number) => `$${n.toFixed(2)}`;
  const vnd = (n: number) => `${nf.format(Math.round(n))}đ`;
  const noData = t('overNoData');

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="end" wrap gap="200">
        <Text as="h3" variant="headingSm">{t('tabOverview')}</Text>
        <InlineStack gap="200" blockAlign="end" wrap>
          {loading ? <Box paddingBlockEnd="200"><Spinner size="small" /></Box> : null}
          {mode === 'custom' ? (
            <>
              <Box minWidth="150px"><TextField label={t('overFrom')} type="date" value={from} onChange={setFrom} autoComplete="off" max={to || undefined} /></Box>
              <Box minWidth="150px"><TextField label={t('overTo')} type="date" value={to} onChange={setTo} autoComplete="off" min={from || undefined} /></Box>
            </>
          ) : null}
          <Box minWidth="150px">
            <Select
              label={t('overRangeLabel')}
              value={mode === 'custom' ? 'custom' : String(days)}
              onChange={onRangeChange}
              options={[
                ...[7, 30, 90].map((n) => ({ label: t('overDays', { n }), value: String(n) })),
                { label: t('overCustom'), value: 'custom' },
              ]}
            />
          </Box>
        </InlineStack>
      </InlineStack>

      {!data ? (
        <Box padding="400"><Spinner size="small" /></Box>
      ) : (
        <>
          {/* KPI */}
          <InlineGrid columns={{ xs: 2, sm: 3, lg: 4, xl: 8 }} gap="300">
            <Kpi label={t('statUsers')} value={nf.format(data.accounts.totalUsers)} sub={`${nf.format(data.accounts.activeUsers)} ${t('statActive').toLowerCase()}`} />
            <Kpi label={t('statBiz')} value={nf.format(data.accounts.totalBiz)} sub={data.accounts.suspendedBiz ? `${nf.format(data.accounts.suspendedBiz)} ${t('statSuspended').toLowerCase()}` : undefined} />
            <Kpi label={t('overKpiActiveSubs')} value={nf.format(data.subscriptions.byStatus.active ?? 0)} />
            <Kpi label={t('overKpiTokens')} value={nf.format(data.ai.totals.inTokens + data.ai.totals.outTokens)} sub={`${nf.format(data.ai.totals.calls)} calls`} />
            <Kpi label={t('overKpiCost')} value={usd(data.ai.totals.costUsd)} />
            <Kpi label={t('overKpiOrdersPaid')} value={nf.format(data.orders.byStatus.paid ?? 0)} sub={`${nf.format(data.orders.total)} ${t('tabOrders').toLowerCase()}`} />
            <Kpi label={t('overKpiRevenue')} value={vnd(data.orders.revenueVndPaid)} />
            <Kpi label={t('overKpiEmails')} value={nf.format(data.email.total)} />
          </InlineGrid>

          {/* AI */}
          <Card>
            <BlockStack gap="400">
              <Text as="h4" variant="headingSm">{t('overSecAi')}</Text>
              <BlockStack gap="150">
                <Text as="span" variant="bodySm" tone="subdued">{t('overTokenTime')}</Text>
                <LineAreaChart
                  dates={data.ai.series.map((s) => s.date)}
                  emptyLabel={noData}
                  series={[
                    { name: t('overTokenIn'), color: CHART_COLORS[0], values: data.ai.series.map((s) => s.inTokens) },
                    { name: t('overTokenOut'), color: CHART_COLORS[1], values: data.ai.series.map((s) => s.outTokens) },
                  ]}
                />
              </BlockStack>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overByModel')}</Text>
                  <BarList emptyLabel={noData} items={data.ai.byModel.map((m): BarItem => ({ label: `${m.provider}/${m.model}`, value: m.inTokens + m.outTokens, sub: m.costUsd > 0 ? usd(m.costUsd) : undefined }))} />
                </BlockStack>
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overByProvider')}</Text>
                  <BarList emptyLabel={noData} items={data.ai.byProvider.map((p): BarItem => ({ label: p.provider, value: p.inTokens + p.outTokens, sub: p.costUsd > 0 ? usd(p.costUsd) : undefined }))} />
                </BlockStack>
              </InlineGrid>
              <BlockStack gap="150">
                <Text as="span" variant="bodySm" tone="subdued">{t('overTopUsers')}</Text>
                <BarList emptyLabel={noData} items={data.ai.topUsers.map((u): BarItem => ({ label: u.name || u.email || u.userId, value: u.inTokens + u.outTokens, sub: u.costUsd > 0 ? usd(u.costUsd) : undefined }))} />
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Đơn hàng */}
          <Card>
            <BlockStack gap="400">
              <Text as="h4" variant="headingSm">{t('overSecOrders')}</Text>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overOrdersStatus')}</Text>
                  <Donut segments={ORDER_STATUSES.map((s) => ({ label: t(`overStatus_${s}`), value: data.orders.byStatus[s] ?? 0, color: STATUS_COLOR[s] }))} centerLabel={t('tabOrders')} />
                </BlockStack>
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overOrdersTime')}</Text>
                  <LineAreaChart
                    dates={data.orders.series.map((s) => s.date)}
                    emptyLabel={noData}
                    series={ORDER_STATUSES.map((st) => ({ name: t(`overStatus_${st}`), color: STATUS_COLOR[st], values: data.orders.series.map((s) => s[st]) }))}
                  />
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>

          {/* Gói cước */}
          <Card>
            <BlockStack gap="400">
              <Text as="h4" variant="headingSm">{t('overSecPlans')}</Text>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <Donut segments={PLAN_ORDER.map((id, i) => ({ label: tb(`plan.${id}`), value: data.subscriptions.byPlan[id] ?? 0, color: CHART_COLORS[i % CHART_COLORS.length] }))} centerLabel={t('byPlan')} />
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overSubStatus')}</Text>
                  <BarList emptyLabel={noData} items={SUB_STATUSES.filter((s) => (data.subscriptions.byStatus[s] ?? 0) > 0).map((s): BarItem => ({ label: t(`overSub_${s}`), value: data.subscriptions.byStatus[s] ?? 0 }))} />
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>

          {/* Email */}
          <Card>
            <BlockStack gap="400">
              <Text as="h4" variant="headingSm">{t('overSecEmail')}</Text>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overEmailTime')}</Text>
                  <LineAreaChart dates={data.email.series.map((s) => s.date)} emptyLabel={noData} series={[{ name: t('overKpiEmails'), color: CHART_COLORS[3], values: data.email.series.map((s) => s.count) }]} />
                </BlockStack>
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" tone="subdued">{t('overEmailType')}</Text>
                  <BarList emptyLabel={noData} items={Object.entries(data.email.byEvent).sort((a, b) => b[1] - a[1]).map(([ev, count]): BarItem => ({ label: hasEventLabel(t, ev) ? t(`emailEvent_${ev}`) : ev, value: count }))} />
                </BlockStack>
              </InlineGrid>
            </BlockStack>
          </Card>
        </>
      )}
    </BlockStack>
  );
}

// Chỉ dùng nhãn emailEvent_* nếu key tồn tại (một số event có thể chưa có nhãn) - tránh hiện raw key thô.
function hasEventLabel(t: ReturnType<typeof useTranslations>, ev: string): boolean {
  try {
    return t(`emailEvent_${ev}`) !== `emailEvent_${ev}`;
  } catch {
    return false;
  }
}
