// Đơn hàng (order) - .data/orders.json toàn cục. Ghi nhận giao dịch mua gói/mua thêm bài.
// Chưa nối cổng thanh toán → superadmin tạo & đánh dấu "đã thanh toán" thủ công (hoặc webhook sau).
import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { sendPlatformEvent } from '../store/platform-email';
import { sendPurchaseEvent } from '../tracking/conversion';
import { releaseCouponUse, type Currency } from './coupons';
import type { PlanId } from './plans';
import { addOverageArticles, setSubscription } from './subscription';

const loginUrl = () => (process.env.APP_URL ? `${process.env.APP_URL}/login` : '');

export type OrderType = 'subscription' | 'overage';
export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded';

// UTM tracking - nguồn khách đến khi tạo đơn (đo hiệu quả marketing).
export interface OrderUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  type: OrderType;
  plan?: PlanId; // với subscription
  months?: number; // với subscription: 3 / 6 / 12
  overageArticles?: number; // với overage
  currency: Currency;
  amount: number; // giá gốc
  couponCode?: string;
  discount: number;
  total: number; // amount - discount
  status: OrderStatus;
  payCode: string; // mã ngắn (HOA) để khớp nội dung chuyển khoản Sepay
  phone?: string; // sđt liên hệ (khách nhập khi thanh toán) - phục vụ tìm kiếm + hỗ trợ
  utm?: OrderUtm;
  note?: string;
  // Đơn đã 'paid' nhưng bước kích hoạt (gói/overage/coupon) THẤT BẠI → cần admin xử lý lại.
  // Vắng mặt = kích hoạt OK.
  activationError?: string;
  createdAt: string;
  paidAt?: string;
}

type Store = Record<string, Order>;
const FILE = globalFile('orders.json');
const DAY = 86_400_000;

export async function listOrders(): Promise<Order[]> {
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOrder(id: string): Promise<Order | null> {
  return (await readJson<Store>(FILE, {}))[id] ?? null;
}

export async function createOrder(
  input: Omit<Order, 'id' | 'status' | 'createdAt' | 'paidAt' | 'payCode'>,
): Promise<Order> {
  const order: Order = {
    ...input,
    id: 'ord_' + randomBytes(8).toString('hex'),
    // 8 hex (32-bit) để giảm mạnh khả năng trùng/khớp nhầm đơn khi webhook dò theo nội dung CK.
    payCode: randomBytes(4).toString('hex').toUpperCase(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    cur[order.id] = order;
    return [cur, undefined];
  });
  // Đơn 0đ (vd áp mã giảm 100%) → TỰ ĐỘNG kích hoạt luôn, không cần chuyển khoản.
  if (order.total <= 0) {
    return (await setOrderStatus(order.id, 'paid')) ?? order;
  }
  return order;
}

// Tìm đơn ĐANG CHỜ khớp nội dung chuyển khoản (chuẩn hóa: HOA + bỏ ký tự không alphanumeric,
// rồi kiểm chứa payCode). Dùng cho webhook Sepay tự động xác nhận.
export async function findPendingOrderByContent(content: string): Promise<Order | null> {
  const norm = (content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;
  const orders = await listOrders();
  return (
    orders.find((o) => o.status === 'pending' && o.payCode && norm.includes(o.payCode)) ?? null
  );
}

// Đổi trạng thái đơn. Khi CHUYỂN LẦN ĐẦU sang 'paid': kích hoạt gói/cộng overage. (Lượt coupon đã
// được CHIẾM nguyên tử ngay khi tạo đơn - xem claimCoupon - nên KHÔNG tăng lại ở đây.)
// Khi chuyển sang 'canceled'/'refunded' lần đầu: TRẢ LẠI lượt coupon (nếu đơn có mã).
export async function setOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const res = await mutateJson<Store, { order: Order; justPaid: boolean; justReleased: boolean } | null>(
    FILE,
    {},
    (cur) => {
      const o = cur[id];
      if (!o) return [cur, null];
      const wasTerminal = o.status === 'canceled' || o.status === 'refunded';
      const justPaid = status === 'paid' && o.status !== 'paid';
      // Chỉ trả lượt khi CHUYỂN sang trạng thái kết thúc-âm lần đầu (tránh trả trùng khi gọi lặp).
      const justReleased =
        (status === 'canceled' || status === 'refunded') && !wasTerminal && !!o.couponCode;
      o.status = status;
      if (justPaid) o.paidAt = new Date().toISOString();
      cur[id] = o;
      return [cur, { order: o, justPaid, justReleased }];
    },
  );
  if (!res) return null;
  const { order, justPaid, justReleased } = res;

  // Trả lại lượt coupon cho đơn bị hủy/hoàn (đơn từng chiếm 1 lượt lúc tạo).
  if (justReleased && order.couponCode) {
    try {
      await releaseCouponUse(order.couponCode);
    } catch (e) {
      console.warn('[setOrderStatus] trả lượt coupon lỗi', { orderId: id }, e);
    }
  }

  // Kích hoạt CHỈ ở lần chuyển sang paid đầu tiên (tránh cộng dồn/tăng coupon nhiều lần).
  if (justPaid) {
    // Bọc try/catch: nếu 1 bước lỗi vẫn KHÔNG ném ra (đơn đã 'paid') - log để xử lý thủ công,
    // tránh làm webhook trả 500 khiến Sepay retry rồi kích hoạt trùng.
    let activationError: string | undefined;
    try {
      if (order.type === 'subscription' && order.plan) {
        const months = order.months ?? 1;
        await setSubscription(order.userId, {
          plan: order.plan,
          status: 'active',
          billingCycle: months >= 12 ? 'yearly' : 'monthly',
          currentPeriodEnd: new Date(Date.now() + months * 30 * DAY).toISOString(),
        });
      } else if (order.type === 'overage' && order.overageArticles) {
        await addOverageArticles(order.userId, order.overageArticles);
      }
      // Lượt coupon đã được chiếm khi tạo đơn (claimCoupon) → không tăng lại ở đây.
    } catch (e) {
      activationError = e instanceof Error ? e.message : 'activation error';
      console.error('[setOrderStatus] kích hoạt sau thanh toán lỗi', { orderId: id }, e);
    }
    // GHI CỜ để admin THẤY đơn "đã trả nhưng CHƯA kích hoạt" (thay vì lỗi âm thầm). Kích hoạt OK
    // thì xóa cờ (phòng khi retry thành công).
    await mutateJson<Store, void>(FILE, {}, (cur) => {
      const o2 = cur[id];
      if (o2) {
        if (activationError) o2.activationError = activationError;
        else delete o2.activationError;
        cur[id] = o2;
      }
      return [cur, undefined];
    });
    order.activationError = activationError;
    // Email biên nhận (nếu SMTP nền tảng + sự kiện được bật). Fire-and-forget - log nếu lỗi.
    void sendPlatformEvent('paymentReceived', order.userEmail, {
      name: order.userEmail,
      plan: order.plan ?? 'overage',
      amount: order.total.toLocaleString('vi-VN'),
      currency: order.currency,
      orderId: order.id,
      loginUrl: loginUrl(),
    }).then((r) => {
      if (!r.sent && r.error) console.warn('[paymentReceived email]', r.error, { orderId: id });
    });

    // Gửi sự kiện MUA HÀNG lên Conversion API (Facebook dataset + TikTok). Fire-and-forget.
    void sendPurchaseEvent({
      eventId: order.id,
      email: order.userEmail,
      phone: order.phone,
      value: order.total,
      currency: order.currency,
      contentId: order.plan ?? 'overage',
    })
      .then((r) => {
        const bad = [...r.fb, ...r.tt, r.ga4].filter((x) => x.error && x.error !== 'not-configured');
        for (const x of bad) console.warn('[purchase capi]', x.label, x.error, { orderId: id });
      })
      .catch((e) => console.warn('[purchase capi]', e, { orderId: id }));
  }
  return order;
}
