// Sinh CSS ghi đè token màu Polaris theo màu thương hiệu (superadmin đặt ở "Thông tin hệ thống").
// THUẦN, không import node/fs → dùng được cả server (layout) lẫn client. Chỉ nhận màu HEX hợp lệ
// (chống chèn CSS): màu không hợp lệ/để trống → bỏ qua (giữ mặc định Polaris).

export interface BrandColors {
  colorPrimary?: string; // màu nút chính + điểm nhấn (brand)
  colorHeader?: string; // màu nền header (top bar)
  colorButtonBorder?: string; // màu viền nút (nút phụ/outline)
  colorBorder?: string; // màu viền khối (thẻ, ô, đường kẻ...)
}

// Mặc định Polaris (để hiện lên ô chọn màu khi CHƯA đặt): brand fill ≈ #303030, header ≈ #1a1a1a,
// viền ≈ #e3e3e3.
export const DEFAULT_PRIMARY_HEX = '#303030';
export const DEFAULT_HEADER_HEX = '#1a1a1a';
export const DEFAULT_BORDER_HEX = '#e3e3e3';

const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
export function isHexColor(v: string): boolean {
  return HEX.test(v.trim());
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// Chữ tương phản trên nền màu: nền sáng → chữ tối, nền tối → chữ sáng.
function contrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  return relLum(rgb) > 0.45 ? '#1a1a1a' : '#ffffff';
}

// Làm đậm/nhạt (amt < 0 = đậm hơn) cho trạng thái hover/active.
function shade(hex: string, amt: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const adj = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return (
    '#' +
    rgb
      .map((v) => adj(v).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function buildBrandThemeCss(c: BrandColors): string {
  const lines: string[] = [];

  if (c.colorPrimary && isHexColor(c.colorPrimary)) {
    const p = c.colorPrimary.trim();
    lines.push(
      `--p-color-bg-fill-brand:${p};`,
      `--p-color-bg-fill-brand-hover:${shade(p, -0.06)};`,
      `--p-color-bg-fill-brand-active:${shade(p, -0.12)};`,
      `--p-color-bg-fill-brand-selected:${shade(p, -0.12)};`,
      `--p-color-border-brand:${p};`,
      `--p-color-text-brand-on-bg-fill:${contrastText(p)};`,
    );
  }

  if (c.colorHeader && isHexColor(c.colorHeader)) {
    const h = c.colorHeader.trim();
    lines.push(`--p-color-bg-inverse:${h};`, `--p-color-text-inverse:${contrastText(h)};`);
  }

  // Viền nút: nút phụ (secondary) vẽ "viền" bằng box-shadow → thay bằng vòng 1px màu tùy chọn.
  if (c.colorButtonBorder && isHexColor(c.colorButtonBorder)) {
    const b = c.colorButtonBorder.trim();
    lines.push(
      `--p-shadow-button:0 0 0 0.0625rem ${b} inset;`,
      `--p-shadow-button-hover:0 0 0 0.0625rem ${shade(b, -0.1)} inset;`,
    );
  }

  // Viền khối: thẻ, ô nhập, đường kẻ... dùng token --p-color-border.
  if (c.colorBorder && isHexColor(c.colorBorder)) {
    const b = c.colorBorder.trim();
    lines.push(`--p-color-border:${b};`, `--p-color-border-hover:${shade(b, -0.08)};`);
  }

  if (!lines.length) return '';
  // :root:root để thắng độ đặc hiệu token mặc định của Polaris.
  return `:root:root{${lines.join('')}}`;
}
