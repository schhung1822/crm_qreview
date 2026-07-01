// Logo SVG của các nền tảng CMS. Icon LUÔN là SVG (theo §2 UI-GUIDELINES) - không dùng
// chữ/emoji làm logo. WordPress dùng logomark chính thức (vòng tròn chữ W); Wix dùng
// wordmark chữ "Wix" đen (đúng nhận diện Wix); Shopify dùng chip xanh + túi mua sắm trắng.
import type { CSSProperties } from 'react';

export type BrandProvider = 'wordpress' | 'wix' | 'shopify';

// Đường dẫn logomark WordPress chính thức (vòng tròn + chữ W), viewBox 24×24.
const WORDPRESS_PATH =
  'M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0';

export function BrandLogo({ provider, size = 38 }: { provider: BrandProvider; size?: number }) {
  const box: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 9,
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
    overflow: 'hidden',
  };

  if (provider === 'wordpress') {
    return (
      <div style={box}>
        <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="WordPress">
          <path fill="#21759b" d={WORDPRESS_PATH} />
        </svg>
      </div>
    );
  }

  if (provider === 'wix') {
    return (
      <div style={{ ...box, background: '#fff', border: '1px solid var(--p-color-border)' }}>
        <svg width={size - 8} height={(size - 8) * 0.44} viewBox="0 0 64 28" role="img" aria-label="Wix">
          <text
            x="0"
            y="23"
            fontFamily="Inter, Helvetica, Arial, sans-serif"
            fontSize="28"
            fontWeight="800"
            letterSpacing="-1.5"
            fill="#0b0b0b"
          >
            Wix
          </text>
        </svg>
      </div>
    );
  }

  // Shopify - chip xanh thương hiệu + túi mua sắm trắng.
  return (
    <div style={{ ...box, background: '#95bf47' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Shopify">
        <rect x="5" y="8.5" width="14" height="11.5" rx="2" fill="#fff" />
        <path
          d="M9 9V7.6a3 3 0 0 1 6 0V9"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="12" cy="13.2" r="1.5" fill="#95bf47" />
      </svg>
    </div>
  );
}
