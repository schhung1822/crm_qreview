// Ghi sự kiện MIỀN THANH TOÁN vào DB: SubscriptionEvent (vòng đời gói) + PaymentTransaction (đối
// soát giao dịch Sepay). Fire-and-forget, không ném lỗi ra luồng thanh toán. Server-only.
import { randomBytes } from 'node:crypto';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';

const isDb = () => storageDriver() === 'prisma';

export interface SubscriptionEventInput {
  userId: string;
  orderId?: string;
  eventType: string; // activated | renewed | upgraded | downgraded | overage_added | expired | canceled
  fromPlan?: string;
  toPlan?: string;
  fromStatus?: string;
  toStatus?: string;
  periodStart?: Date | string;
  periodEnd?: Date | string;
  metadata?: Record<string, unknown>;
}

export function recordSubscriptionEvent(i: SubscriptionEventInput): void {
  if (!isDb() || !i.userId) return;
  void (async () => {
    try {
      await prisma.subscriptionEvent.create({
        data: {
          id: 'sev_' + randomBytes(12).toString('hex'),
          userId: i.userId,
          orderId: i.orderId ?? null,
          eventType: i.eventType,
          fromPlan: i.fromPlan ?? null,
          toPlan: i.toPlan ?? null,
          fromStatus: i.fromStatus ?? null,
          toStatus: i.toStatus ?? null,
          periodStart: i.periodStart ? new Date(i.periodStart) : null,
          periodEnd: i.periodEnd ? new Date(i.periodEnd) : null,
          metadata: (i.metadata as object) ?? undefined,
        },
      });
    } catch (e) {
      console.warn('[tracking] subscriptionEvent failed:', (e as Error).message);
    }
  })();
}

export interface PaymentTransactionInput {
  orderId: string;
  provider?: string; // 'sepay'
  providerTransactionId?: string;
  type?: string; // 'payment' | 'refund'
  status: string; // 'success' | 'pending' | 'failed'
  currency: string;
  amount: number;
  matchedAmount?: number;
  payCode?: string;
  bankCode?: string;
  bankAccount?: string;
  transferContent?: string;
  rawPayload?: unknown;
  processedAt?: Date | string;
}

export function recordPaymentTransaction(i: PaymentTransactionInput): void {
  if (!isDb() || !i.orderId) return;
  void (async () => {
    try {
      await prisma.paymentTransaction.create({
        data: {
          id: 'ptx_' + randomBytes(12).toString('hex'),
          orderId: i.orderId,
          provider: i.provider ?? 'sepay',
          providerTransactionId: i.providerTransactionId ?? null,
          type: i.type ?? 'payment',
          status: i.status,
          currency: i.currency,
          amount: Math.round(i.amount),
          matchedAmount: i.matchedAmount != null ? Math.round(i.matchedAmount) : null,
          payCode: i.payCode ?? null,
          bankCode: i.bankCode ?? null,
          bankAccount: i.bankAccount ?? null,
          transferContent: i.transferContent ?? null,
          rawPayload: (i.rawPayload as object) ?? undefined,
          processedAt: i.processedAt ? new Date(i.processedAt) : null,
        },
      });
    } catch (e) {
      console.warn('[tracking] paymentTransaction failed:', (e as Error).message);
    }
  })();
}
