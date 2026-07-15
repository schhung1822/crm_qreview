'use client';

import { Badge, Banner, BlockStack, Box, Button, Card, Divider, InlineStack, Modal, Select, Spinner, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAdminDialog } from '@/components/admin/AdminDialog';
import { apiErrText } from '@/lib/admin/api-error';
import { OrderDetailModal } from '@/components/admin/OrderDetailModal';
import { ORDER_STATUS_TONE, SUB_STATUS_TONE, type OrderStatus, type SubStatus } from '@/lib/billing/order-ui';
import { PLAN_ORDER, type PlanId } from '@/lib/billing/plans';

interface BizOrder {
  id: string;
  payCode: string;
  userEmail?: string;
  phone: string | null;
  type: 'subscription' | 'overage';
  plan: PlanId | null;
  months: number | null;
  overageArticles: number | null;
  amount?: number;
  discount?: number;
  total: number;
  currency: string;
  couponCode: string | null;
  status: OrderStatus;
  note: string | null;
  utm: { source?: string; medium?: string; campaign?: string; content?: string; term?: string } | null;
  createdAt: string;
  paidAt: string | null;
}
interface Biz {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  members: number;
  suspended: boolean;
  createdAt: string;
  plan: PlanId | null;
  subStatus: SubStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  overageArticles: number;
  unlimitedArticles: boolean;
  orders: BizOrder[];
}

export function BizAdmin({ onOpenDetail }: { onOpenDetail?: (t: { kind: 'user' | 'biz'; id: string }) => void } = {}) {
  const t = useTranslations('admin');
  const tb = useTranslations('billing');
  const dlg = useAdminDialog();
  const [bizes, setBizes] = useState<Biz[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<Record<string, boolean>>({});
  const [planDraft, setPlanDraft] = useState<Record<string, PlanId>>({});
  const [orderDetail, setOrderDetail] = useState<BizOrder | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [transfer, setTransfer] = useState<Biz | null>(null); // biz đang chuyển quyền sở hữu
  const [transferTo, setTransferTo] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/biz');
    if (r.ok) setBizes((await r.json()).bizes ?? []);
    else setBizes([]);
  }, []);
  useEffect(() => {
    void load();
    // Danh sách tài khoản để chọn người nhận khi chuyển quyền sở hữu.
    void fetch('/api/admin/accounts')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAccounts((d.accounts ?? []).map((a: { id: string; email: string }) => ({ id: a.id, email: a.email }))))
      .catch(() => {});
  }, [load]);

  // Bật/tắt "bài viết không giới hạn" cho tài khoản chủ của biz.
  async function toggleUnlimited(bizId: string, ownerId: string, unlimited: boolean) {
    setBusy(bizId);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId, action: 'setUnlimited', unlimited }),
      });
      if (r.ok) await load();
      else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }

  // Chuyển quyền sở hữu biz sang tài khoản đã chọn.
  async function doTransfer() {
    if (!transfer || !transferTo) return;
    setBusy(transfer.id);
    try {
      const r = await fetch('/api/admin/biz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizId: transfer.id, action: 'transfer', newOwnerId: transferTo }),
      });
      if (r.ok) {
        setTransfer(null);
        setTransferTo('');
        await load();
      } else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }

  async function act(bizId: string, action: 'suspend' | 'activate' | 'delete') {
    if (action === 'delete') {
      const ok = await dlg.confirm({ title: t('bizDelete'), message: t('bizDeleteConfirm'), tone: 'critical', confirmText: t('bizDelete') });
      if (!ok) return;
    }
    setBusy(bizId);
    try {
      const r = await fetch('/api/admin/biz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizId, action }),
      });
      if (r.ok) await load();
      else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }

  // Gói cước ĐI VỚI BIZ: gán gói = đặt subscription cho TÀI KHOẢN CHỦ của biz (mô hình quota theo
  // tài khoản chủ). Dùng lại endpoint accounts/users với ownerId.
  async function assignPlan(bizId: string, ownerId: string, plan: PlanId) {
    setBusy(bizId);
    try {
      const r = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId, plan }),
      });
      if (r.ok) await load();
      else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }
  async function addOverage(bizId: string, ownerId: string) {
    const s = await dlg.prompt({ title: t('addOverage'), label: t('overagePrompt'), inputType: 'number' });
    const n = Number(s ?? '');
    if (!Number.isInteger(n) || n <= 0) return;
    setBusy(bizId);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId, action: 'addOverage', overage: n }),
      });
      if (r.ok) await load();
      else await dlg.alert({ message: apiErrText(await r.json().catch(() => null), t), tone: 'critical' });
    } finally {
      setBusy(null);
    }
  }

  if (bizes == null)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );
  const kw = q.trim().toLowerCase();
  const filtered = bizes.filter((b) => !kw || `${b.name} ${b.ownerEmail ?? ''}`.toLowerCase().includes(kw));

  const planOptions = PLAN_ORDER.map((id) => ({ label: tb(`plan.${id}`), value: id }));
  const planLabel = (p: PlanId | null) => (p ? tb(`plan.${p}`) : t('trialDefault'));
  const subLabel = (s: SubStatus | null) => (s ? t(`subStatus_${s}`) : t('trialDefault'));
  const orderTitle = (o: BizOrder) =>
    o.type === 'subscription'
      ? `${planLabel(o.plan)} · ${o.months ?? '-'}${t('orderMonthUnit')}`
      : `${t('orderOverage')} +${o.overageArticles ?? 0}`;

  return (
    <BlockStack gap="300">
      <TextField label={t('search')} labelHidden value={q} onChange={setQ} autoComplete="off" placeholder={t('bizSearch')} clearButton onClearButtonClick={() => setQ('')} />
      {filtered.map((b) => {
        const open = !!openOrders[b.id];
        return (
          <Card key={b.id}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <BlockStack gap="100">
                  <InlineStack gap="150" blockAlign="center" wrap>
                    {/* Bấm tên biz → mở chi tiết ngay */}
                    {onOpenDetail ? (
                      <button type="button" className="admin-entity-link admin-entity-link--inline" onClick={() => onOpenDetail({ kind: 'biz', id: b.id })}>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {b.name}
                        </Text>
                      </button>
                    ) : (
                      <Text as="span" variant="bodyMd" fontWeight="medium">
                        {b.name}
                      </Text>
                    )}
                    {b.suspended ? <Badge tone="critical">{t('suspended')}</Badge> : <Badge tone="success">{t('active')}</Badge>}
                    {/* Gói cước + trạng thái đăng ký (theo tài khoản chủ) */}
                    <Badge>{planLabel(b.plan)}</Badge>
                    <Badge tone={SUB_STATUS_TONE[b.subStatus ?? 'free']}>{subLabel(b.subStatus)}</Badge>
                    {b.overageArticles ? <Badge tone="attention">{`+${b.overageArticles} ${t('orderArticlesShort')}`}</Badge> : null}
                    {b.unlimitedArticles ? <Badge tone="success">{t('bizUnlimited')}</Badge> : null}
                  </InlineStack>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {b.ownerEmail ?? '—'} · {t('bizMembers', { n: b.members })} · {new Date(b.createdAt).toLocaleDateString()}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {b.subStatus === 'trialing' && b.trialEndsAt
                      ? t('bizTrialEnds', { date: new Date(b.trialEndsAt).toLocaleDateString() })
                      : b.currentPeriodEnd
                        ? t('bizPeriodEnd', { date: new Date(b.currentPeriodEnd).toLocaleDateString() })
                        : ''}
                  </Text>
                </BlockStack>
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Button size="slim" onClick={() => { setTransfer(b); setTransferTo(''); }}>
                    {t('bizTransfer')}
                  </Button>
                  <Button size="slim" loading={busy === b.id} onClick={() => void act(b.id, b.suspended ? 'activate' : 'suspend')}>
                    {b.suspended ? t('activate') : t('suspend')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => void act(b.id, 'delete')}>
                    {t('bizDelete')}
                  </Button>
                </InlineStack>
              </InlineStack>

              {/* Gói cước ĐI VỚI BIZ: đổi gói + mua thêm bài (overage) cho tài khoản chủ. */}
              <InlineStack gap="200" blockAlign="end" wrap>
                <div style={{ minWidth: 160 }}>
                  <Select
                    label={t('planLabel')}
                    labelHidden
                    options={planOptions}
                    value={planDraft[b.id] ?? b.plan ?? 'pro'}
                    onChange={(v) => setPlanDraft((d) => ({ ...d, [b.id]: v as PlanId }))}
                  />
                </div>
                <Button
                  size="slim"
                  loading={busy === b.id}
                  disabled={(planDraft[b.id] ?? b.plan ?? 'pro') === b.plan}
                  onClick={() => void assignPlan(b.id, b.ownerId, planDraft[b.id] ?? b.plan ?? 'pro')}
                >
                  {t('savePlan')}
                </Button>
                <Button size="slim" onClick={() => void addOverage(b.id, b.ownerId)}>
                  {t('addOverage')}
                </Button>
                <Button
                  size="slim"
                  tone={b.unlimitedArticles ? 'critical' : undefined}
                  variant={b.unlimitedArticles ? 'plain' : undefined}
                  onClick={() => void toggleUnlimited(b.id, b.ownerId, !b.unlimitedArticles)}
                >
                  {b.unlimitedArticles ? t('bizUnlimitedDisable') : t('bizUnlimitedEnable')}
                </Button>
              </InlineStack>

              {/* Đơn hàng của tài khoản chủ - đóng/mở để xem chi tiết trạng thái */}
              <Divider />
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" variant="bodySm" fontWeight="medium">
                  {t('bizOrders', { n: b.orders.length })}
                </Text>
                {b.orders.length ? (
                  <Button size="slim" variant="plain" disclosure={open ? 'up' : 'down'} onClick={() => setOpenOrders((s) => ({ ...s, [b.id]: !open }))}>
                    {open ? t('bizOrdersHide') : t('bizOrdersShow')}
                  </Button>
                ) : (
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('bizNoOrders')}
                  </Text>
                )}
              </InlineStack>
              {open && b.orders.length ? (
                <BlockStack gap="150">
                  {b.orders.map((o) => (
                    // Bấm vào 1 đơn → mở popup chi tiết đơn hàng.
                    <button key={o.id} type="button" className="admin-order-row" onClick={() => setOrderDetail(o)}>
                      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                        <BlockStack gap="050">
                          <InlineStack gap="150" blockAlign="center" wrap>
                            <Badge tone={ORDER_STATUS_TONE[o.status]}>{t(`orderStatus_${o.status}`)}</Badge>
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              {orderTitle(o)}
                            </Text>
                            <Text as="span" tone="subdued" variant="bodySm">
                              {t('orderPayCode')}: {o.payCode}
                            </Text>
                          </InlineStack>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {o.total.toLocaleString()} {o.currency}
                            {o.couponCode ? ` · ${o.couponCode}` : ''} · {new Date(o.createdAt).toLocaleDateString()}
                            {o.paidAt ? ` · ${t('orderPaidAt')}: ${new Date(o.paidAt).toLocaleDateString()}` : ''}
                          </Text>
                        </BlockStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {t('detailBtn')} ›
                        </Text>
                      </InlineStack>
                    </button>
                  ))}
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        );
      })}
      <OrderDetailModal order={orderDetail} onClose={() => setOrderDetail(null)} />

      {/* Popup chuyển quyền sở hữu biz */}
      <Modal
        open={!!transfer}
        onClose={() => setTransfer(null)}
        title={transfer ? `${t('bizTransfer')} · ${transfer.name}` : ''}
        primaryAction={{ content: t('bizTransferBtn'), onAction: () => void doTransfer(), disabled: !transferTo, loading: busy === transfer?.id }}
        secondaryActions={[{ content: t('close'), onAction: () => setTransfer(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">{t('bizTransferWarn')}</Banner>
            <Select
              label={t('bizTransferTo')}
              placeholder={t('bizTransferPick')}
              options={accounts
                .filter((a) => a.id !== transfer?.ownerId)
                .map((a) => ({ label: a.email, value: a.id }))}
              value={transferTo}
              onChange={setTransferTo}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
