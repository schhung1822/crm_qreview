// Minh họa & icon SVG cho trang chủ (tự chứa, không tải ảnh ngoài, animate được bằng CSS).
// Dùng currentColor / var(--lp-accent) để ăn theo màu thương hiệu.
import type { ReactNode } from 'react';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// 6 icon USP KEY (khớp thứ tự features/USP trong nội dung home-strings).
const FEATURE_PATHS: ReactNode[] = [
  // 0 Báo cáo Social - bong bóng chat + chấm tương tác
  <g key="f0" {...S}>
    <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    <circle cx="9" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
  </g>,
  // 1 Phân tích shop TMĐT - túi mua hàng
  <g key="f1" {...S}>
    <path d="M6 8h12l-1 11.5a1 1 0 0 1-1 .9H8a1 1 0 0 1-1-.9z" />
    <path d="M9 8.5V6.5a3 3 0 0 1 6 0v2" />
  </g>,
  // 2 Phân tích kịch bản video - nút play trong khung video
  <g key="f2" {...S}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.6" />
    <path d="M10.4 9.4l4 2.6-4 2.6z" fill="currentColor" stroke="none" />
  </g>,
  // 3 Viết bài SEO/GEO cho AI trích dẫn - tài liệu + tia AI
  <g key="f3" {...S}>
    <path d="M7 3.5h6l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5H7z" />
    <path d="M13 3.5V7.5h4" />
    <path d="M9.4 12.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="currentColor" stroke="none" />
  </g>,
  // 4 Tự động internal link + backlink - mắt xích liên kết
  <g key="f4" {...S}>
    <path d="M9.6 14.4l4.8-4.8" />
    <path d="M8.2 11.2 6.7 12.7a2.7 2.7 0 0 0 3.8 3.8l1.5-1.5" />
    <path d="M15.8 12.8l1.5-1.5a2.7 2.7 0 0 0-3.8-3.8L12 9" />
  </g>,
  // 5 Phân tích → kế hoạch → viết bằng AI - bảng kế hoạch
  <g key="f5" {...S}>
    <rect x="5" y="4.5" width="14" height="16" rx="2" />
    <path d="M9 4.5v-1a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
  </g>,
];

export function FeatureIcon({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      {FEATURE_PATHS[i % FEATURE_PATHS.length]}
    </svg>
  );
}

// 4 icon bước quy trình.
const STEP_PATHS: ReactNode[] = [
  // 0 Kết nối - liên kết
  <g key="s0" {...S}>
    <path d="M10.5 13.5l3-3" />
    <path d="M9 12l-1.2 1.2a2.6 2.6 0 0 0 3.7 3.7L12.8 15" />
    <path d="M15 12l1.2-1.2a2.6 2.6 0 0 0-3.7-3.7L11.2 9" />
  </g>,
  // 1 Nghiên cứu - kính lúp
  <g key="s1" {...S}>
    <circle cx="11" cy="11" r="6" />
    <line x1="15.5" y1="15.5" x2="20" y2="20" />
  </g>,
  // 2 Viết & tối ưu - tài liệu
  <g key="s2" {...S}>
    <rect x="6" y="3.5" width="12" height="17" rx="2" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="13" y2="16" />
  </g>,
  // 3 Đăng & đo lường - máy bay giấy
  <g key="s3" {...S}>
    <path d="M21 3L3 10.5l6.2 2.3L11.5 19 21 3z" />
    <line x1="9.2" y1="12.8" x2="21" y2="3" />
  </g>,
];

export function StepIcon({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      {STEP_PATHS[i % STEP_PATHS.length]}
    </svg>
  );
}

// Minh họa hero: "app" hiển thị biểu đồ tăng trưởng + huy hiệu SEO/AEO/GEO nổi xung quanh.
export function HeroArt() {
  return (
    <svg className="lp-heroart" viewBox="0 0 520 440" role="img" aria-hidden="true">
      <ellipse cx="150" cy="120" rx="130" ry="130" fill="var(--lp-accent)" opacity="0.08" />
      <ellipse cx="410" cy="330" rx="95" ry="95" fill="var(--lp-accent-2)" opacity="0.12" />

      <g className="lp-art-float">
        {/* thẻ chính */}
        <rect x="74" y="72" width="372" height="272" rx="22" fill="#fff" stroke="var(--lp-line)" />
        {/* header */}
        <circle cx="98" cy="98" r="4.5" fill="#ff5f57" />
        <circle cx="114" cy="98" r="4.5" fill="#febc2e" />
        <circle cx="130" cy="98" r="4.5" fill="#28c840" />
        <rect x="160" y="93" width="150" height="9" rx="4.5" fill="var(--lp-line)" />
        {/* stat chip */}
        <rect x="98" y="126" width="120" height="46" rx="10" fill="var(--lp-accent)" opacity="0.10" />
        <rect x="110" y="138" width="46" height="8" rx="4" fill="var(--lp-accent)" />
        <rect x="110" y="152" width="80" height="7" rx="3.5" fill="var(--lp-accent)" opacity="0.5" />
        {/* vùng biểu đồ */}
        <path
          d="M98 300 L142 258 L186 272 L230 214 L274 234 L318 178 L362 156 L420 132 L420 316 L98 316 Z"
          fill="var(--lp-accent)"
          opacity="0.10"
        />
        <path
          className="lp-art-line"
          d="M98 300 L142 258 L186 272 L230 214 L274 234 L318 178 L362 156 L420 132"
          fill="none"
          stroke="var(--lp-accent)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="420" cy="132" r="5.5" fill="#fff" stroke="var(--lp-accent)" strokeWidth="3" />
      </g>

      {/* huy hiệu nổi */}
      <g className="lp-art-badge lp-art-badge--1">
        <rect x="30" y="196" width="92" height="42" rx="12" fill="#fff" stroke="var(--lp-line)" />
        <circle cx="52" cy="217" r="9" fill="var(--lp-accent)" opacity="0.15" />
        <text x="70" y="222" className="lp-art-tag">SEO</text>
      </g>
      <g className="lp-art-badge lp-art-badge--2">
        <rect x="360" y="52" width="98" height="42" rx="12" fill="#fff" stroke="var(--lp-line)" />
        <circle cx="382" cy="73" r="9" fill="var(--lp-accent-2)" opacity="0.18" />
        <text x="400" y="78" className="lp-art-tag">AEO</text>
      </g>
      <g className="lp-art-badge lp-art-badge--3">
        <rect x="392" y="356" width="96" height="42" rx="12" fill="#fff" stroke="var(--lp-line)" />
        <circle cx="414" cy="377" r="9" fill="var(--lp-accent)" opacity="0.15" />
        <text x="432" y="382" className="lp-art-tag">GEO</text>
      </g>
    </svg>
  );
}
