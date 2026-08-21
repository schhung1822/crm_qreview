import type { Config } from 'tailwindcss';

/**
 * Tailwind CHỈ phục vụ khu quản trị website Qreview (`/qreview`).
 *
 * Phần còn lại của CRM dùng Shopify Polaris và KHÔNG được Tailwind chạm tới:
 *   - `content` chỉ quét đúng hai thư mục của khu quản trị, nên utility của
 *     màn hình khác không bao giờ được sinh ra.
 *   - `preflight` tắt hẳn. Preflight là bản reset toàn cục (bỏ margin, đổi
 *     box-sizing, gỡ style mặc định của heading/list...) — bật lên sẽ phá bố
 *     cục của Polaris trên MỌI trang, kể cả trang không liên quan.
 *
 * Màu sắc bắc cầu qua token Polaris (`--p-color-*`) thay vì ghi cứng, nhờ đó
 * khu quản trị tự đổi theo màu thương hiệu mà superadmin đặt trong "Thông tin
 * hệ thống" (xem `src/lib/branding/theme.ts`).
 */
const config: Config = {
  // Dùng `**/qreview/**` thay vì `[locale]`: dấu ngoặc vuông trong glob là lớp
  // ký tự, đường dẫn thật sẽ không khớp.
  content: [
    './src/app/**/qreview/**/*.{ts,tsx}',
    './src/components/qreview/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Hai tên màu này đến từ bảng màu riêng của dự án Qreview cũ. Giữ tên
        // để không phải sửa component, nhưng trỏ về token Polaris.
        'gray-4': 'var(--p-color-border, #e3e3e3)',
        blue: 'var(--p-color-text-emphasis, #005bd3)',
      },
    },
  },
};

export default config;
