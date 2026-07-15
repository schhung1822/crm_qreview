'use client';

import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MagicIcon } from '@/components/icons';
import { HelpLabel } from '@/components/InfoHint';
import { AiWorking, ExtLink } from '@/components/ui';

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
  const locale = useLocale();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [keyed, setKeyed] = useState<Array<'openai' | 'gemini'>>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  // Chọn AI + model để TỐI ƯU System Design (tác vụ text — bắt buộc chọn, không chạy mặc định).
  const [dsProviders, setDsProviders] = useState<Array<{ id: string; label: string }>>([]);
  const [dsProvider, setDsProvider] = useState('');
  const [dsModel, setDsModel] = useState('');
  const [dsModels, setDsModels] = useState<string[]>([]);
  const [dsModelsBusy, setDsModelsBusy] = useState(false);

  // Load model TEXT của provider được chọn để tối ưu design.
  async function loadDesignModels(provider: string) {
    if (!provider) {
      setDsModels([]);
      return;
    }
    setDsModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      setDsModels(res.ok && Array.isArray(d.models) ? (d.models as string[]) : []);
    } catch {
      setDsModels([]);
    } finally {
      setDsModelsBusy(false);
    }
  }

  function selectDsProvider(v: string) {
    setDsProvider(v);
    setDsModel('');
    void loadDesignModels(v);
  }

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
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean; enabled: boolean }> }) => {
        setKeyed(
          d.providers
            .filter((p) => p.hasKey && (p.id === 'openai' || p.id === 'gemini'))
            .map((p) => p.id as 'openai' | 'gemini'),
        );
        // Provider text để tối ưu design: mọi provider đang bật + có key.
        setDsProviders(
          d.providers.filter((p) => p.hasKey && p.enabled).map((p) => ({ id: p.id, label: p.label })),
        );
      })
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

  // Dùng AI viết lại System Design thành cấu trúc chuẩn 7 mục (thân thiện cho sinh ảnh).
  async function optimizeDesign() {
    if (!cfg) return;
    setOptimizing(true);
    setOptError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/image-config/optimize-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: cfg.systemDesign,
          locale,
          provider: dsProvider,
          ...(dsModel ? { model: dsModel } : {}),
        }),
      });
      const d = await res.json();
      if (d.needsKey) {
        setOptError(t('optimizeNeedsKey'));
        return;
      }
      if (!d.ok || !d.design) {
        setOptError(d.error ?? t('optimizeError'));
        return;
      }
      patch({ systemDesign: d.design });
    } catch {
      setOptError(t('optimizeError'));
    } finally {
      setOptimizing(false);
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
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              <Select
                label={<HelpLabel label={t('provider')} help={t('providerHelp')} />}
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
                label={<HelpLabel label={t('model')} help={t('imageModelHelp')} />}
                options={modelOptions}
                value={cfg.imageModel}
                onChange={(v) => patch({ imageModel: v })}
                disabled={cfg.imageProvider === '' || modelsBusy}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('systemDesign')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('systemDesignHint')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('optimizeHint')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('extractorHint')}{' '}
              <ExtLink href="https://chromewebstore.google.com/detail/design-system-extractor/dkdggcninpaaihlehfliimejfogdhikg">
                Design System Extractor
              </ExtLink>
            </Text>

            {/* Chọn AI + model + nút Tối ưu cùng 1 hàng — BẮT BUỘC chọn (không chạy mặc định). */}
            {dsProviders.length === 0 ? (
              <Banner tone="warning">{t('optimizeNeedsKey')}</Banner>
            ) : (
              <InlineGrid columns={{ xs: 1, md: '1fr 1fr auto' }} gap="300" alignItems="end">
                <Select
                  label={<HelpLabel label={t('optimizeProvider')} help={t('optimizeProviderHelp')} />}
                  options={[
                    { label: t('optimizeProviderPlaceholder'), value: '' },
                    ...dsProviders.map((p) => ({ label: p.label, value: p.id })),
                  ]}
                  value={dsProvider}
                  onChange={selectDsProvider}
                  disabled={optimizing}
                />
                <Select
                  label={t('model')}
                  options={[
                    { label: dsModelsBusy ? t('modelLoading') : t('modelDefault'), value: '' },
                    ...dsModels.map((m) => ({ label: m, value: m })),
                  ]}
                  value={dsModel}
                  onChange={setDsModel}
                  disabled={!dsProvider || dsModelsBusy || optimizing}
                />
                <Button
                  icon={MagicIcon}
                  variant="primary"
                  loading={optimizing}
                  disabled={optimizing || !dsProvider}
                  onClick={optimizeDesign}
                >
                  {optimizing ? t('optimizing') : t('optimizeAi')}
                </Button>
              </InlineGrid>
            )}

            {optError ? <Banner tone="critical">{optError}</Banner> : null}
            {optimizing ? (
              <AiWorking text={t('optimizing')} progress="indeterminate" />
            ) : (
              <TextField
                label={t('systemDesign')}
                labelHidden
                value={cfg.systemDesign}
                onChange={(v) => patch({ systemDesign: v })}
                multiline={10}
                autoComplete="off"
                placeholder={t('systemDesignPlaceholder')}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
