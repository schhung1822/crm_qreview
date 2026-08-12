import { redirect } from 'next/navigation';
export default async function LocaleIndex(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;

  const {
    locale
  } = params;

  redirect('/dashboard');
}
