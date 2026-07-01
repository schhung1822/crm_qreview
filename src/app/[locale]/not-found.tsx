'use client';

import { BlockStack, Button, Card, Page, Text } from '@shopify/polaris';
import { useLocale } from 'next-intl';

export default function LocaleNotFound() {
  const locale = useLocale();
  return (
    <Page>
      <Card>
        <BlockStack gap="300" inlineAlign="center">
          <Text as="h1" variant="heading2xl">
            404
          </Text>
          <Text as="p" tone="subdued">
            Đường dẫn không tồn tại hoặc đã bị di chuyển.
          </Text>
          <Button variant="primary" url={`/${locale}/dashboard`}>
            Về Dashboard
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
