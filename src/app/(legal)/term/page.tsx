import type { Metadata } from 'next';

import { LegalDocumentPage } from '../_components/LegalDocumentPage';
import { siteOrigin } from '@/lib/site-url';

interface TermPageProps {
  searchParams: Promise<{ lang?: string | string[] }>;
}

export async function generateMetadata({
  searchParams,
}: TermPageProps): Promise<Metadata> {
  const { lang } = await searchParams;
  const isEnglish = lang === 'en';
  const origin = await siteOrigin();
  const canonical = `${origin}/term`;
  const title = isEnglish ? 'Terms of Service | Qreview' : 'Điều khoản Dịch vụ | Qreview';
  const description = isEnglish
    ? 'The terms that apply when accessing and using Qreview services.'
    : 'Điều khoản áp dụng khi truy cập và sử dụng các dịch vụ của Qreview.';

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

export default async function TermPage({ searchParams }: TermPageProps) {
  const { lang } = await searchParams;
  const language = lang === 'en' ? 'en' : 'vi';
  return <LegalDocumentPage kind="term" language={language} />;
}
