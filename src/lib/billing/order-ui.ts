// Bảng màu (Polaris Badge tone) DÙNG CHUNG cho trạng thái đơn hàng + trạng thái subscription.
// Trước đây bị copy-paste ở OrdersAdmin/BizAdmin/EntityDetailModal/OrderDetailModal và đã lệch tên
// (STATUS_TONE vs ORDER_TONE) → gom về một nguồn để thêm/đổi trạng thái chỉ sửa một chỗ.
export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded';
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'free';
type Tone = 'success' | 'attention' | 'critical' | 'info' | undefined;

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  paid: 'success',
  pending: 'attention',
  canceled: undefined,
  refunded: 'critical',
};

export const SUB_STATUS_TONE: Record<SubStatus, Tone> = {
  active: 'success',
  trialing: 'info',
  past_due: 'attention',
  canceled: 'critical',
  free: undefined,
};
