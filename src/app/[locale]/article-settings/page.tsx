'use client';

import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { XIcon } from '@/components/icons';
import { HelpLabel, InfoHint } from '@/components/InfoHint';

interface Rule {
  from: string;
  to: string;
  wholeWord?: boolean;
  caseSensitive?: boolean;
}

interface JsonLd {
  enabled: boolean;
  organizationName?: string;
  authorName?: string;
  logoUrl?: string;
}

interface ProviderOpt {
  id: string;
  label: string;
  hasKey: boolean;
}
// AI mặc định cho từng bước tạo nội dung (khớp AI_TASK_KEYS phía server).
type TaskKey = 'keywords' | 'blueprint' | 'write';
interface TaskAi {
  provider: string; // '' = Tự động
  model: string; // '' = model mặc định
}

export default function ArticleSettingsPage() {
  const t = useTranslations('articleSettings');
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [pipelineEnabled, setPipelineEnabled] = useState(true);
  const [jsonLd, setJsonLd] = useState<JsonLd>({ enabled: true });
  const [maxTokens, setMaxTokens] = useState(0); // 0 = tự động
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Định tuyến AI cho từng tác vụ (provider có key + danh sách model thật).
  const [providers, setProviders] = useState<ProviderOpt[]>([]);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [routing, setRouting] = useState<Record<TaskKey, TaskAi>>({
    keywords: { provider: '', model: '' },
    blueprint: { provider: '', model: '' },
    write: { provider: '', model: '' },
  });

  const loadModels = useCallback(async (provider: string) => {
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, kind: 'text' }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.models)) setModels((s) => ({ ...s, [provider]: d.models }));
    } catch {
      /* bỏ qua - vẫn dùng được model mặc định */
    }
  }, []);

  useEffect(() => {
    fetch('/api/article-config')
      .then((r) => r.json())
      .then((d: { replacements?: Rule[]; pipelineEnabled?: boolean; jsonLd?: JsonLd; maxTokens?: number }) => {
        setRules(Array.isArray(d.replacements) ? d.replacements : []);
        setPipelineEnabled(d.pipelineEnabled !== false);
        if (d.jsonLd) setJsonLd({ ...d.jsonLd, enabled: d.jsonLd.enabled !== false });
        setMaxTokens(typeof d.maxTokens === 'number' ? d.maxTokens : 0);
      })
      .catch(() => setRules([]));

    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers?: ProviderOpt[] }) => {
        const ps = d.providers ?? [];
        setProviders(ps);
        ps.filter((p) => p.hasKey).forEach((p) => void loadModels(p.id));
      })
      .catch(() => {});

    fetch('/api/task-routing')
      .then((r) => r.json())
      .then((d: Partial<Record<TaskKey, TaskAi>>) => setRouting((r) => ({ ...r, ...d })))
      .catch(() => {});
  }, [loadModels]);

  function updateRoute(task: TaskKey, p: Partial<TaskAi>) {
    setRouting((r) => ({ ...r, [task]: { ...r[task], ...p } }));
    setSaved(false);
  }

  function patchJsonLd(p: Partial<JsonLd>) {
    setJsonLd((j) => ({ ...j, ...p }));
    setSaved(false);
  }

  function patch(i: number, p: Partial<Rule>) {
    setRules((rs) => (rs ? rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)) : rs));
    setSaved(false);
  }
  function addRule() {
    setRules((rs) => [...(rs ?? []), { from: '', to: '', wholeWord: false, caseSensitive: false }]);
    setSaved(false);
  }
  function removeRule(i: number) {
    setRules((rs) => (rs ? rs.filter((_, idx) => idx !== i) : rs));
    setSaved(false);
  }

  async function save() {
    if (!rules) return;
    setSaving(true);
    setSaved(false);
    try {
      const replacements = rules.filter((r) => r.from.trim());
      // Lưu cấu hình bài + định tuyến AI cùng lúc (1 nút Lưu cho cả trang).
      const [res] = await Promise.all([
        fetch('/api/article-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replacements, pipelineEnabled, jsonLd, maxTokens }),
        }),
        fetch('/api/task-routing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(routing),
        }).catch(() => null),
      ]);
      const d = await res.json();
      if (res.ok) {
        setRules(Array.isArray(d.replacements) ? d.replacements : replacements);
        // Đồng bộ lại trần token đã chuẩn hóa (server kẹp về [2000, 16000] hoặc 0).
        if (typeof d.maxTokens === 'number') setMaxTokens(d.maxTokens);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!rules) {
    return (
      <Page title={t('title')}>
        <Spinner accessibilityLabel="loading" size="small" />
      </Page>
    );
  }

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: saving ? t('saving') : t('save'), onAction: save, loading: saving }}
    >
      <BlockStack gap="400">
        <Banner tone="info">{t('intro')}</Banner>
        {saved ? <Banner tone="success" onDismiss={() => setSaved(false)}>{t('saved')}</Banner> : null}

        {/* AI + model mặc định cho từng bước tạo nội dung */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('aiRoutingTitle')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('aiRoutingDesc')}
            </Text>
            {(
              [
                { key: 'keywords', label: t('taskAnalysis'), help: t('taskAnalysisHelp') },
                { key: 'blueprint', label: t('taskBlueprint'), help: t('taskBlueprintHelp') },
                { key: 'write', label: t('taskWrite'), help: t('taskWriteHelp') },
              ] as const
            ).map((task) => {
              const cur = routing[task.key];
              const opts = cur.provider ? models[cur.provider] ?? [] : [];
              return (
                <InlineGrid key={task.key} columns={{ xs: 1, md: '1fr 1fr 1fr' }} gap="300" alignItems="center">
                  <InlineStack gap="050" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {task.label}
                    </Text>
                    <InfoHint content={task.help} label={task.label} />
                  </InlineStack>
                  <Select
                    label={t('routeProvider')}
                    labelHidden
                    options={[
                      { label: t('routeAuto'), value: '' },
                      ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={cur.provider}
                    onChange={(v) => updateRoute(task.key, { provider: v, model: '' })}
                  />
                  <Select
                    label={t('routeModel')}
                    labelHidden
                    disabled={!cur.provider}
                    options={[
                      { label: t('routeModelDefault'), value: '' },
                      ...opts.map((m) => ({ label: m, value: m })),
                    ]}
                    value={cur.model}
                    onChange={(v) => updateRoute(task.key, { model: v })}
                  />
                </InlineGrid>
              );
            })}
          </BlockStack>
        </Card>

        {/* Bật/tắt quy trình AI 2 bước (lập khung → viết) */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              {t('pipelineTitle')}
            </Text>
            <Checkbox
              label={t('pipelineToggle')}
              checked={pipelineEnabled}
              onChange={(v) => {
                setPipelineEnabled(v);
                setSaved(false);
              }}
              helpText={t('pipelineHelp')}
            />
          </BlockStack>
        </Card>

        {/* Trần token đầu ra khi AI viết/tối ưu/bản địa hóa bài (0 = tự động) */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('maxTokensTitle')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('maxTokensDesc')}
            </Text>
            <InlineGrid columns={{ xs: 1, md: '260px 1fr' }} gap="400" alignItems="start">
              <TextField
                label={<HelpLabel label={t('maxTokensLabel')} help={t('maxTokensLabelHelp')} />}
                type="number"
                min={0}
                max={16000}
                step={1000}
                value={String(maxTokens)}
                onChange={(v) => {
                  const n = Math.max(0, Math.min(16000, Math.floor(Number(v) || 0)));
                  setMaxTokens(n);
                  setSaved(false);
                }}
                autoComplete="off"
                suffix="tokens"
                helpText={
                  maxTokens === 0
                    ? t('maxTokensAuto')
                    : t('maxTokensWords', { words: Math.round(maxTokens * 0.7).toLocaleString() })
                }
              />
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {t('maxTokensGuideTitle')}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t('maxTokensGuide1')}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t('maxTokensGuide2')}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t('maxTokensGuide3')}
                  </Text>
                </BlockStack>
              </Box>
            </InlineGrid>
            <InlineStack gap="200" wrap blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">
                {t('maxTokensPresetLabel')}
              </Text>
              {(
                [
                  { v: 0, label: t('maxTokensPresetAuto') },
                  { v: 8000, label: t('maxTokensPreset8k') },
                  { v: 12000, label: t('maxTokensPreset12k') },
                  { v: 16000, label: t('maxTokensPreset16k') },
                ] as const
              ).map((p) => (
                <Button
                  key={p.v}
                  variant="plain"
                  pressed={maxTokens === p.v}
                  onClick={() => {
                    setMaxTokens(p.v);
                    setSaved(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>

        {/* JSON-LD structured data (Article/FAQ/HowTo + Author/Organization) khi đăng */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('schemaTitle')}
            </Text>
            <Checkbox
              label={<HelpLabel label={t('schemaToggle')} help={t('schemaToggleHelp')} />}
              checked={jsonLd.enabled}
              onChange={(v) => patchJsonLd({ enabled: v })}
              helpText={t('schemaHelp')}
            />
            {jsonLd.enabled ? (
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <TextField
                  label={<HelpLabel label={t('schemaOrg')} help={t('schemaOrgHelp')} />}
                  value={jsonLd.organizationName ?? ''}
                  onChange={(v) => patchJsonLd({ organizationName: v })}
                  autoComplete="organization"
                  placeholder="Acme Inc."
                />
                <TextField
                  label={<HelpLabel label={t('schemaAuthor')} help={t('schemaAuthorHelp')} />}
                  value={jsonLd.authorName ?? ''}
                  onChange={(v) => patchJsonLd({ authorName: v })}
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                />
                <TextField
                  label={t('schemaLogo')}
                  value={jsonLd.logoUrl ?? ''}
                  onChange={(v) => patchJsonLd({ logoUrl: v })}
                  autoComplete="off"
                  placeholder="https://…/logo.png"
                  helpText={t('schemaLogoHelp')}
                />
              </InlineGrid>
            ) : null}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {t('rulesTitle')}
            </Text>

            {rules.length === 0 ? (
              <Text as="p" tone="subdued">
                {t('empty')}
              </Text>
            ) : (
              <>
                {/* DESKTOP (≥490px): dạng bảng — header + hàng thẳng cột. Ẩn trên mobile. */}
                <div className="rules-desktop">
                  <BlockStack gap="300">
                    {/* Tiêu đề cột — khung cột DÙNG CHUNG với hàng dữ liệu để thẳng cột. */}
                    <InlineGrid columns={{ xs: 1, sm: '1fr 1fr 56px 88px 40px' }} gap="300" alignItems="center">
                      <Text as="span" variant="bodySm" tone="subdued">{t('from')}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">{t('to')}</Text>
                      <Text as="span" variant="bodySm" tone="subdued" alignment="center">{t('wholeWord')}</Text>
                      <Text as="span" variant="bodySm" tone="subdued" alignment="center">{t('caseSensitive')}</Text>
                      <span />
                    </InlineGrid>

                    {rules.map((r, i) => (
                      <InlineGrid
                        key={i}
                        columns={{ xs: 1, sm: '1fr 1fr 56px 88px 40px' }}
                        gap="300"
                        alignItems="center"
                      >
                        <TextField
                          label={t('from')}
                          labelHidden
                          value={r.from}
                          onChange={(v) => patch(i, { from: v })}
                          placeholder={t('fromPlaceholder')}
                          autoComplete="off"
                        />
                        <TextField
                          label={t('to')}
                          labelHidden
                          value={r.to}
                          onChange={(v) => patch(i, { to: v })}
                          placeholder={t('toPlaceholder')}
                          autoComplete="off"
                        />
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <Checkbox
                            label={t('wholeWord')}
                            labelHidden
                            checked={!!r.wholeWord}
                            onChange={(v) => patch(i, { wholeWord: v })}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <Checkbox
                            label={t('caseSensitive')}
                            labelHidden
                            checked={!!r.caseSensitive}
                            onChange={(v) => patch(i, { caseSensitive: v })}
                          />
                        </div>
                        <Button
                          icon={XIcon}
                          variant="tertiary"
                          tone="critical"
                          accessibilityLabel={t('removeRule')}
                          onClick={() => removeRule(i)}
                        />
                      </InlineGrid>
                    ))}
                  </BlockStack>
                </div>

                {/* MOBILE (<490px): mỗi quy tắc là 1 thẻ có nhãn rõ ràng, không dồn cột. */}
                <div className="rules-mobile">
                  <BlockStack gap="300">
                    {rules.map((r, i) => (
                      <Box
                        key={i}
                        padding="300"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                        background="bg-surface-secondary"
                      >
                        <BlockStack gap="300">
                          <TextField
                            label={t('from')}
                            value={r.from}
                            onChange={(v) => patch(i, { from: v })}
                            placeholder={t('fromPlaceholder')}
                            autoComplete="off"
                          />
                          <TextField
                            label={t('to')}
                            value={r.to}
                            onChange={(v) => patch(i, { to: v })}
                            placeholder={t('toPlaceholder')}
                            autoComplete="off"
                          />
                          <InlineStack gap="400" wrap blockAlign="center">
                            <Checkbox
                              label={t('wholeWord')}
                              checked={!!r.wholeWord}
                              onChange={(v) => patch(i, { wholeWord: v })}
                            />
                            <Checkbox
                              label={t('caseSensitive')}
                              checked={!!r.caseSensitive}
                              onChange={(v) => patch(i, { caseSensitive: v })}
                            />
                          </InlineStack>
                          <InlineStack align="end">
                            <Button
                              icon={XIcon}
                              variant="tertiary"
                              tone="critical"
                              onClick={() => removeRule(i)}
                            >
                              {t('removeRule')}
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                </div>
              </>
            )}

            <Box>
              <Button onClick={addRule}>{t('addRule')}</Button>
            </Box>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              {t('exampleTitle')}
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {t('exampleBody')}
            </Text>
            <InlineStack gap="200" wrap>
              <Button
                onClick={() => setRules((rs) => [...(rs ?? []), { from: 'ai', to: 'AI', wholeWord: true }])}
                variant="plain"
              >
                + “ai” → “AI”
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
