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

function configuredHttpBase(raw, variableName) {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return '';

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} phải là URL tuyệt đối hợp lệ.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${variableName} chỉ được dùng http hoặc https.`);
  }

  return value;
}

// Server/rewrite dùng biến runtime riêng; NEXT_PUBLIC chỉ là fallback tương
// thích. Trên VPS, docker-compose.vps.yml đặt QREVIEW_SITE_URL=qreview.asia.
const qreviewSiteBase = configuredHttpBase(
  process.env.QREVIEW_SITE_URL || process.env.NEXT_PUBLIC_QREVIEW_SITE_URL,
  'QREVIEW_SITE_URL'
);
const crmSiteBase = configuredHttpBase(process.env.APP_URL, 'APP_URL');

if (
  qreviewSiteBase &&
  crmSiteBase &&
  new URL(qreviewSiteBase).origin === new URL(crmSiteBase).origin
) {
  throw new Error(
    'QREVIEW_SITE_URL đang trỏ về chính APP_URL của CRM. Hãy dùng domain website, ví dụ https://qreview.asia.'
  );
}

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
  // Hai route pháp lý đọc nội dung từ file gốc ở project root. Khai báo rõ để Next đóng gói chúng
  // vào output standalone (Docker/VPS), tránh chỉ hoạt động ở môi trường phát triển.
  outputFileTracingIncludes: {
    '/term': ['./term.md'],
    '/privacy': ['./privacy.md'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  /**
   * Anh cua WEBSITE Qreview duoc luu trong CSDL duoi dang duong dan tuong doi
   * (`/images/products/abc.webp`). Khu quan tri /qreview gio chay trong CRM nen
   * nhung duong dan do se tro nham vao ten mien CRM va anh hien ra vo het.
   *
   * Rewrite nay chuyen tiep chung ve website. Chi khop duong dan co IT NHAT hai
   * doan (`/images/<thu-muc>/<tep>`) — anh cua chinh CRM nam phang ngay duoi
   * `/images/` (logo_amban.webp...) nen khong bi dinh. Ngoai ra day la rewrite
   * mac dinh (afterFiles): tep that trong public/ luon duoc uu tien truoc.
   */
  async rewrites() {
    if (!qreviewSiteBase) return [];

    return [
      {
        source: '/images/:folder/:path*',
        destination: `${qreviewSiteBase}/images/:folder/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
