'use client';

import {
  Banner,
  BlockStack,
  Box,
  Button,
  DataTable,
  InlineStack,
  ProgressBar,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { currencyCode, formatLocal, formatUsd, rateFor, rateLine } from '@/lib/i18n/currency';

interface Row {
  provider: string;
  model: string;
  inTokens: number;
  outTokens: number;
  calls: number;
  images: number;
  costUsd: number | null;
}
interface Data {
  monthlyTokenBudget: number;
  usedThisMonth: number;
  rows: Row[];
  totalCostUsd: number;
  fx: { rates: Record<string, number>; asOf: string };
}

// Cài đặt hạn mức token/tháng + bảng chi phí (quy đổi tiền tệ theo ngôn ngữ đang xem). Chủ/quản trị.
export function CostBudgetPanel({ bizId }: { bizId: string }) {
  const t = useTranslations('biz');
  const locale = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const showLocal = currencyCode(locale) !== 'USD';

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/cost-settings`);
    if (res.ok) {
      const d: Data = await res.json();
      setData(d);
      setBudgetInput(d.monthlyTokenBudget > 0 ? String(d.monthlyTokenBudget) : '');
    }
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${bizId}/cost-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTokenBudget: Math.max(0, Math.round(Number(budgetInput) || 0)) }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: t('budgetSaved') });
        await load();
      } else {
        const d = await res.json().catch(() => null);
        setMsg({ ok: false, text: d?.error || t('saveErr') });
      }
    } finally {
      setBusy(false);
    }
  }

  const rate = rateFor(locale, data?.fx.rates);
  const cost = (usd: number | null) =>
    usd == null ? '-' : showLocal ? formatLocal(usd, locale, rate) : formatUsd(usd);

  const budget = data?.monthlyTokenBudget ?? 0;
  const used = data?.usedThisMonth ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;

  return (
    <BlockStack gap="500">
      {/* ─── Hạn mức token ─── */}
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingSm">
            {t('budgetTitle')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('budgetHelp')}
          </Text>
        </BlockStack>
        {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
        {/* Ô trần token + nút Lưu THẲNG HÀNG: helpText tách xuống dưới để không đẩy lệch chiều cao. */}
        <InlineStack gap="200" blockAlign="end" wrap>
          <div style={{ flex: '1 1 220px' }}>
            <TextField
              label={t('budgetLabel')}
              type="number"
              value={budgetInput}
              onChange={setBudgetInput}
              autoComplete="off"
              min={0}
              suffix="token"
            />
          </div>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('saveProfile')}
          </Button>
        </InlineStack>
        <Text as="span" tone="subdued" variant="bodySm">
          {t('budgetZeroHint')}
        </Text>

        {data == null ? (
          <Spinner size="small" />
        ) : budget > 0 ? (
          <BlockStack gap="150">
            <ProgressBar progress={pct} tone={pct >= 80 ? 'critical' : 'primary'} size="small" />
            <Text as="span" variant="bodySm" tone={pct >= 80 ? 'critical' : 'subdued'}>
              {t('budgetUsed', { used: nf.format(used), budget: nf.format(budget), pct })}
            </Text>
            {pct >= 80 ? <Banner tone="warning">{t('budgetWarn')}</Banner> : null}
          </BlockStack>
        ) : (
          <Text as="span" tone="subdued" variant="bodySm">
            {t('budgetUnlimited', { used: nf.format(used) })}
          </Text>
        )}
      </BlockStack>

      {/* ─── Chi phí theo model ─── */}
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">
          {t('costTitle')}
        </Text>
        {data == null ? null : data.rows.length === 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {t('costEmpty')}
          </Text>
        ) : (
          <BlockStack gap="150">
            <DataTable
              columnContentTypes={['text', 'numeric', 'numeric', 'numeric']}
              headings={[t('costColModel'), t('usageColIn'), t('usageColOut'), t('costColCost')]}
              rows={data.rows.map((r) => [
                `${r.provider} · ${r.model}`,
                nf.format(r.inTokens),
                nf.format(r.outTokens),
                cost(r.costUsd),
              ])}
              totals={['', '', '', cost(data.totalCostUsd)]}
              showTotalsInFooter
            />
            <Box>
              <Text as="span" tone="subdued" variant="bodySm">
                {rateLine(locale, data.fx.rates)}
                {data.fx.asOf ? ` · ${t('costAsOf')}: ${new Date(data.fx.asOf).toLocaleDateString()}` : ''}
              </Text>
            </Box>
          </BlockStack>
        )}
      </BlockStack>
    </BlockStack>
  );
}
