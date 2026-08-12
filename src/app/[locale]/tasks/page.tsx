'use client';

import { Badge, BlockStack, Box, Button, Card, InlineStack, Page, Spinner, Text } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Article {
  id: string;
  title: string;
  status: 'draft' | 'review' | 'published';
  updatedAt: string;
  assignedTo?: string;
}

// "Việc của tôi": bài được giao cho tôi + (nếu có quyền đăng) bài đang chờ tôi duyệt.
export default function TasksPage() {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const [items, setItems] = useState<Article[] | null>(null);
  const [me, setMe] = useState<{ userId: string; canPublish: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      const [a, p] = await Promise.all([
        fetch('/api/articles/draft').then((r) => (r.ok ? r.json() : { articles: [] })),
        fetch('/api/auth/permissions').then((r) => (r.ok ? r.json() : null)),
      ]);
      setItems((a.articles as Article[]) ?? []);
      setMe(
        p
          ? { userId: p.userId, canPublish: (p.permissions ?? []).includes('content:publish') }
          : null,
      );
    })();
  }, []);

  const assigned = (items ?? []).filter((x) => me && x.assignedTo === me.userId);
  const toReview = (items ?? []).filter((x) => me?.canPublish && x.status === 'review');

  function row(a: Article, reason: 'assigned' | 'review') {
    return (
      <Box key={`${a.id}-${reason}`} padding="300" borderBlockEndWidth="025" borderColor="border">
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <BlockStack gap="050">
            <Button variant="plain" url={`/${locale}/editor?draft=${a.id}&from=tasks`}>
              {a.title || t('untitled')}
            </Button>
            <Text as="span" tone="subdued" variant="bodySm">
              {t('updated')}: {new Date(a.updatedAt).toLocaleDateString()}
            </Text>
          </BlockStack>
          <Badge tone={reason === 'review' ? 'attention' : 'info'}>
            {reason === 'review' ? t('reasonReview') : t('reasonAssigned')}
          </Badge>
        </InlineStack>
      </Box>
    );
  }

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      {items === null ? (
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      ) : (
        <BlockStack gap="400">
          <Card padding="0">
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <Text as="h2" variant="headingSm">
                {t('toReview')} ({toReview.length})
              </Text>
            </Box>
            {toReview.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('empty')}
                </Text>
              </Box>
            ) : (
              toReview.map((a) => row(a, 'review'))
            )}
          </Card>

          <Card padding="0">
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <Text as="h2" variant="headingSm">
                {t('assignedToMe')} ({assigned.length})
              </Text>
            </Box>
            {assigned.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('empty')}
                </Text>
              </Box>
            ) : (
              assigned.map((a) => row(a, 'assigned'))
            )}
          </Card>
        </BlockStack>
      )}
    </Page>
  );
}
