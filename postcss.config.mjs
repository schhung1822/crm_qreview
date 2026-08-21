/**
 * Chỉ tồn tại để biên dịch `src/app/[locale]/qreview/qreview-admin.css` — file
 * CSS duy nhất trong dự án dùng chỉ thị `@tailwind` / `@apply`.
 *
 * Các file CSS khác (globals.css, styles.css của Polaris) đi qua đây nguyên
 * vẹn: plugin Tailwind chỉ biến đổi file có chỉ thị của nó. `autoprefixer`
 * được khai báo lại vì việc tự viết postcss.config sẽ thay thế cấu hình mặc
 * định của Next — thiếu nó là mất tiền tố trình duyệt trên toàn bộ CSS.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
