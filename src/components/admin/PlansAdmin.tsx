'use client';

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Icon,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { PLAN_ORDER, type Plan, type PlanFeatures, type PlanId } from '@/lib/billing/plans';
import { apiErrText } from '@/lib/admin/api-error';

// Chỉ dùng VND cho gói cước (thanh toán qua Sepay là VND).
const NUM_FIELDS: Array<[keyof Plan, string]> = [
  ['articlesPerMonth', 'planArticles'],
  ['socialReportsPerMonth', 'planSocialReports'],
  ['maxBiz', 'planBiz'],
  ['maxSeats', 'planSeats'],
  ['maxCmsConnections', 'planCms'],
  ['priceVndMonthly', 'planVndM'],
  ['priceVndYearly', 'planVndY'],
];
const FEATURES: Array<keyof PlanFeatures> = [
  'approval',
  'brandVoice',
  'api',
  'factCheck',
  'humanize',
  'whiteLabel',
  'clientReports',
  'prioritySupport',
  'myTasks',
  'internalLinks',
  'imageAlt',
  'socialAllChannels',
];

export function PlansAdmin() {
  const t = useTranslations('admin');
  const [plans, setPlans] = useState<Record<PlanId, Plan> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/plans');
    if (r.ok) setPlans((await r.json()).plans);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function upd(id: PlanId, field: keyof Plan, val: number) {
    setPlans((p) => (p ? { ...p, [id]: { ...p[id], [field]: val } } : p));
  }
  function updFeat(id: PlanId, key: keyof PlanFeatures, val: boolean) {
    setPlans((p) => (p ? { ...p, [id]: { ...p[id], features: { ...p[id].features, [key]: val } } } : p));
  }

  function patchOf(p: Plan) {
    return {
      articlesPerMonth: p.articlesPerMonth,
      socialReportsPerMonth: p.socialReportsPerMonth,
      maxBiz: p.maxBiz,
      maxSeats: p.maxSeats,
      maxCmsConnections: p.maxCmsConnections,
      models: p.models,
      overage: p.overage,
      trialDays: p.trialDays ?? 0,
      priceVndMonthly: p.priceVndMonthly,
      priceUsdMonthly: p.priceUsdMonthly,
      priceVndYearly: p.priceVndYearly,
      priceUsdYearly: p.priceUsdYearly,
      features: p.features,
    };
  }

  // Lưu TẤT CẢ gói trong một lần bấm (thay vì lưu từng gói).
  async function saveAll() {
    if (!plans) return;
    setBusy('all');
    setMsg(null);
    try {
      let latest: Record<PlanId, Plan> | null = null;
      for (const id of PLAN_ORDER) {
        const r = await fetch('/api/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, patch: patchOf(plans[id]) }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          setMsg({ ok: false, text: `${id.toUpperCase()}: ${apiErrText(d, t)}` });
          return;
        }
        latest = (await r.json()).plans;
      }
      if (latest) setPlans(latest);
      setMsg({ ok: true, text: t('plansSavedAll') });
    } finally {
      setBusy(null);
    }
  }
  async function reset(id: PlanId) {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reset' }),
      });
      if (r.ok) setPlans((await r.json()).plans);
    } finally {
      setBusy(null);
    }
  }

  if (!plans)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued" variant="bodySm">
        {t('plansHelp')}
      </Text>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
      {PLAN_ORDER.map((id) => {
        const p = plans[id];
        return (
          <Card key={id}>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                {id.toUpperCase()}
              </Text>
              <InlineGrid columns={{ xs: 2, sm: 4 }} gap="200">
                {NUM_FIELDS.map(([field, label]) => (
                  <TextField
                    key={String(field)}
                    label={t(label)}
                    type="text"
                    inputMode="numeric"
                    value={Number(p[field] ?? 0).toLocaleString('vi-VN')}
                    onChange={(v) => upd(id, field, Number(v.replace(/[^\d]/g, '')) || 0)}
                    autoComplete="off"
                  />
                ))}
                <Select
                  label={t('planModels')}
                  options={[
                    { label: 'economy', value: 'economy' },
                    { label: 'standard', value: 'standard' },
                    { label: 'premium', value: 'premium' },
                    { label: 'all', value: 'all' },
                  ]}
                  value={p.models}
                  onChange={(v) =>
                    setPlans((pp) => (pp ? { ...pp, [id]: { ...pp[id], models: v as Plan['models'] } } : pp))
                  }
                />
              </InlineGrid>
              <InlineStack gap="300" wrap>
                <Checkbox
                  label={t('planOverage')}
                  checked={p.overage}
                  onChange={(v) => setPlans((pp) => (pp ? { ...pp, [id]: { ...pp[id], overage: v } } : pp))}
                />
                {FEATURES.map((f) => (
                  <InlineStack key={f} gap="050" blockAlign="center" wrap={false}>
                    <Checkbox label={t(`featLabel_${f}`)} checked={p.features[f]} onChange={(v) => updFeat(id, f, v)} />
                    {/* (i) chú thích: rê/chạm để xem tính năng này là gì → xây gói chi tiết. */}
                    <Tooltip content={t(`featDesc_${f}`)} dismissOnMouseOut>
                      <span style={{ display: 'inline-flex', cursor: 'help' }} tabIndex={0} aria-label={t(`featDesc_${f}`)}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  </InlineStack>
                ))}
              </InlineStack>
              <InlineStack gap="200">
                <Button variant="plain" loading={busy === id} onClick={() => void reset(id)}>
                  {t('planReset')}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        );
      })}

      {/* Lưu TẤT CẢ thay đổi trong một lần. */}
      <Box background="bg-surface-secondary" padding="300" borderRadius="200" borderWidth="025" borderColor="border">
        <InlineStack gap="300" blockAlign="center" wrap>
          <Button variant="primary" size="large" loading={busy === 'all'} onClick={() => void saveAll()}>
            {t('saveAllPlans')}
          </Button>
          <Text as="span" tone="subdued" variant="bodySm">
            {t('saveAllPlansHint')}
          </Text>
        </InlineStack>
      </Box>
    </BlockStack>
  );
}
