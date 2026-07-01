// Factory tạo adapter CMS theo provider của Connection.
import type { CmsAdapter, CmsConnectionConfig, CmsProvider } from './types';
import { ShopifyAdapter } from './shopify';
import { WordPressAdapter } from './wordpress';
import { WixAdapter } from './wix';

export function getCmsAdapter(
  provider: CmsProvider,
  config: CmsConnectionConfig,
): CmsAdapter {
  switch (provider) {
    case 'wordpress':
      return new WordPressAdapter(config);
    case 'wix':
      return new WixAdapter(config);
    case 'shopify':
      return new ShopifyAdapter(config);
  }
}

// Sinh thẻ hreflang (đối xứng) cho 1 bài thuộc TranslationGroup.
export function buildHreflang(
  alternates: Array<{ locale: string; url: string }>,
): string {
  const tags = alternates.map(
    (a) => `<link rel="alternate" hreflang="${a.locale}" href="${a.url}" />`,
  );
  if (alternates[0]) {
    tags.push(`<link rel="alternate" hreflang="x-default" href="${alternates[0].url}" />`);
  }
  return tags.join('\n');
}

export * from './types';
