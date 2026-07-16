'use client';

// Bộ chọn AI + model TẠO ẢNH dùng chung — đồng bộ UI/logic với trang Cài đặt ảnh AI:
//  - Provider = các nhà cung cấp CÓ KEY + hỗ trợ tạo ảnh (openai/gemini) + tùy chọn "Tự động".
//  - Model = load ĐỘNG từ API của provider (kind=image); nếu API không trả thì fallback danh sách curated.
import { InlineGrid, Select } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export type ImgProvider = '' | 'openai' | 'gemini';

// Fallback nếu API không liệt kê được model ảnh (vd Imagen ẩn trong ListModels).
const FALLBACK_IMAGE_MODELS: Record<'openai' | 'gemini', string[]> = {
  openai: ['gpt-image-1', 'dall-e-3'],
  gemini: [
    'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-ultra-generate-001',
    'gemini-2.5-flash-image',
  ],
};

export function ImageAiPicker({
  provider,
  model,
  onChange,
  providerLabel,
  modelLabel,
}: {
  provider: ImgProvider;
  model: string;
  onChange: (provider: ImgProvider, model: string) => void;
  providerLabel?: string; // bỏ trống = dùng nhãn i18n mặc định (khớp trang Cài đặt ảnh AI)
  modelLabel?: string;
}) {
  const t = useTranslations('imageSettings');
  const [keyed, setKeyed] = useState<Array<'openai' | 'gemini'>>([]);
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);

  const loadModels = useCallback(async (p: ImgProvider) => {
    if (p !== 'openai' && p !== 'gemini') {
      setModels([]);
      return;
    }
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p, kind: 'image' }),
      });
      const d = await res.json();
      const list = res.ok && Array.isArray(d.models) && d.models.length ? (d.models as string[]) : [];
      setModels(list.length ? list : FALLBACK_IMAGE_MODELS[p]);
    } catch {
      setModels(FALLBACK_IMAGE_MODELS[p]);
    } finally {
      setModelsBusy(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; hasKey: boolean }> }) => {
        setKeyed(
          d.providers
            .filter((p) => p.hasKey && (p.id === 'openai' || p.id === 'gemini'))
            .map((p) => p.id as 'openai' | 'gemini'),
        );
      })
      .catch(() => {});
    void loadModels(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 'Mặc định' = để provider tự chọn model. Các model khác giữ ĐÚNG TÊN gốc (gpt-image-1, imagen-4.0…).
  const modelOptions = [
    { label: t('modelDefault'), value: '' },
    ...models.map((m) => ({ label: m, value: m })),
  ];

  return (
    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
      <Select
        label={providerLabel ?? t('provider')}
        options={[
          // 'Tự động' theo ngôn ngữ; tên AI (OpenAI/Gemini) giữ nguyên tên gốc.
          { label: t('auto'), value: '' },
          ...keyed.map((p) => ({
            label: p === 'openai' ? 'OpenAI (gpt-image / DALL·E)' : 'Gemini (Imagen)',
            value: p,
          })),
        ]}
        value={provider}
        onChange={(v) => {
          const np = v as ImgProvider;
          onChange(np, ''); // đổi provider → reset model
          void loadModels(np);
        }}
      />
      <Select
        label={modelLabel ?? t('model')}
        options={modelOptions}
        value={model}
        onChange={(v) => onChange(provider, v)}
        disabled={provider === '' || modelsBusy}
      />
    </InlineGrid>
  );
}
