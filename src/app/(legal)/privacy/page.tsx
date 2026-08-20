import type { Metadata } from 'next';

import { LegalDocumentPage } from '../_components/LegalDocumentPage';
import { siteOrigin } from '@/lib/site-url';

interface PrivacyPageProps {
  searchParams: Promise<{ lang?: string | string[] }>;
}

export async function generateMetadata({
  searchParams,
}: PrivacyPageProps): Promise<Metadata> {
  const { lang } = await searchParams;
  const isEnglish = lang === 'en';
  const origin = await siteOrigin();
  const canonical = `${origin}/privacy`;
  const title = isEnglish
    ? 'Privacy Policy | Qreview'
    : 'Chính sách Quyền riêng tư | Qreview';
  const description = isEnglish
    ? 'How Qreview collects, uses, retains, shares, and protects information.'
    : 'Cách Qreview thu thập, sử dụng, lưu giữ, chia sẻ và bảo vệ thông tin.';

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'article',
      url: canonical,
      siteName: 'Qreview',
      locale: isEnglish ? 'en_US' : 'vi_VN',
    },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const { lang } = await searchParams;
  const language = lang === 'en' ? 'en' : 'vi';
  return <LegalDocumentPage kind="privacy" language={language} />;
}
