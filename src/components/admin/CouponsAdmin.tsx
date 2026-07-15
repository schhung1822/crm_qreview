'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';

interface Coupon {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  currency?: 'VND' | 'USD';
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  active: boolean;
}

const EMPTY = {
  code: '',
  type: 'percent' as 'percent' | 'fixed',
  value: 10,
  currency: 'VND' as 'VND' | 'USD',
  maxUses: 0,
  expiresAt: '',
  active: true,
};

export function CouponsAdmin() {
  const t = useTranslations('admin');
  const dlg = useAdminDialog();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/coupons');
    if (r.ok) setCoupons((await r.json()).coupons ?? []);
    else setCoupons([]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        await load();
        return true;
      }
      await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function create() {
    if (!form.code.trim()) return;
    const ok = await save({
      code: form.code.trim(),
      type: form.type,
      value: Number(form.value) || 0,
      ...(form.type === 'fixed' ? { currency: form.currency } : {}),
      maxUses: Number(form.maxUses) || 0,
      ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      active: form.active,
    });
    if (ok) setForm({ ...EMPTY });
  }

  async function toggle(c: Coupon) {
    await save({ code: c.code, type: c.type, value: c.value, currency: c.currency, maxUses: c.maxUses, expiresAt: c.expiresAt, active: !c.active });
  }
  async function remove(code: string) {
    const ok = await dlg.confirm({ title: t('couponDelete'), message: t('couponDeleteConfirm'), tone: 'critical', confirmText: t('couponDelete') });
    if (!ok) return;
    const r = await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    if (r.ok) await load();
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            {t('couponCreate')}
          </Text>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
            <TextField label={t('couponCode')} value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} autoComplete="off" />
            <Select label={t('couponType')} options={[{ label: t('couponPercent'), value: 'percent' }, { label: t('couponFixed'), value: 'fixed' }]} value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as 'percent' | 'fixed' }))} />
            <TextField label={t('couponValue')} type="number" value={String(form.value)} onChange={(v) => setForm((f) => ({ ...f, value: Number(v) || 0 }))} autoComplete="off" suffix={form.type === 'percent' ? '%' : ''} />
            {form.type === 'fixed' ? (
              <Select label={t('couponCurrency')} options={[{ label: 'VND', value: 'VND' }, { label: 'USD', value: 'USD' }]} value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v as 'VND' | 'USD' }))} />
            ) : null}
            <TextField label={t('couponMaxUses')} type="number" value={String(form.maxUses)} onChange={(v) => setForm((f) => ({ ...f, maxUses: Number(v) || 0 }))} autoComplete="off" helpText={t('couponMaxUsesHint')} />
            <TextField label={t('couponExpires')} type="date" value={form.expiresAt} onChange={(v) => setForm((f) => ({ ...f, expiresAt: v }))} autoComplete="off" />
          </InlineGrid>
          <InlineStack>
            <Button variant="primary" loading={busy} disabled={!form.code.trim()} onClick={() => void create()}>
              {t('couponSave')}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {coupons == null ? (
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      ) : coupons.length === 0 ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {t('couponEmpty')}
        </Text>
      ) : (
        <BlockStack gap="200">
          {coupons.map((c) => (
            <Card key={c.code}>
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <BlockStack gap="050">
                  <InlineStack gap="150" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {c.code}
                    </Text>
                    {c.active ? <Badge tone="success">{t('active')}</Badge> : <Badge>{t('couponInactive')}</Badge>}
                  </InlineStack>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {c.type === 'percent' ? `${c.value}%` : `${c.value.toLocaleString()} ${c.currency ?? ''}`} ·{' '}
                    {t('couponUses', { used: c.usedCount, max: c.maxUses || '∞' })}
                    {c.expiresAt ? ` · ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center">
                  <Button size="slim" onClick={() => void toggle(c)}>
                    {c.active ? t('couponDisable') : t('couponEnable')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => void remove(c.code)}>
                    {t('couponDelete')}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>
          ))}
        </BlockStack>
      )}
    </BlockStack>
  );
}
