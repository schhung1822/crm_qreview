// Ngữ cảnh "biz đang hoạt động" theo TỪNG REQUEST, dùng AsyncLocalStorage (an toàn đồng thời:
// mỗi request là một async-context riêng, không lẫn sang request khác). guard() sẽ nạp ngữ cảnh
// này; các store dữ liệu-thuộc-biz đọc bizId từ đây để trỏ đúng thư mục .data/biz/<bizId>/.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface BizContext {
  userId: string;
  bizId: string;
}

export const bizContext = new AsyncLocalStorage<BizContext>();

export function currentBizId(): string | undefined {
  return bizContext.getStore()?.bizId;
}

// Đặt ngữ cảnh cho phần còn lại của request hiện tại (gọi trong guard). enterWith gắn store vào
// async-context hiện tại và các lời gọi bất đồng bộ tiếp theo trong CÙNG request.
export function setBizContext(ctx: BizContext): void {
  bizContext.enterWith(ctx);
}

// Chạy fn TRONG ngữ cảnh biz (bao trọn - đáng tin cậy hơn enterWith khi cần cô lập chắc chắn).
// Dùng cho luồng không có cookie sg_biz nhưng vẫn cần store trỏ đúng biz (vd: quên mật khẩu).
export function runWithBiz<T>(ctx: BizContext, fn: () => Promise<T>): Promise<T> {
  return bizContext.run(ctx, fn);
}
