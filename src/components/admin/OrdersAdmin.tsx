'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineGrid,
  InlineStack,
  Modal,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';
import { ORDER_STATUS_TONE } from '@/lib/billing/order-ui';
import { PLAN_ORDER, type PlanId } from '@/lib/billing/plans';

interface Order {
  id: string;
  userEmail: string;
  type: 'subscription' | 'overage';
  plan?: PlanId;
  months?: number;
  overageArticles?: number;
  currency: 'VND' | 'USD';
  amount: number;
  discount: number;
  prorationCredit?: number;
  total: number;
  couponCode?: string;
  status: 'pending' | 'paid' | 'canceled' | 'refunded';
  payCode: string;
  phone?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  note?: string;
  activationError?: string;
  createdAt: string;
  paidAt?: string;
}
interface Account {
  id: string;
  email: string;
}

export function OrdersAdmin() {
  const t = useTranslations('admin');
  const dlg = useAdminDialog();
  const [subTab, setSubTab] = useState(0);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  // Bộ lọc danh sách.
  const [q, setQ] = useState('');
  const [timeF, setTimeF] = useState<'all' | '7' | '30' | '90'>('all');
  const [planF, setPlanF] = useState<string>('all');
  const [statusF, setStatusF] = useState<string>('all');

  const [f, setF] = useState({
    userId: '',
    type: 'subscription' as 'subscription' | 'overage',
    plan: 'pro' as PlanId,
    months: 3,
    overageArticles: 25,
    amount: 0,
    couponCode: '',
    markPaid: true,
  });

  const load = useCallback(async () => {
    const [o, a] = await Promise.all([fetch('/api/admin/orders'), fetch('/api/admin/accounts')]);
    if (o.ok) setOrders((await o.json()).orders ?? []);
    else setOrders([]);
    if (a.ok) setAccounts((await a.json()).accounts ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!f.userId) return;
    setBusy('create');
    try {
      const r = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: f.userId,
          type: f.type,
          ...(f.type === 'subscription' ? { plan: f.plan, months: f.months } : { overageArticles: f.overageArticles, amount: f.amount }),
          ...(f.couponCode.trim() ? { couponCode: f.couponCode.trim() } : {}),
          markPaid: f.markPaid,
        }),
      });
      if (r.ok) {
        await load();
        setSubTab(0); // tạo xong → xem danh sách
      } else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (r.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  // CẢNH BÁO (popup) trước khi đổi trạng thái (thanh toán/hủy/hoàn) - buộc đọc thông tin đơn + hậu quả.
  async function confirmAndSet(o: Order, status: 'paid' | 'canceled' | 'refunded', after?: () => void) {
    const p = { code: o.payCode, amount: `${o.total.toLocaleString()} ${o.currency}` };
    const conf =
      status === 'paid'
        ? { title: t('orderMarkPaidBtn'), message: t('confirmMarkPaid', p), tone: 'warning' as const, confirmText: t('orderMarkPaidBtn') }
        : status === 'canceled'
          ? { title: t('orderCancel'), message: t('confirmCancel', p), tone: 'warning' as const, confirmText: t('orderCancel') }
          : { title: t('orderRefund'), message: t('confirmRefund', p), tone: 'critical' as const, confirmText: t('orderRefund') };
    if (!(await dlg.confirm(conf))) return;
    await setStatus(o.id, status);
    after?.();
  }

  const userOptions = [{ label: t('orderPickUser'), value: '' }, ...accounts.map((a) => ({ label: a.email, value: a.id }))];

  // Lọc: tìm (mã TT/email/SĐT/mã đơn) + thời gian + gói + trạng thái.
  const kw = q.trim().toLowerCase();
  const cutoff = timeF === 'all' ? 0 : Date.now() - Number(timeF) * 86_400_000;
  const filtered = (orders ?? []).filter((o) => {
    if (kw && ![o.payCode, o.id, o.userEmail, o.phone].some((x) => (x ?? '').toLowerCase().includes(kw))) return false;
    if (cutoff && new Date(o.createdAt).getTime() < cutoff) return false;
    if (planF !== 'all') {
      if (planF === 'overage') {
        if (o.type !== 'overage') return false;
      } else if (o.plan !== planF) return false;
    }
    if (statusF !== 'all' && o.status !== statusF) return false;
    return true;
  });

  const createForm = (
    <Card>
      <BlockStack gap="300">
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
          <Select label={t('orderUser')} options={userOptions} value={f.userId} onChange={(v) => setF((s) => ({ ...s, userId: v }))} />
          <Select label={t('orderType')} options={[{ label: t('orderSub'), value: 'subscription' }, { label: t('orderOverage'), value: 'overage' }]} value={f.type} onChange={(v) => setF((s) => ({ ...s, type: v as 'subscription' | 'overage' }))} />
          {f.type === 'subscription' ? (
            <>
              <Select label={t('planLabel')} options={PLAN_ORDER.filter((p) => p !== 'free' && p !== 'enterprise').map((p) => ({ label: p, value: p }))} value={f.plan} onChange={(v) => setF((s) => ({ ...s, plan: v as PlanId }))} />
              <Select label={t('orderCycle')} options={[{ label: t('orderM3'), value: '3' }, { label: t('orderM6'), value: '6' }, { label: t('orderM12'), value: '12' }]} value={String(f.months)} onChange={(v) => setF((s) => ({ ...s, months: Number(v) }))} />
            </>
          ) : (
            <>
              <TextField label={t('orderArticles')} type="number" value={String(f.overageArticles)} onChange={(v) => setF((s) => ({ ...s, overageArticles: Number(v) || 0 }))} autoComplete="off" />
              <TextField label={t('orderAmount')} type="number" value={String(f.amount)} onChange={(v) => setF((s) => ({ ...s, amount: Number(v) || 0 }))} autoComplete="off" suffix="đ" />
            </>
          )}
          <TextField label={t('orderCoupon')} value={f.couponCode} onChange={(v) => setF((s) => ({ ...s, couponCode: v.toUpperCase() }))} autoComplete="off" />
        </InlineGrid>
        <InlineStack gap="300" blockAlign="center" wrap>
          <Checkbox label={t('orderMarkPaid')} checked={f.markPaid} onChange={(v) => setF((s) => ({ ...s, markPaid: v }))} />
          <Button variant="primary" loading={busy === 'create'} disabled={!f.userId} onClick={() => void create()}>
            {t('orderSubmit')}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  const listSection = (
    <BlockStack gap="300">
      <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="200">
        <TextField label={t('orderSearch')} labelHidden value={q} onChange={setQ} autoComplete="off" placeholder={t('orderSearchPlaceholder')} clearButton onClearButtonClick={() => setQ('')} />
        <Select label={t('orderFilterTime')} labelHidden options={[{ label: t('orderTimeAll'), value: 'all' }, { label: t('orderTime7'), value: '7' }, { label: t('orderTime30'), value: '30' }, { label: t('orderTime90'), value: '90' }]} value={timeF} onChange={(v) => setTimeF(v as typeof timeF)} />
        <Select label={t('orderFilterPlan')} labelHidden options={[{ label: t('orderPlanAll'), value: 'all' }, { label: 'Starter', value: 'starter' }, { label: 'Pro', value: 'pro' }, { label: 'Agency', value: 'agency' }, { label: t('orderOverage'), value: 'overage' }]} value={planF} onChange={setPlanF} />
        <Select label={t('orderFilterStatus')} labelHidden options={[{ label: t('orderStatusAll'), value: 'all' }, { label: t('orderStatus_pending'), value: 'pending' }, { label: t('orderStatus_paid'), value: 'paid' }, { label: t('orderStatus_canceled'), value: 'canceled' }, { label: t('orderStatus_refunded'), value: 'refunded' }]} value={statusF} onChange={setStatusF} />
      </InlineGrid>

      {orders == null ? (
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      ) : filtered.length === 0 ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {t('orderEmpty')}
        </Text>
      ) : (
        <BlockStack gap="200">
          <Text as="span" tone="subdued" variant="bodySm">
            {t('orderCount', { n: filtered.length })}
          </Text>
          {filtered.map((o, i) => (
            <Card key={o.id}>
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="200" blockAlign="center">
                  {/* Số thứ tự để dễ kiểm soát */}
                  <Text as="span" tone="subdued" variant="bodySm">
                    #{i + 1}
                  </Text>
                  <BlockStack gap="050">
                    <InlineStack gap="150" blockAlign="center">
                      <Button variant="plain" onClick={() => setDetail(o)}>
                        {o.id}
                      </Button>
                      <Badge tone={ORDER_STATUS_TONE[o.status]}>{t(`orderStatus_${o.status}`)}</Badge>
                      {o.status === 'paid' && o.activationError ? (
                        <Badge tone="critical">{t('orderNotActivated')}</Badge>
                      ) : null}
                    </InlineStack>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {o.userEmail} ·{' '}
                      {o.type === 'subscription' ? `${o.plan} · ${o.months ?? '-'}${t('orderMonthUnit')}` : `+${o.overageArticles} ${t('orderArticlesShort')}`} ·{' '}
                      {o.total.toLocaleString()} {o.currency}
                      {o.discount ? ` (−${o.discount.toLocaleString()}${o.couponCode ? ' ' + o.couponCode : ''})` : ''} ·{' '}
                      {new Date(o.createdAt).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center" wrap>
                  {o.status !== 'paid' ? (
                    <Button size="slim" loading={busy === o.id} onClick={() => void confirmAndSet(o, 'paid')}>
                      {t('orderMarkPaidBtn')}
                    </Button>
                  ) : null}
                  {o.status === 'pending' ? (
                    <Button size="slim" variant="plain" onClick={() => void confirmAndSet(o, 'canceled')}>
                      {t('orderCancel')}
                    </Button>
                  ) : null}
                  {o.status === 'paid' ? (
                    <Button size="slim" variant="plain" tone="critical" onClick={() => void confirmAndSet(o, 'refunded')}>
                      {t('orderRefund')}
                    </Button>
                  ) : null}
                </InlineStack>
              </InlineStack>
            </Card>
          ))}
        </BlockStack>
      )}
    </BlockStack>
  );

  return (
    <BlockStack gap="400">
      <Tabs
        tabs={[
          { id: 'list', content: t('orderTabList') },
          { id: 'create', content: t('orderTabCreate') },
        ]}
        selected={subTab}
        onSelect={setSubTab}
      >
        <Box paddingBlockStart="300">{subTab === 0 ? listSection : createForm}</Box>
      </Tabs>

      {/* Chi tiết đơn hàng: đầy đủ thông tin + UTM + kích hoạt thanh toán thủ công. */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${t('orderDetail')} · ${detail.id}` : ''}
        secondaryActions={[{ content: t('close'), onAction: () => setDetail(null) }]}
      >
        <Modal.Section>
          {detail ? (
            <BlockStack gap="200">
              {(
                [
                  [t('orderUser'), detail.userEmail],
                  ...(detail.phone ? ([[t('orderPhone'), detail.phone]] as Array<[string, string]>) : []),
                  [t('orderStatusLabel'), t(`orderStatus_${detail.status}`)],
                  [t('orderType'), detail.type === 'subscription' ? t('orderSub') : t('orderOverage')],
                  ...(detail.type === 'subscription'
                    ? ([
                        [t('planLabel'), String(detail.plan)],
                        [t('orderCycle'), `${detail.months ?? '-'}${t('orderMonthUnit')}`],
                      ] as Array<[string, string]>)
                    : ([[t('orderArticles'), `+${detail.overageArticles}`]] as Array<[string, string]>)),
                  [t('orderAmount'), `${detail.amount.toLocaleString()} ${detail.currency}`],
                  ...(detail.discount
                    ? ([[t('orderDiscount'), `−${detail.discount.toLocaleString()} ${detail.currency}${detail.couponCode ? ` (${detail.couponCode})` : ''}`]] as Array<[string, string]>)
                    : []),
                  ...(detail.prorationCredit
                    ? ([[t('orderProration'), `−${detail.prorationCredit.toLocaleString()} ${detail.currency}`]] as Array<[string, string]>)
                    : []),
                  [t('orderTotal'), `${detail.total.toLocaleString()} ${detail.currency}`],
                  [t('orderPayCode'), `${detail.payCode}`],
                  [t('orderCreatedAt'), new Date(detail.createdAt).toLocaleString()],
                  ...(detail.paidAt ? ([[t('orderPaidAt'), new Date(detail.paidAt).toLocaleString()]] as Array<[string, string]>) : []),
                  ...(detail.note ? ([[t('orderNote'), detail.note]] as Array<[string, string]>) : []),
                ] as Array<[string, string]>
              ).map(([label, value], i) => (
                <InlineStack key={i} align="space-between" blockAlign="center" wrap gap="200">
                  <Text as="span" tone="subdued" variant="bodySm">
                    {label}
                  </Text>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    {value}
                  </Text>
                </InlineStack>
              ))}

              {detail.utm && Object.values(detail.utm).some(Boolean) ? (
                <>
                  <Divider />
                  <Text as="span" variant="headingSm">
                    {t('orderUtm')}
                  </Text>
                  {(['source', 'medium', 'campaign', 'content', 'term'] as const)
                    .filter((k) => detail.utm?.[k])
                    .map((k) => (
                      <InlineStack key={k} align="space-between" gap="200">
                        <Text as="span" tone="subdued" variant="bodySm">
                          utm_{k}
                        </Text>
                        <Text as="span" variant="bodySm" fontWeight="medium">
                          {detail.utm?.[k]}
                        </Text>
                      </InlineStack>
                    ))}
                </>
              ) : (
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('orderNoUtm')}
                </Text>
              )}

              <Divider />
              <InlineStack gap="200" wrap>
                {detail.status !== 'paid' ? (
                  <Button
                    variant="primary"
                    loading={busy === detail.id}
                    onClick={() => void confirmAndSet(detail, 'paid', () => setDetail(null))}
                  >
                    {t('orderActivate')}
                  </Button>
                ) : null}
                {detail.status === 'pending' ? (
                  <Button onClick={() => void confirmAndSet(detail, 'canceled', () => setDetail(null))}>
                    {t('orderCancel')}
                  </Button>
                ) : null}
                {detail.status === 'paid' ? (
                  <Button tone="critical" onClick={() => void confirmAndSet(detail, 'refunded', () => setDetail(null))}>
                    {t('orderRefund')}
                  </Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
