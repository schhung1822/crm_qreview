'use client';

// Modal chọn AI + model cho pha PHÂN TÍCH của Báo cáo Social (sau khi đã thu thập dữ liệu thô).
// Provider lấy từ /api/ai-keys (chỉ hiện provider có key + đang bật); model từ /api/ai-keys/models.
// '' = Tự động (theo định tuyến tác vụ 'analysis' của hệ thống).
import { Banner, BlockStack, Modal, Select, Text } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { HelpLabel } from './InfoHint';

interface ProviderStatus {
  id: string;
  label: string;
  hasKey: boolean;
  enabled: boolean;
}

export function SocialAnalyzeModal({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (provider: string, model?: string) => void;
}) {
  const t = useTranslations('socialReport');
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [modelsBusy, setModelsBusy] = useState(false);

  useEffect(() => {
    if (!open || providers !== null) return;
    void fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: ProviderStatus[] }) =>
        setProviders(d.providers.filter((p) => p.hasKey && p.enabled)),
      )
      .catch(() => setProviders([]));
  }, [open, providers]);

  async function selectProvider(v: string) {
    setProvider(v);
    setModel('');
    setModels([]);
    if (!v) return;
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: v }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.models)) setModels(d.models as string[]);
    } catch {
      /* giữ danh sách rỗng → dùng model mặc định */
    } finally {
      setModelsBusy(false);
    }
  }

  const providerOptions = [
    { label: t('aiAuto'), value: '' },
    ...(providers ?? []).map((p) => ({ label: p.label, value: p.id })),
  ];
  const modelOptions = [
    { label: t('aiDefaultModel'), value: '' },
    ...models.map((m) => ({ label: m, value: m })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('analyzeTitle')}
      primaryAction={{
        content: t('startAnalyze'),
        onAction: () => onStart(provider, model || undefined),
        disabled: providers !== null && providers.length === 0 && !provider,
      }}
      secondaryActions={[{ content: t('cancel'), onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {providers !== null && providers.length === 0 ? (
            <Banner tone="warning">
              <p>{t('noAiKey')}</p>
            </Banner>
          ) : null}
          <Select
            label={<HelpLabel label={t('aiProvider')} help={t('aiProviderHelp')} />}
            options={providerOptions}
            value={provider}
            onChange={(v) => void selectProvider(v)}
          />
          {provider ? (
            <Select
              label={<HelpLabel label={t('aiModel')} help={t('aiModelHelp')} />}
              options={modelOptions}
              value={model}
              onChange={setModel}
              disabled={modelsBusy}
            />
          ) : null}
          <Text as="p" tone="subdued" variant="bodySm">
            {t('analyzeNote')}
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
