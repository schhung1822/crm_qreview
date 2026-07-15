// Mã giảm giá (coupon) - .data/coupons.json toàn cục. Server-only.
import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import type { PlanId } from './plans';

export type CouponType = 'percent' | 'fixed';
export type Currency = 'VND' | 'USD';

export interface Coupon {
  code: string; // duy nhất, viết HOA
  type: CouponType;
  value: number; // percent: 1-100; fixed: số tiền theo currency
  currency?: Currency; // chỉ dùng cho fixed (khớp tiền tệ đơn hàng)
  maxUses: number; // 0 = không giới hạn
  usedCount: number;
  expiresAt?: string; // ISO; vắng = không hết hạn
  plans?: PlanId[]; // vắng/rỗng = áp mọi gói
  active: boolean;
  createdAt: string;
}

type Store = Record<string, Coupon>; // key = code (HOA)
const FILE = globalFile('coupons.json');

const norm = (code: string) => code.trim().toUpperCase();

export async function listCoupons(): Promise<Coupon[]> {
  const store = await readJson<Store>(FILE, {});
  return Object.values(store).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getCoupon(code: string): Promise<Coupon | null> {
  const store = await readJson<Store>(FILE, {});
  return store[norm(code)] ?? null;
}

export async function upsertCoupon(
  input: Omit<Coupon, 'usedCount' | 'createdAt'> & { usedCount?: number },
): Promise<Coupon> {
  const code = norm(input.code);
  return mutateJson<Store, Coupon>(FILE, {}, (cur) => {
    const existing = cur[code];
    const next: Coupon = {
      ...input,
      code,
      usedCount: input.usedCount ?? existing?.usedCount ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    cur[code] = next;
    return [cur, next];
  });
}

export async function deleteCoupon(code: string): Promise<void> {
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    delete cur[norm(code)];
    return [cur, undefined];
  });
}

export async function incrementCouponUse(code: string): Promise<void> {
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    const c = cur[norm(code)];
    if (c) c.usedCount += 1;
    return [cur, undefined];
  });
}

// TRẢ LẠI 1 lượt coupon (floor 0). Dùng khi tạo đơn thất bại SAU khi đã claim, hoặc khi đơn có
// coupon bị hủy/hoàn tiền → không "ăn oan" lượt của mã.
export async function releaseCouponUse(code: string): Promise<void> {
  await mutateJson<Store, void>(FILE, {}, (cur) => {
    const c = cur[norm(code)];
    if (c && c.usedCount > 0) c.usedCount -= 1;
    return [cur, undefined];
  });
}

// Kiểm hợp lệ + CHIẾM (tăng usedCount) 1 lượt coupon NGUYÊN TỬ trong CÙNG một giao dịch.
// Chống race check-then-act: nhiều đơn song song cùng đọc usedCount cũ rồi đều "qua cửa" (đặc biệt
// mã percent=100 tạo đơn 0đ tự cấp gói). Vì lượt được chiếm ngay tại đây nên chỉ đúng maxUses đơn
// đi tiếp. Trả discount nếu chiếm được; ok=false nếu hết lượt/không hợp lệ (đơn KHÔNG được tạo).
export async function claimCoupon(
  code: string,
  plan: PlanId,
  amount: number,
  currency: Currency,
): Promise<CouponCheck> {
  const key = norm(code);
  return mutateJson<Store, CouponCheck>(FILE, {}, (cur) => {
    const c = cur[key];
    if (!c || !c.active) return [cur, { ok: false, reason: 'Mã không tồn tại hoặc đã tắt.', discount: 0 }];
    if (c.expiresAt && Date.parse(c.expiresAt) < Date.now())
      return [cur, { ok: false, reason: 'Mã đã hết hạn.', discount: 0 }];
    if (c.maxUses > 0 && c.usedCount >= c.maxUses)
      return [cur, { ok: false, reason: 'Mã đã hết lượt sử dụng.', discount: 0 }];
    if (c.plans && c.plans.length > 0 && !c.plans.includes(plan))
      return [cur, { ok: false, reason: 'Mã không áp dụng cho gói này.', discount: 0 }];
    let discount = 0;
    if (c.type === 'percent') discount = Math.round((amount * Math.min(100, c.value)) / 100);
    else {
      if (c.currency && c.currency !== currency)
        return [cur, { ok: false, reason: 'Mã không đúng đơn vị tiền tệ.', discount: 0 }];
      discount = c.value;
    }
    discount = Math.min(discount, amount);
    c.usedCount += 1; // CHIẾM lượt ngay trong cùng giao dịch (nguyên tử)
    cur[key] = c;
    return [cur, { ok: true, discount, coupon: c }];
  });
}

export interface CouponCheck {
  ok: boolean;
  reason?: string;
  discount: number; // số tiền giảm (theo currency đơn hàng)
  coupon?: Coupon;
}

// Kiểm coupon cho 1 đơn: đúng gói, còn hạn, còn lượt, khớp tiền tệ (với fixed). Trả số tiền giảm.
export async function validateCoupon(
  code: string,
  plan: PlanId,
  amount: number,
  currency: Currency,
): Promise<CouponCheck> {
  const c = await getCoupon(code);
  if (!c || !c.active) return { ok: false, reason: 'Mã không tồn tại hoặc đã tắt.', discount: 0 };
  if (c.expiresAt && Date.parse(c.expiresAt) < Date.now())
    return { ok: false, reason: 'Mã đã hết hạn.', discount: 0 };
  if (c.maxUses > 0 && c.usedCount >= c.maxUses)
    return { ok: false, reason: 'Mã đã hết lượt sử dụng.', discount: 0 };
  if (c.plans && c.plans.length > 0 && !c.plans.includes(plan))
    return { ok: false, reason: 'Mã không áp dụng cho gói này.', discount: 0 };
  let discount = 0;
  if (c.type === 'percent') discount = Math.round((amount * Math.min(100, c.value)) / 100);
  else {
    if (c.currency && c.currency !== currency)
      return { ok: false, reason: 'Mã không đúng đơn vị tiền tệ.', discount: 0 };
    discount = c.value;
  }
  discount = Math.min(discount, amount); // không âm
  return { ok: true, discount, coupon: c };
}

export function genCouponCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

// Chặn footgun coupon "miễn phí + vô hạn": mã giảm 100% tạo đơn 0đ TỰ kích hoạt gói cao, nên nếu
// dùng vô hạn (maxUses=0) mà mã bị lộ/đoán được thì bất kỳ ai cũng tự cấp gói cao 0đ không giới hạn.
// PHẢI có giới hạn số lần dùng (maxUses hữu hạn) cho mã giảm 100%. Trả message lỗi nếu vi phạm, else null.
export function couponSafetyError(input: Pick<Coupon, 'type' | 'value' | 'maxUses'>): string | null {
  const unlimited = !input.maxUses || input.maxUses <= 0;
  if (input.type === 'percent' && input.value >= 100 && unlimited) {
    return 'Mã giảm 100% phải có giới hạn số lần dùng (maxUses > 0) để tránh bị lạm dụng cấp gói miễn phí không giới hạn.';
  }
  return null;
}
