'use client';

import { Badge, BlockStack, Button, Card, InlineStack, Text } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Checklist onboarding: nhập key AI + kết nối site. Tự ẩn khi đã đủ.
export function SetupChecklist() {
  const t = useTranslations('setup');
  const locale = useLocale();
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [siteCount, setSiteCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ hasKey: boolean; enabled: boolean }> }) =>
        setAiReady(d.providers.some((p) => p.hasKey && p.enabled)),
      )
      .catch(() => setAiReady(false));
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d: { connections: unknown[] }) => setSiteCount(d.connections.length))
      .catch(() => setSiteCount(0));
  }, []);

  if (aiReady === null || siteCount === null) return null;

  const hasAi = aiReady;
  const hasSite = siteCount > 0;

  if (hasAi && hasSite) {
    return (
      <Card>
        <InlineStack gap="300" blockAlign="center">
          <Badge tone="success">{t('doneTitle')}</Badge>
          <Text as="span" tone="subdued">
            {t('doneBody')}
          </Text>
        </InlineStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            {t('title')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('subtitle')}
          </Text>
        </BlockStack>
        <Step done={hasAi} label={t('step1')} cta={t('step1Cta')} url={`/${locale}/settings`} />
        <Step done={hasSite} label={t('step2')} cta={t('step2Cta')} url={`/${locale}/settings`} />
        <Step done={false} label={t('step3')} cta={t('step3Cta')} url={`/${locale}/editor`} muted={!hasAi} />
      </BlockStack>
    </Card>
  );
}

function Step({
  done,
  label,
  cta,
  url,
  muted,
}: {
  done: boolean;
  label: string;
  cta: string;
  url: string;
  muted?: boolean;
}) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          background: done ? '#29845a' : '#e3e3e3',
        }}
      >
        {done ? (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 10.5 3 3 7-8" />
          </svg>
        ) : null}
      </div>
      <div style={{ flex: 1 }}>
        <Text as="span" tone={done ? 'subdued' : undefined} textDecorationLine={done ? 'line-through' : undefined}>
          {label}
        </Text>
      </div>
      {!done ? (
        <Button variant="primary" url={url} disabled={muted}>
          {cta}
        </Button>
      ) : null}
    </InlineStack>
  );
}
