// Đăng ký gói (subscription) theo TÀI KHOẢN CHỦ - lưu toàn cục .data/subscriptions.json. Server-only.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import type { PlanId } from './plans';

export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'free';

export interface Subscription {
  userId: string;
  plan: PlanId;
  status: SubStatus;
  billingCycle: 'monthly' | 'yearly';
  trialEndsAt?: string; // ISO - hết hạn dùng thử
  currentPeriodEnd?: string; // ISO - hết kỳ đã trả (dùng khi nối thanh toán)
  overageArticles?: number; // số bài mua thêm còn dùng trong kỳ
  unlimitedArticles?: boolean; // superadmin cấp: KHÔNG giới hạn bài AI (bỏ qua cap của gói)
  updatedAt: string;
}

type Store = Record<string, Subscription>;
const FILE = globalFile('subscriptions.json');
const TRIAL_DAYS = 14;
const DAY = 86_400_000;
// Thời gian ân hạn sau khi hết kỳ đã trả: trong khoảng này vẫn giữ quyền lợi gói nhưng đánh dấu
// past_due (UI nhắc gia hạn); quá ân hạn mà chưa gia hạn → hạ hẳn về Free.
const GRACE_DAYS = 3;

function isExpired(iso: string | undefined, graceDays = 0): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t + graceDays * DAY < Date.now();
}

// Plan HIỆU LỰC: tính khi ĐỌC (KHÔNG ghi lại, tránh ghi mỗi lần). Xử lý cả 2 kiểu hết hạn:
//  1) Hết dùng thử → Free.
//  2) Gói ĐÃ TRẢ TIỀN hết kỳ mà CHƯA gia hạn → trong ân hạn: past_due (giữ quyền lợi tạm);
//     quá ân hạn: hạ về Free (ngừng quyền lợi gói + xóa overage/unlimited của kỳ cũ).
// Không cưỡng chế mốc currentPeriodEnd ở đây thì gói hết hạn vẫn "active" vĩnh viễn → rò doanh thu.
function effective(s: Subscription): Subscription {
  if (s.status === 'trialing' && isExpired(s.trialEndsAt)) {
    return { ...s, plan: 'free', status: 'free' };
  }
  if ((s.status === 'active' || s.status === 'past_due') && s.currentPeriodEnd) {
    if (isExpired(s.currentPeriodEnd, GRACE_DAYS)) {
      return { ...s, plan: 'free', status: 'free', unlimitedArticles: false, overageArticles: 0 };
    }
    if (isExpired(s.currentPeriodEnd)) {
      return { ...s, status: 'past_due' };
    }
  }
  return s;
}

// Các subscription SẮP hết hạn trong `days` ngày tới (và chưa hết) — dùng cho job nhắc gia hạn.
// Trả về sau khi đã áp effective() (bỏ qua bản đã về free/hết hạn).
export async function listExpiringSubscriptions(days: number): Promise<Subscription[]> {
  const store = await readJson<Store>(FILE, {});
  const now = Date.now();
  const horizon = now + days * DAY;
  return Object.values(store)
    .map(effective)
    .filter((s) => {
      if (s.status !== 'active' && s.status !== 'trialing') return false;
      const endIso = s.status === 'trialing' ? s.trialEndsAt : s.currentPeriodEnd;
      if (!endIso) return false;
      const t = Date.parse(endIso);
      return Number.isFinite(t) && t > now && t <= horizon;
    });
}

// Đọc subscription. Tài khoản CHƯA có bản ghi → tạo DÙNG THỬ PRO 14 NGÀY (ghi 1 lần duy nhất).
export async function getSubscription(userId: string): Promise<Subscription> {
  const store = await readJson<Store>(FILE, {});
  const existing = store[userId];
  if (existing) return effective(existing);
  const now = Date.now();
  const created: Subscription = {
    userId,
    plan: 'pro',
    status: 'trialing',
    billingCycle: 'monthly',
    trialEndsAt: new Date(now + TRIAL_DAYS * DAY).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    if (!cur[userId]) cur[userId] = created; // tránh ghi đè nếu 2 request đua nhau
    return [cur, undefined];
  });
  return created;
}

// Đặt/đổi gói (superadmin gán, hoặc sau này webhook thanh toán). Trả bản ghi mới.
export async function setSubscription(
  userId: string,
  patch: Partial<Omit<Subscription, 'userId' | 'updatedAt'>>,
): Promise<Subscription> {
  return mutateJson<Store, Subscription>(FILE, {}, (cur) => {
    const base: Subscription = cur[userId] ?? {
      userId,
      plan: 'free',
      status: 'free',
      billingCycle: 'monthly',
      updatedAt: '',
    };
    const next: Subscription = { ...base, ...patch, userId, updatedAt: new Date().toISOString() };
    cur[userId] = next;
    return [cur, next];
  });
}

export async function addOverageArticles(userId: string, n: number): Promise<void> {
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    // UPSERT: nếu tài khoản CHƯA có bản ghi subscription (dùng thử mặc định tính lười, chưa ghi) thì
    // TẠO bản ghi để cộng overage - tránh mất số bài đã mua/được cấp.
    const base: Subscription = cur[userId] ?? {
      userId,
      plan: 'free',
      status: 'free',
      billingCycle: 'monthly',
      updatedAt: '',
    };
    base.overageArticles = Math.max(0, (base.overageArticles ?? 0) + n);
    base.updatedAt = new Date().toISOString();
    cur[userId] = base;
    return [cur, undefined];
  });
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).map(effective);
}
