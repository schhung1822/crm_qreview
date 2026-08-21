'use client';

import { Page } from '@shopify/polaris';
import type { ReactNode } from 'react';

/**
 * Khung trang cho mọi màn hình quản trị website Qreview.
 *
 * Dùng `Page` của Polaris để lề, chiều rộng và nhịp dọc khớp với các trang khác
 * của CRM. `fullWidth` là bắt buộc: mặc định Polaris bó nội dung trong 998px,
 * quá hẹp cho bảng sản phẩm hay trình biên tập trang chủ. Chiều rộng thực sự
 * được siết lại bằng CSS (`.qreview-admin`) để form dài không kéo ngang cả màn.
 *
 * Là client component vì Polaris cần context của AppProvider/Frame — layout
 * (server component) không import trực tiếp được.
 */
export function QreviewPageShell({ children }: { children: ReactNode }) {
  return <Page fullWidth>{children}</Page>;
}
