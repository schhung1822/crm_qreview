import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Security headers áp cho MỌI response. Lưu ý: KHÔNG đặt CSP hạn chế script/style ở đây vì Next
// (hydration) + Polaris chèn inline script/style → dễ vỡ nếu thiếu nonce; chỉ dùng directive
// frame-ancestors (chống clickjacking, không ảnh hưởng tải tài nguyên). CSP script/style đầy đủ
// (kèm nonce) là việc riêng cần kiểm thử trên app thật.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // HSTS: chỉ có tác dụng trên HTTPS; an toàn để gửi luôn (trình duyệt bỏ qua trên http).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const isVercel = process.env.VERCEL === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Không lộ phiên bản Next qua header X-Powered-By.
  poweredByHeader: false,
  // Output standalone chỉ dùng cho Docker/self-host. Trên Vercel, adapter của Vercel tự đóng gói
  // serverless functions; bật standalone có thể làm lệch file tracing (*.nft.json) sau build.
  ...(isVercel ? {} : { output: 'standalone' }),
  // TẮT hẳn Image Optimizer: codebase không dùng next/image (preview ảnh remote dùng <img>
  // thường), còn endpoint /_next/image + remotePatterns '**' là vector DoS
  // (GHSA-9g9p-9gw9-jx7f — kẻ tấn công bơm ảnh khổng lồ cho optimizer). unoptimized cũng
  // vô hiệu endpoint này. Nếu sau này cần next/image, bật lại với whitelist hostname cụ thể.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
