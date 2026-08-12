import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => ({
  locale: 'vi',
  messages: (await import('../messages/vi.json')).default as AbstractIntlMessages,
}));
