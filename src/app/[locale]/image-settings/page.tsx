'use client';

import { Banner, BlockStack, Card, Page, Select, Spinner, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Fallback nếu API không trả model ảnh nào (vd Imagen ẩn trong ListModels).
const FALLBACK_IMAGE_MODELS: Record<'openai' | 'gemini', string[]> = {
  openai: ['gpt-image-1', 'dall-e-3'],
  gemini: [
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-ultra-generate-001',
    'gemini-2.5-flash-image',
  ],
};

interface Cfg {
  systemDesign: string;
  imageProvider: '' | 'openai' | 'gemini';
  imageModel: string;
}

export default function ImageSettingsPage() {
  const t = useTranslations('imageSettings');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [keyed, setKeyed] = useState<Array<'openai' | 'gemini'>>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load model TẠO ẢNH thật từ API của provider (kind=image); rỗng → fallback curated.
  async function loadModels(provider: '' | 'openai' | 'gemini') {
    if (provider !== 'openai' && provider !== 'gemini') {
      setModels([]);
      return;
    }
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, kind: 'image' }),
      });
      const d = await res.json();
      const list = res.ok && Array.isArray(d.models) && d.models.length ? (d.models as string[]) : [];
      setModels(list.length ? list : FALLBACK_IMAGE_MODELS[provider]);
    } catch {
      setModels(FALLBACK_IMAGE_MODELS[provider]);
    } finally {
      setModelsBusy(false);
    }
  }

  useEffect(() => {
    fetch('/api/image-config')
      .then((r) => r.json())
      .then((d: { config: Cfg }) => {
        const c = {
          systemDesign: d.config.systemDesign ?? '',
          imageProvider: d.config.imageProvider ?? '',
          imageModel: d.config.imageModel ?? '',
        } as Cfg;
        setCfg(c);
        void loadModels(c.imageProvider);
      })
      .catch(() => setCfg({ systemDesign: '', imageProvider: '', imageModel: '' }));

    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; hasKey: boolean }> }) =>
        setKeyed(
          d.providers
            .filter((p) => p.hasKey && (p.id === 'openai' || p.id === 'gemini'))
            .map((p) => p.id as 'openai' | 'gemini'),
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectImageProvider(v: '' | 'openai' | 'gemini') {
    patch({ imageProvider: v, imageModel: '' });
    void loadModels(v);
  }

  function patch(p: Partial<Cfg>) {
    setCfg((c) => (c ? { ...c, ...p } : c));
    setSaved(false);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/image-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return (
      <Page title={t('title')}>
        <Spinner size="small" />
      </Page>
    );
  }

  const modelOptions = [
    { label: modelsBusy ? t('modelLoading') : t('modelDefault'), value: '' },
    ...models.map((m) => ({ label: m, value: m })),
  ];

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: t('save'), onAction: save, loading: saving }}
    >
      <BlockStack gap="400">
        {saved ? <Banner tone="success">{t('saved')}</Banner> : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('aiTitle')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('aiHint')}
            </Text>
            {keyed.length === 0 ? <Banner tone="warning">{t('noImageKey')}</Banner> : null}
            <Select
              label={t('provider')}
              options={[
                { label: t('auto'), value: '' },
                ...keyed.map((p) => ({
                  label: p === 'openai' ? 'OpenAI (gpt-image / DALL·E)' : 'Gemini (Imagen)',
                  value: p,
                })),
              ]}
              value={cfg.imageProvider}
              onChange={(v) => selectImageProvider(v as Cfg['imageProvider'])}
            />
            <Select
              label={t('model')}
              options={modelOptions}
              value={cfg.imageModel}
              onChange={(v) => patch({ imageModel: v })}
              disabled={cfg.imageProvider === '' || modelsBusy}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              {t('systemDesign')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('systemDesignHint')}
            </Text>
            <TextField
              label={t('systemDesign')}
              labelHidden
              value={cfg.systemDesign}
              onChange={(v) => patch({ systemDesign: v })}
              multiline={8}
              autoComplete="off"
              placeholder={t('systemDesignPlaceholder')}
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
