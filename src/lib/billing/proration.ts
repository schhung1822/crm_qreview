// Tính TÍN DỤNG CÒN LẠI (proration) khi nâng gói: nếu tài khoản đang có gói TRẢ PHÍ CÒN HẠN thì
// phần giá trị chưa dùng của gói hiện tại được trừ vào đơn nâng cấp; nếu đang ở gói FREE hoặc đã
// HẾT HẠN thì tín dụng = 0 → phải trả 100% giá gói mới.
import type { Plan } from './plans';
import type { Subscription } from './subscription';

const DAY = 86_400_000;

// Giá trị (VND) của số NGÀY còn lại trên gói trả phí hiện tại. Quy tắc:
// - Chỉ gói đang 'active' + còn hạn (currentPeriodEnd ở tương lai) mới có tín dụng.
// - free / trialing / past_due / canceled / hết hạn → 0.
// - Đơn giá ngày = giá THÁNG của gói hiện tại / 30; tín dụng = đơn giá ngày × số ngày còn lại.
export function remainingPlanCredit(
  sub: Subscription | null,
  currentPlan: Plan,
  now: number = Date.now(),
): number {
  if (!sub || sub.status !== 'active') return 0;
  if (currentPlan.id === 'free' || currentPlan.priceVndMonthly <= 0) return 0;
  const end = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : NaN;
  if (!Number.isFinite(end) || end <= now) return 0;
  const remainingDays = (end - now) / DAY;
  const dailyRate = currentPlan.priceVndMonthly / 30;
  return Math.max(0, Math.round(dailyRate * remainingDays));
}
