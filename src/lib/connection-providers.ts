import type { CmsProvider } from './cms/types';

export const CMS_PROVIDERS = ['wordpress', 'wix', 'shopify', 'haravan', 'sapo'] as const satisfies readonly CmsProvider[];
export const SOCIAL_PROVIDERS = ['facebook', 'instagram', 'tiktok', 'threads', 'youtube'] as const;
export const CONNECTION_PROVIDERS = [...CMS_PROVIDERS, ...SOCIAL_PROVIDERS] as const;

export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

export function isCmsProvider(provider: string): provider is CmsProvider {
  return (CMS_PROVIDERS as readonly string[]).includes(provider);
}

export function isSocialProvider(provider: string): provider is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(provider);
}
