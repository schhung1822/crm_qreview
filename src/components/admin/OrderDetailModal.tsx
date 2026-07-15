'use client';

import { Badge, BlockStack, Divider, InlineStack, Modal, Text } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { ORDER_STATUS_TONE, type OrderStatus } from '@/lib/billing/order-ui';
import type { PlanId } from '@/lib/billing/plans';

export interface OrderDetailData {
  id: string;
  payCode: string;
  userEmail?: string;
  phone?: string | null;
  type: 'subscription' | 'overage';
  plan?: PlanId | null;
  months?: number | null;
  overageArticles?: number | null;
  amount?: number;
  discount?: number;
  total: number;
  currency: string;
  couponCode?: string | null;
  status: OrderStatus;
  note?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string } | null;
  createdAt: string;
  paidAt?: string | null;
}


// Popup CHI TIẾT 1 đơn hàng (chỉ xem). Dùng ở tab Biz khi bấm vào 1 đơn trong danh sách.
export function OrderDetailModal({ order, onClose }: { order: OrderDetailData | null; onClose: () => void }) {
  const t = useTranslations('admin');
  const tb = useTranslations('billing');
  if (!order) return null;

  const planLabel = order.plan ? tb(`plan.${order.plan}`) : '-';
  const rows: Array<[string, string]> = [
    ...(order.userEmail ? ([[t('orderUser'), order.userEmail]] as Array<[string, string]>) : []),
    ...(order.phone ? ([[t('orderPhone'), order.phone]] as Array<[string, string]>) : []),
    [t('orderType'), order.type === 'subscription' ? t('orderSub') : t('orderOverage')],
    ...(order.type === 'subscription'
      ? ([
          [t('planLabel'), planLabel],
          [t('orderCycle'), `${order.months ?? '-'}${t('orderMonthUnit')}`],
        ] as Array<[string, string]>)
      : ([[t('orderArticles'), `+${order.overageArticles ?? 0}`]] as Array<[string, string]>)),
    ...(order.amount !== undefined ? ([[t('orderAmount'), `${order.amount.toLocaleString()} ${order.currency}`]] as Array<[string, string]>) : []),
    ...(order.discount
      ? ([[t('orderDiscount'), `−${order.discount.toLocaleString()} ${order.currency}${order.couponCode ? ` (${order.couponCode})` : ''}`]] as Array<[string, string]>)
      : []),
    [t('orderTotal'), `${order.total.toLocaleString()} ${order.currency}`],
    [t('orderPayCode'), order.payCode],
    [t('orderCreatedAt'), new Date(order.createdAt).toLocaleString()],
    ...(order.paidAt ? ([[t('orderPaidAt'), new Date(order.paidAt).toLocaleString()]] as Array<[string, string]>) : []),
    ...(order.note ? ([[t('orderNote'), order.note]] as Array<[string, string]>) : []),
  ];

  const hasUtm = order.utm && Object.values(order.utm).some(Boolean);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('orderDetail')} · ${order.id}`}
      secondaryActions={[{ content: t('close'), onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" tone="subdued" variant="bodySm">
              {t('orderStatusLabel')}
            </Text>
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(`orderStatus_${order.status}`)}</Badge>
          </InlineStack>
          {rows.map(([label, value], i) => (
            <InlineStack key={i} align="space-between" blockAlign="center" wrap gap="200">
              <Text as="span" tone="subdued" variant="bodySm">
                {label}
              </Text>
              <Text as="span" variant="bodySm" fontWeight="medium">
                {value}
              </Text>
            </InlineStack>
          ))}

          <Divider />
          <Text as="span" variant="headingSm">
            {t('orderUtm')}
          </Text>
          {hasUtm ? (
            (['source', 'medium', 'campaign', 'content', 'term'] as const)
              .filter((k) => order.utm?.[k])
              .map((k) => (
                <InlineStack key={k} align="space-between" gap="200">
                  <Text as="span" tone="subdued" variant="bodySm">
                    utm_{k}
                  </Text>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    {order.utm?.[k]}
                  </Text>
                </InlineStack>
              ))
          ) : (
            <Text as="span" tone="subdued" variant="bodySm">
              {t('orderNoUtm')}
            </Text>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
