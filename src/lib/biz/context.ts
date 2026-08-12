// Lớp tương thích tạm thời cho các worker/API cũ. Dự án chỉ còn một workspace nên
// không cần AsyncLocalStorage hay khóa tenant; callback luôn chạy trực tiếp.
export interface BizContext {
  userId: string;
  bizId?: string;
}

export function currentBizId(): undefined {
  return undefined;
}

export function setBizContext(): void {}

export function runWithBiz<T>(_ctx: BizContext, fn: () => Promise<T>): Promise<T> {
  return fn();
}
