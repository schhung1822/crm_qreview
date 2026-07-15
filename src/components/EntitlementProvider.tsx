'use client';

// Cung cấp cờ TÍNH NĂNG theo gói của biz đang hoạt động (tính ở server layout) cho toàn app.
// FeatureGate: nếu gói của biz KHÔNG có tính năng → hiện màn hình vô hiệu hóa thay cho nội dung.
import { BlockStack, Box, Button, Card, Text } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useContext } from 'react';
import type { PlanFeatures } from '@/lib/billing/plans';

const Ctx = createContext<PlanFeatures | null>(null);

export function EntitlementProvider({ features, children }: { features: PlanFeatures; children: React.ReactNode }) {
  return <Ctx.Provider value={features}>{children}</Ctx.Provider>;
}

export function useFeatures(): PlanFeatures | null {
  return useContext(Ctx);
}

function LockedScreen() {
  const t = useTranslations('billing');
  const locale = useLocale();
  return (
    <Card>
      <Box padding="800">
        <BlockStack gap="300" inlineAlign="center">
          <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden>
            🔒
          </div>
          <Text as="h2" variant="headingMd" alignment="center">
            {t('featureLockedTitle')}
          </Text>
          <Box maxWidth="440px">
            <Text as="p" tone="subdued" alignment="center">
              {t('featureLockedBody')}
            </Text>
          </Box>
          <Button url={`/${locale}/billing`} variant="primary">
            {t('featureLockedCta')}
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}

// Bọc quanh nội dung của 1 tính năng. Gói không có tính năng → hiện màn hình khóa.
export function FeatureGate({ feature, children }: { feature: keyof PlanFeatures; children: React.ReactNode }) {
  const features = useContext(Ctx);
  // Chưa có context (an toàn) → không chặn nhầm.
  if (!features || features[feature]) return <>{children}</>;
  return <LockedScreen />;
}
