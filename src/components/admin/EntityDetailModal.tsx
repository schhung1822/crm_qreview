'use client';

import { Badge, BlockStack, Box, Button, Divider, InlineStack, Modal, Spinner, Text } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS_TONE, SUB_STATUS_TONE, type OrderStatus, type SubStatus } from '@/lib/billing/order-ui';
import { apiErrText } from '@/lib/admin/api-error';
import type { PlanId } from '@/lib/billing/plans';

export type DetailTarget = { kind: 'user' | 'biz'; id: string };

interface DetailOrder {
  id: string;
  payCode: string;
  type: 'subscription' | 'overage';
  plan: PlanId | null;
  months: number | null;
  overageArticles: number | null;
  total: number;
  currency: string;
  couponCode: string | null;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
}
interface SubInfo {
  plan: PlanId | null;
  status: SubStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  overageArticles: number;
}
interface BizRef {
  id: string;
  name: string;
  members: number;
  suspended: boolean;
  role: string;
  ownerEmail?: string | null;
}
interface UserDetail {
  kind: 'user';
  user: { id: string; email: string; name: string; role: string; active: boolean; createdAt: string };
  sub: SubInfo;
  orders: DetailOrder[];
  ownedBizes: BizRef[];
  memberBizes: BizRef[];
}
interface BizDetail {
  kind: 'biz';
  biz: { id: string; name: string; suspended: boolean; createdAt: string };
  owner: { id: string; email: string; name: string } | null;
  members: Array<{ userId: string; email: string | null; name: string | null; role: string }>;
  sub: SubInfo;
  orders: DetailOrder[];
}
type Detail = UserDetail | BizDetail;

export function EntityDetailModal({ initial, onClose }: { initial: DetailTarget | null; onClose: () => void }) {
  const t = useTranslations('admin');
  const tb = useTranslations('billing');
  const [view, setView] = useState<DetailTarget | null>(initial);
  const [stack, setStack] = useState<DetailTarget[]>([]);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Mở mới từ ngoài → đặt lại view + xóa lịch sử.
  useEffect(() => {
    setView(initial);
    setStack([]);
  }, [initial]);

  useEffect(() => {
    if (!view) {
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    setData(null);
    fetch(`/api/admin/detail?kind=${view.kind}&id=${encodeURIComponent(view.id)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!active) return;
        if (r.ok && d) setData(d as Detail);
        else setErr(apiErrText(d, t));
      })
      .catch(() => active && setErr(t('actionErr')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [view, t]);

  // Đi tới thực thể liên quan (đẩy lịch sử để có nút Quay lại).
  const goto = useCallback(
    (next: DetailTarget) => {
      setStack((s) => (view ? [...s, view] : s));
      setView(next);
    },
    [view],
  );
  const back = useCallback(() => {
    setStack((s) => {
      const prev = s[s.length - 1];
      if (prev) setView(prev);
      return s.slice(0, -1);
    });
  }, []);

  const planLabel = (p: PlanId | null) => (p ? tb(`plan.${p}`) : t('trialDefault'));
  const subLabel = (s: SubStatus | null) => (s ? t(`subStatus_${s}`) : t('trialDefault'));
  const orderTitle = (o: DetailOrder) =>
    o.type === 'subscription'
      ? `${planLabel(o.plan)} · ${o.months ?? '-'}${t('orderMonthUnit')}`
      : `${t('orderOverage')} +${o.overageArticles ?? 0}`;

  const subRow = (sub: SubInfo) => (
    <InlineStack gap="150" blockAlign="center" wrap>
      <Badge>{planLabel(sub.plan)}</Badge>
      <Badge tone={SUB_STATUS_TONE[sub.status ?? 'free']}>{subLabel(sub.status)}</Badge>
      {sub.overageArticles ? <Badge tone="attention">{`+${sub.overageArticles} ${t('orderArticlesShort')}`}</Badge> : null}
      <Text as="span" tone="subdued" variant="bodySm">
        {sub.status === 'trialing' && sub.trialEndsAt
          ? t('bizTrialEnds', { date: new Date(sub.trialEndsAt).toLocaleDateString() })
          : sub.currentPeriodEnd
            ? t('bizPeriodEnd', { date: new Date(sub.currentPeriodEnd).toLocaleDateString() })
            : ''}
      </Text>
    </InlineStack>
  );

  const orderList = (orders: DetailOrder[]) =>
    orders.length ? (
      <BlockStack gap="150">
        {orders.map((o) => (
          <Box key={o.id} padding="200" background="bg-surface-secondary" borderRadius="200">
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
          </Box>
        ))}
      </BlockStack>
    ) : (
      <Text as="span" tone="subdued" variant="bodySm">
        {t('bizNoOrders')}
      </Text>
    );

  const section = (title: string, node: React.ReactNode) => (
    <BlockStack gap="150">
      <Text as="h3" variant="headingSm">
        {title}
      </Text>
      {node}
    </BlockStack>
  );

  const bizRow = (b: BizRef) => (
    <InlineStack key={b.id} align="space-between" blockAlign="center" wrap gap="200">
      <InlineStack gap="150" blockAlign="center" wrap>
        <Button variant="plain" onClick={() => goto({ kind: 'biz', id: b.id })}>
          {b.name}
        </Button>
        <Badge>{t(`bizRole_${b.role}`)}</Badge>
        {b.suspended ? <Badge tone="critical">{t('suspended')}</Badge> : null}
        <Text as="span" tone="subdued" variant="bodySm">
          {t('bizMembers', { n: b.members })}
          {b.ownerEmail ? ` · ${b.ownerEmail}` : ''}
        </Text>
      </InlineStack>
    </InlineStack>
  );

  const title = data
    ? data.kind === 'user'
      ? `${t('detailUserTitle')}: ${data.user.name}`
      : `${t('detailBizTitle')}: ${data.biz.name}`
    : t('detailLoading');

  return (
    <Modal open={!!view} onClose={onClose} title={title} size="large" secondaryActions={[{ content: t('close'), onAction: onClose }]}>
      <Modal.Section>
        {stack.length ? (
          <Box paddingBlockEnd="300">
            <Button variant="plain" onClick={back}>
              ← {t('detailBack')}
            </Button>
          </Box>
        ) : null}
        {loading ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : err ? (
          <Text as="p" tone="critical">
            {err}
          </Text>
        ) : data?.kind === 'user' ? (
          <BlockStack gap="400">
            {section(
              t('detailInfo'),
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd" fontWeight="medium">
                  {data.user.name}{' '}
                  <Text as="span" tone="subdued" variant="bodySm">
                    {data.user.email}
                  </Text>
                </Text>
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Badge tone={data.user.active ? 'success' : 'critical'}>{data.user.active ? t('active') : t('suspended')}</Badge>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {data.user.role} · {new Date(data.user.createdAt).toLocaleDateString()}
                  </Text>
                </InlineStack>
              </BlockStack>,
            )}
            <Divider />
            {section(
              t('detailOwnedBizes', { n: data.ownedBizes.length }),
              data.ownedBizes.length ? <BlockStack gap="150">{data.ownedBizes.map(bizRow)}</BlockStack> : <Text as="span" tone="subdued" variant="bodySm">{t('detailNoBiz')}</Text>,
            )}
            {data.memberBizes.length ? (
              <>
                <Divider />
                {section(t('detailMemberBizes', { n: data.memberBizes.length }), <BlockStack gap="150">{data.memberBizes.map(bizRow)}</BlockStack>)}
              </>
            ) : null}
            <Divider />
            {section(t('bizOrders', { n: data.orders.length }), orderList(data.orders))}
          </BlockStack>
        ) : data?.kind === 'biz' ? (
          <BlockStack gap="400">
            {section(
              t('detailInfo'),
              <InlineStack gap="150" blockAlign="center" wrap>
                <Text as="span" variant="bodyMd" fontWeight="medium">
                  {data.biz.name}
                </Text>
                {data.biz.suspended ? <Badge tone="critical">{t('suspended')}</Badge> : <Badge tone="success">{t('active')}</Badge>}
                <Text as="span" tone="subdued" variant="bodySm">
                  {new Date(data.biz.createdAt).toLocaleDateString()}
                </Text>
              </InlineStack>,
            )}
            <Divider />
            {section(
              t('detailOwner'),
              data.owner ? (
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Button variant="plain" onClick={() => data.owner && goto({ kind: 'user', id: data.owner.id })}>
                    {data.owner.name}
                  </Button>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {data.owner.email}
                  </Text>
                </InlineStack>
              ) : (
                <Text as="span" tone="subdued" variant="bodySm">
                  —
                </Text>
              ),
            )}
            <Divider />
            {section(
              t('detailPlan'),
              <BlockStack gap="100">
                {subRow(data.sub)}
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('detailPlanOwnerNote')}
                </Text>
              </BlockStack>,
            )}
            <Divider />
            {section(
              t('detailMembers', { n: data.members.length }),
              <BlockStack gap="100">
                {data.members.map((m) => (
                  <InlineStack key={m.userId} gap="150" blockAlign="center" wrap>
                    <Button variant="plain" onClick={() => goto({ kind: 'user', id: m.userId })} disabled={!m.email}>
                      {m.name ?? m.userId}
                    </Button>
                    <Badge>{t(`bizRole_${m.role}`)}</Badge>
                    {m.email ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {m.email}
                      </Text>
                    ) : null}
                  </InlineStack>
                ))}
              </BlockStack>,
            )}
            <Divider />
            {section(t('bizOrders', { n: data.orders.length }), orderList(data.orders))}
          </BlockStack>
        ) : null}
      </Modal.Section>
    </Modal>
  );
}
