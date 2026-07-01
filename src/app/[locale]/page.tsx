import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n/config';

export default function LocaleIndex({ params: { locale } }: { params: { locale: Locale } }) {
  redirect(`/${locale}/dashboard`);
}
