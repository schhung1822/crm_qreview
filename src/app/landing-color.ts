// Suy bảng màu trang chủ từ MỘT màu thương hiệu (branding.colorPrimary). Tính ở server để KHÔNG
// phụ thuộc color-mix của CSS (một số trình duyệt cũ không hỗ trợ) → đổi màu chính là cả trang đổi.

const DEFAULT_ACCENT = '#008060'; // xanh kiểu Shopify khi chưa đặt màu thương hiệu

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Trộn màu về phía target theo tỉ lệ (0..1).
function mix(rgb: [number, number, number], target: [number, number, number], ratio: number): [number, number, number] {
  return [
    rgb[0] + (target[0] - rgb[0]) * ratio,
    rgb[1] + (target[1] - rgb[1]) * ratio,
    rgb[2] + (target[2] - rgb[2]) * ratio,
  ];
}

export interface LandingPalette {
  accent: string;
  accent2: string; // sắc nhạt (blob/nền icon)
  accentInk: string; // sắc đậm (chữ nhấn, hover)
  grad1: string; // điểm đầu gradient (= accent)
  grad2: string; // điểm cuối gradient (CTA/hero)
}

// Bảng màu trang chủ: ưu tiên colorHome (màu riêng trang chủ) → colorPrimary → mặc định.
// gradient: dùng colorHomeGradient nếu có, không thì tự suy sắc đậm hơn của màu chủ đạo.
export function landingPalette(opts?: {
  home?: string;
  primary?: string;
  gradient?: string;
}): LandingPalette {
  const rgb =
    (opts?.home && parseHex(opts.home)) ||
    (opts?.primary && parseHex(opts.primary)) ||
    parseHex(DEFAULT_ACCENT)!;
  const accent = toHex(rgb);
  const accentInk = toHex(mix(rgb, [0, 0, 0], 0.34));
  const gradRgb = opts?.gradient && parseHex(opts.gradient);
  return {
    accent,
    accent2: toHex(mix(rgb, [255, 255, 255], 0.28)),
    accentInk,
    grad1: accent,
    grad2: gradRgb ? toHex(gradRgb) : accentInk,
  };
}
