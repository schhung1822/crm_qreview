'use client';

import { Banner, BlockStack, Button, InlineStack, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

// Giọng thương hiệu (brand voice) của biz: tông giọng/thuật ngữ/điều cấm - nhét vào prompt AI
// khi viết/tối ưu/bản địa hóa. Lưu vào article-config.json qua /api/biz/[id]/content-settings.
export function BrandVoicePanel({ bizId }: { bizId: string }) {
  const t = useTranslations('biz');
  const [value, setValue] = useState('');
  const [initial, setInitial] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/content-settings`);
    if (res.ok) {
      const d = await res.json();
      const bv = typeof d.brandVoice === 'string' ? d.brandVoice : '';
      setValue(bv);
      setInitial(bv);
    }
    setLoaded(true);
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${bizId}/content-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandVoice: value }),
      });
      if (res.ok) {
        setInitial(value);
        setMsg({ ok: true, text: t('brandVoiceSaved') });
      } else {
        const d = await res.json().catch(() => null);
        setMsg({ ok: false, text: d?.error || t('saveErr') });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">
          {t('brandVoiceTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('brandVoiceHelp')}
        </Text>
      </BlockStack>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
      <TextField
        label={t('brandVoiceLabel')}
        labelHidden
        value={value}
        onChange={setValue}
        multiline={8}
        autoComplete="off"
        maxLength={4000}
        showCharacterCount
        disabled={!loaded || busy}
        placeholder={t('brandVoicePlaceholder')}
        helpText={t('brandVoiceExample')}
      />
      <InlineStack>
        <Button
          variant="primary"
          loading={busy}
          disabled={!loaded || value === initial}
          onClick={() => void save()}
        >
          {t('saveProfile')}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
