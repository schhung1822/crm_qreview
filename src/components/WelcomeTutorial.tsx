'use client';

import { Badge, BlockStack, Box, InlineStack, Modal, Text } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

// Cờ localStorage: đã xem tutorial chào mừng. Đổi hậu tố (v1→v2) nếu muốn hiện lại cho mọi người.
export const TUTORIAL_SEEN_KEY = 'tutorial:seen:v1';

// Đánh dấu đã xem (gọi khi đóng hoặc hoàn tất) — an toàn khi không có localStorage.
function markSeen() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

// Modal wizard chào mừng tài khoản mới: nhiều bước, có Tiếp/Quay lại/Bỏ qua, kết bằng link tới
// trang Hướng dẫn sử dụng đầy đủ. Controlled: cha (Dashboard) giữ open + quyết định lần đầu.
export function WelcomeTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('tutorial');
  const locale = useLocale();
  const [step, setStep] = useState(0);

  // 5 bước; nội dung lấy từ i18n để dịch đủ 10 ngôn ngữ.
  const steps = useMemo(
    () =>
      [1, 2, 3, 4, 5].map((n) => ({
        title: t(`step${n}Title`),
        body: t(`step${n}Body`),
      })),
    [t],
  );

  const last = step >= steps.length - 1;
  const first = step === 0;

  const close = () => {
    markSeen();
    setStep(0);
    onClose();
  };

  const cur = steps[step];

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('title')}
      primaryAction={{
        content: last ? t('done') : t('next'),
        onAction: () => (last ? close() : setStep((s) => s + 1)),
      }}
      secondaryActions={[
        ...(!first ? [{ content: t('back'), onAction: () => setStep((s) => Math.max(0, s - 1)) }] : []),
        ...(!last ? [{ content: t('skip'), onAction: close }] : []),
        {
          content: t('openGuide'),
          url: `/${locale}/guide`,
          onAction: close,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone="info">{t('stepLabel', { current: step + 1, total: steps.length })}</Badge>
            <Text as="h3" variant="headingMd">
              {cur.title}
            </Text>
          </InlineStack>
          <Text as="p">{cur.body}</Text>
          {/* Chấm tiến trình */}
          <Box paddingBlockStart="200">
            <InlineStack gap="150">
              {steps.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background:
                      i === step ? 'var(--p-color-bg-fill-brand)' : 'var(--p-color-border)',
                  }}
                />
              ))}
            </InlineStack>
          </Box>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
