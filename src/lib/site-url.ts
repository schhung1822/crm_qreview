import { headers } from 'next/headers';

// Origin thật của request (dùng cho canonical/hreflang/sitemap). Ưu tiên header proxy nếu có.
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
