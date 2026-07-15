'use client';

// Modal "Style thương hiệu" của Báo cáo Social: rút hồ sơ phong cách (tông giọng, xưng hô,
// từ ngữ, lập luận, công thức, đặc điểm riêng...) từ bài viết/video đã thu bằng AI, hiển thị
// gọn theo từng mục và XUẤT thành Markdown (.md / sao chép) hoặc PROMPT tái sử dụng.
// Kết quả lưu trong báo cáo → mở lại không tốn thêm token; có nút Tạo lại.
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Modal,
  Select,
  Text,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { HelpLabel } from './InfoHint';
import { AiWorking } from './ui';
import {
  buildStyleMarkdown,
  buildStylePrompt,
  styleFileName,
  STYLE_TEXT_SECTIONS,
  type StyleLabels,
} from '@/lib/social/style';
import type { SocialStyleProfile } from '@/lib/social/types';

interface ProviderStatus {
  id: string;
  label: string;
  hasKey: boolean;
  enabled: boolean;
}

export function SocialStyleModal({
  open,
  onClose,
  reportId,
  brand,
  style,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  reportId: string;
  brand: string;
  style?: SocialStyleProfile;
  onGenerated: (style: SocialStyleProfile) => void;
}) {
  const t = useTranslations('socialReport.style');
  const ta = useTranslations('socialReport');
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [modelsBusy, setModelsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [regen, setRegen] = useState(false); // đang ở màn "Tạo lại"

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
      /* dùng model mặc định */
    } finally {
      setModelsBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/social-report/${reportId}/style`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: model || undefined }),
      });
      const d = (await res.json()) as { style?: SocialStyleProfile; error?: string };
      if (!res.ok || !d.style) {
        setError(d.error ?? t('error'));
        return;
      }
      onGenerated(d.style);
      setRegen(false);
    } finally {
      setBusy(false);
    }
  }

  // Nhãn mục dùng chung cho hiển thị + xuất Markdown/Prompt.
  const labels: StyleLabels = {
    title: t('labels.title'),
    summary: t('labels.summary'),
    toneOfVoice: t('labels.toneOfVoice'),
    addressing: t('labels.addressing'),
    vocabulary: t('labels.vocabulary'),
    sentencePatterns: t('labels.sentencePatterns'),
    argumentation: t('labels.argumentation'),
    contentFormulas: t('labels.contentFormulas'),
    storytelling: t('labels.storytelling'),
    signatureTraits: t('labels.signatureTraits'),
    signaturePhrases: t('labels.signaturePhrases'),
    doList: t('labels.doList'),
    dontList: t('labels.dontList'),
    promptIntro: t('labels.promptIntro', { brand }),
    promptOutro: t('labels.promptOutro'),
  };

  const copy = async (text: string, which: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(''), 2500);
    } catch {
      setError(t('copyError'));
    }
  };

  const downloadMd = () => {
    if (!style) return;
    const blob = new Blob([buildStyleMarkdown(style, labels, brand)], {
      type: 'text/markdown;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = styleFileName(brand);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showGenerate = !style || regen;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('modalTitle')} · ${brand}`}
      primaryAction={
        showGenerate
          ? { content: t('generate'), onAction: () => void generate(), loading: busy, disabled: busy }
          : { content: t('copyPrompt'), onAction: () => void copy(buildStylePrompt(style!, labels, brand), 'prompt') }
      }
      secondaryActions={
        showGenerate
          ? [
              ...(style ? [{ content: ta('cancel'), onAction: () => setRegen(false) }] : []),
              { content: ta('cancel'), onAction: onClose },
            ]
          : [
              { content: t('copyMarkdown'), onAction: () => void copy(buildStyleMarkdown(style!, labels, brand), 'md') },
              { content: t('downloadMd'), onAction: downloadMd },
              { content: t('regenerate'), onAction: () => setRegen(true) },
            ]
      }
    >
      <Modal.Section>
        <BlockStack gap="300">
          {error ? (
            <Banner tone="critical">
              <p>{error}</p>
            </Banner>
          ) : null}
          {copied ? (
            <Banner tone="success">
              <p>{copied === 'prompt' ? t('copiedPrompt') : t('copiedMd')}</p>
            </Banner>
          ) : null}

          {showGenerate ? (
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                {t('note')}
              </Text>
              {providers !== null && providers.length === 0 ? (
                <Banner tone="warning">
                  <p>{ta('noAiKey')}</p>
                </Banner>
              ) : null}
              <Select
                label={<HelpLabel label={ta('aiProvider')} help={ta('aiProviderHelp')} />}
                options={[
                  { label: ta('aiAuto'), value: '' },
                  ...(providers ?? []).map((p) => ({ label: p.label, value: p.id })),
                ]}
                value={provider}
                onChange={(v) => void selectProvider(v)}
              />
              {provider ? (
                <Select
                  label={<HelpLabel label={ta('aiModel')} help={ta('aiModelHelp')} />}
                  options={[
                    { label: ta('aiDefaultModel'), value: '' },
                    ...models.map((m) => ({ label: m, value: m })),
                  ]}
                  value={model}
                  onChange={setModel}
                  disabled={modelsBusy}
                />
              ) : null}
              {busy ? <AiWorking text={t('generating')} progress="indeterminate" /> : null}
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              {STYLE_TEXT_SECTIONS.map((key) => {
                const val = style![key];
                if (typeof val !== 'string' || !val) return null;
                return (
                  <Box key={key}>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        {labels[key]}
                      </Text>
                      <Text as="p">{val}</Text>
                    </BlockStack>
                  </Box>
                );
              })}
              {style!.signaturePhrases.length ? (
                <BlockStack gap="100">
                  <Divider />
                  <Text as="h3" variant="headingSm">
                    {labels.signaturePhrases}
                  </Text>
                  {style!.signaturePhrases.map((s, i) => (
                    <Text as="p" key={i} tone="subdued">
                      &ldquo;{s}&rdquo;
                    </Text>
                  ))}
                </BlockStack>
              ) : null}
              <InlineStack gap="400" wrap>
                {style!.doList.length ? (
                  <Box minWidth="45%">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" tone="success">
                        {labels.doList}
                      </Text>
                      {style!.doList.map((s, i) => (
                        <Text as="p" key={i}>
                          • {s}
                        </Text>
                      ))}
                    </BlockStack>
                  </Box>
                ) : null}
                {style!.dontList.length ? (
                  <Box minWidth="45%">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" tone="critical">
                        {labels.dontList}
                      </Text>
                      {style!.dontList.map((s, i) => (
                        <Text as="p" key={i}>
                          • {s}
                        </Text>
                      ))}
                    </BlockStack>
                  </Box>
                ) : null}
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
