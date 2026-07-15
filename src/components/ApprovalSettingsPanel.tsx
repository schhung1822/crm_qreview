'use client';

import { Banner, BlockStack, Checkbox, Text } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

// Cài đặt quy trình phê duyệt của biz (chủ/quản trị). Bật = bài phải được người có quyền đăng
// duyệt trước khi đăng lên CMS. Lưu vào article-config.json qua /api/biz/[id]/content-settings.
export function ApprovalSettingsPanel({ bizId }: { bizId: string }) {
  const t = useTranslations('biz');
  const [requireApproval, setRequireApproval] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/content-settings`);
    if (res.ok) {
      const d = await res.json();
      setRequireApproval(!!d.requireApproval);
    }
    setLoaded(true);
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${bizId}/content-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireApproval: next }),
      });
      if (res.ok) {
        setRequireApproval(next);
        setMsg({ ok: true, text: t('approvalSaved') });
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
          {t('approvalTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('approvalHelp')}
        </Text>
      </BlockStack>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}
      <Checkbox
        label={t('requireApproval')}
        helpText={t('requireApprovalHelp')}
        checked={requireApproval}
        disabled={!loaded || busy}
        onChange={(v) => void save(v)}
      />
    </BlockStack>
  );
}
