'use client';

import { Page } from '@shopify/polaris';
import type { ReactNode } from 'react';

/**
 * Khung trang cho mọi màn hình quản trị website Qreview.
 *
 * Dùng `Page` của Polaris để lề, chiều rộng và nhịp dọc khớp với các trang khác
 * của CRM.
 *
 * KHÔNG dùng `fullWidth`. Trước đây khu này bật `fullWidth` để thoát cái trần
 * 998px mặc định của Polaris, rồi tự đặt lại chiều rộng bằng CSS riêng — nên
 * `/qreview` rộng khác phần còn lại của CRM. Giờ `globals.css` đã nới mọi
 * `Page` thường lên `min(94vw, 1680px)` trên màn hình từ 48em, đủ rộng cho cả
 * bảng sản phẩm lẫn trình biên tập trang chủ. Bỏ `fullWidth` đi thì khu quản
 * trị ăn thẳng quy tắc đó, không còn con số nào phải giữ đồng bộ bằng tay.
 *
 * Là client component vì Polaris cần context của AppProvider/Frame — layout
 * (server component) không import trực tiếp được.
 */
export function QreviewPageShell({ children }: { children: ReactNode }) {
  return <Page>{children}</Page>;
}
