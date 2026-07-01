'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { HideIcon, ViewIcon } from '@shopify/polaris-icons';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ExtLink } from '@/components/ui';

type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek';
type Task = 'writing' | 'analysis';

interface ProviderStatus {
  id: ProviderId;
  label: string;
  keyHint: string;
  hasKey: boolean;
  source: 'store' | 'env' | 'none';
  masked?: string;
  enabled: boolean;
  model: string;
  defaultModel: string;
}

interface StatusResponse {
  providers: ProviderStatus[];
  routing: Record<Task, ProviderId>;
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const [data, setData] = useState<StatusResponse | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<Record<string, { ok: boolean; msg: string } | undefined>>({});
  const [models, setModels] = useState<
    Record<string, { loading: boolean; options: string[]; error?: string }>
  >({});
  // Hiển thị / che / sửa khóa trong ô API key.
  const [editKey, setEditKey] = useState<Record<string, boolean>>({});
  const [revealKey, setRevealKey] = useState<Record<string, boolean>>({});
  const [fullKey, setFullKey] = useState<Record<string, string>>({});

  // Báo cáo khả dụng: kết nối CMS.
  const [connections, setConnections] = useState<
    Array<{ id: string; label: string; provider: string; locale: string; status: string }> | null
  >(null);
  useEffect(() => {
    fetch('/api/connections')
      .then((r) => (r.ok ? r.json() : { connections: [] }))
      .then((d) => setConnections(d.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  // Mắt: xem full khóa AI provider (tải về khi cần), hoặc che lại.
  async function toggleRevealProvider(id: ProviderId) {
    if (revealKey[id]) {
      setRevealKey((s) => ({ ...s, [id]: false }));
      return;
    }
    if (fullKey[id] == null) {
      const res = await fetch(`/api/ai-keys/reveal?provider=${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setFullKey((s) => ({ ...s, [id]: d.key as string }));
    }
    setRevealKey((s) => ({ ...s, [id]: true }));
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/ai-keys');
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Khóa API tích hợp ngoài AI (PageSpeed…) - gom chung tại đây cho gọn.
  interface IntStatus {
    id: string;
    label: string;
    hintKey: string;
    hasKey: boolean;
    source: 'store' | 'env' | 'none';
    masked?: string;
  }
  const [integrations, setIntegrations] = useState<IntStatus[] | null>(null);
  const [intInputs, setIntInputs] = useState<Record<string, string>>({});
  const [openGuide, setOpenGuide] = useState<Record<string, boolean>>({});
  const [intEdit, setIntEdit] = useState<Record<string, boolean>>({});
  const [intReveal, setIntReveal] = useState<Record<string, boolean>>({});
  const [intFull, setIntFull] = useState<Record<string, string>>({});

  async function toggleRevealIntegration(id: string) {
    if (intReveal[id]) {
      setIntReveal((s) => ({ ...s, [id]: false }));
      return;
    }
    if (intFull[id] == null) {
      const res = await fetch(`/api/integration-keys?reveal=${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setIntFull((s) => ({ ...s, [id]: d.key as string }));
    }
    setIntReveal((s) => ({ ...s, [id]: true }));
  }
  const loadIntegrations = useCallback(async () => {
    const res = await fetch('/api/integration-keys');
    if (res.ok) setIntegrations((await res.json()).integrations);
  }, []);
  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  async function saveIntegration(id: string) {
    const value = intInputs[id]?.trim();
    if (!value) return;
    setBusy(`int-${id}`);
    try {
      const res = await fetch('/api/integration-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value }),
      });
      if (res.ok) {
        setIntegrations((await res.json()).integrations);
        setIntInputs((s) => ({ ...s, [id]: '' }));
        setIntEdit((s) => ({ ...s, [id]: false }));
        setIntReveal((s) => ({ ...s, [id]: false }));
        setIntFull((s) => {
          const n = { ...s };
          delete n[id];
          return n;
        });
      }
    } finally {
      setBusy(null);
    }
  }
  async function removeIntegration(id: string) {
    setBusy(`int-del-${id}`);
    try {
      const res = await fetch(`/api/integration-keys?id=${id}`, { method: 'DELETE' });
      if (res.ok) setIntegrations((await res.json()).integrations);
    } finally {
      setBusy(null);
    }
  }

  // Tải danh sách model thật từ API của provider (dùng key đã lưu hoặc key vừa nhập).
  const loadModels = useCallback(async (provider: ProviderId, key?: string) => {
    setModels((s) => ({ ...s, [provider]: { loading: true, options: s[provider]?.options ?? [] } }));
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.models)) {
        const opts: string[] = d.models;
        setModels((s) => ({ ...s, [provider]: { loading: false, options: opts } }));
        // Nếu model đang chọn không có trong danh sách (vd default đã lỗi thời) → tự chọn model hợp lệ.
        setData((prev) => {
          if (!prev || !opts.length) return prev;
          const p = prev.providers.find((x) => x.id === provider);
          if (p && !opts.includes(p.model)) {
            const best = opts.find((m) => /flash|mini|sonnet|pro|chat/i.test(m)) ?? opts[0];
            void fetch('/api/ai-keys', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'model', provider, model: best }),
            });
            return updateModel(prev, provider, best);
          }
          return prev;
        });
      } else {
        setModels((s) => ({ ...s, [provider]: { loading: false, options: [], error: d.error } }));
      }
    } catch {
      setModels((s) => ({ ...s, [provider]: { loading: false, options: [], error: 'network' } }));
    }
  }, []);

  // Provider đã có key → tự tải models một lần.
  useEffect(() => {
    if (!data) return;
    data.providers.forEach((p) => {
      if (p.hasKey && !models[p.id]) void loadModels(p.id);
    });
  }, [data, models, loadModels]);

  async function post(body: unknown, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch('/api/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setData(await res.json());
    } finally {
      setBusy(null);
    }
  }

  async function saveKey(provider: ProviderId) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    await post({ action: 'setKey', provider, key }, `save-${provider}`);
    void loadModels(provider, key); // tải models ngay bằng key vừa nhập
    setInputs((s) => ({ ...s, [provider]: '' }));
    setEditKey((s) => ({ ...s, [provider]: false }));
    setRevealKey((s) => ({ ...s, [provider]: false }));
    setFullKey((s) => {
      const n = { ...s };
      delete n[provider];
      return n;
    });
  }

  async function removeKey(provider: ProviderId) {
    setBusy(`del-${provider}`);
    try {
      const res = await fetch(`/api/ai-keys?provider=${provider}`, { method: 'DELETE' });
      if (res.ok) setData(await res.json());
      setEditKey((s) => ({ ...s, [provider]: false }));
      setRevealKey((s) => ({ ...s, [provider]: false }));
      setFullKey((s) => {
        const n = { ...s };
        delete n[provider];
        return n;
      });
    } finally {
      setBusy(null);
    }
  }

  async function testKey(provider: ProviderId) {
    setBusy(`test-${provider}`);
    setTest((s) => ({ ...s, [provider]: undefined }));
    try {
      const res = await fetch('/api/ai-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: inputs[provider]?.trim() || undefined }),
      });
      const json = await res.json();
      setTest((s) => ({
        ...s,
        [provider]: { ok: Boolean(json.ok), msg: json.ok ? t('testOk') : json.error ?? t('testFail') },
      }));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Page title={t('title')}>
        <Card>
          <Text as="p" tone="subdued">
            {t('loading')}
          </Text>
        </Card>
      </Page>
    );
  }


  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Banner tone="info">{t('securityNote')}</Banner>

        <Banner tone="info">{t('routingMoved')}</Banner>

        {/* Báo cáo khả dụng: AI nào dùng được + kết nối CMS nào dùng được */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingSm">
              {t('reportTitle')}
            </Text>

            <BlockStack gap="200">
              <Text as="h3" variant="headingXs" tone="subdued">
                {t('reportAi')}
              </Text>
              {data.providers.map((p) => (
                <InlineStack key={p.id} align="space-between" blockAlign="center">
                  <Text as="span" variant="bodySm">
                    {p.label}
                    {p.hasKey ? ` · ${p.model}` : ''}
                  </Text>
                  <Badge tone={!p.hasKey ? undefined : p.enabled ? 'success' : 'warning'}>
                    {!p.hasKey
                      ? t('reportNotSet')
                      : p.enabled
                        ? t('reportAvailable')
                        : t('reportDisabled')}
                  </Badge>
                </InlineStack>
              ))}
            </BlockStack>

            {integrations && integrations.length ? (
              <>
                <Divider />
                <BlockStack gap="200">
                  <Text as="h3" variant="headingXs" tone="subdued">
                    {t('reportInt')}
                  </Text>
                  {integrations.map((it) => (
                    <InlineStack key={it.id} align="space-between" blockAlign="center">
                      <Text as="span" variant="bodySm">
                        {it.label}
                      </Text>
                      <Badge tone={it.hasKey ? 'success' : undefined}>
                        {it.hasKey ? t('reportAvailable') : t('reportNotSet')}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </>
            ) : null}

            <Divider />
            <BlockStack gap="200">
              <Text as="h3" variant="headingXs" tone="subdued">
                {t('reportConn')}
              </Text>
              {connections === null ? (
                <Text as="span" variant="bodySm" tone="subdued">
                  {t('loading')}
                </Text>
              ) : connections.length === 0 ? (
                <Text as="span" variant="bodySm" tone="subdued">
                  {t('reportNoConn')}
                </Text>
              ) : (
                connections.map((c) => (
                  <InlineStack key={c.id} align="space-between" blockAlign="center">
                    <Text as="span" variant="bodySm">
                      {`${c.label} · ${c.provider} · ${c.locale}`}
                    </Text>
                    <Badge tone={c.status === 'active' ? 'success' : 'critical'}>
                      {c.status === 'active' ? t('reportAvailable') : t('reportError')}
                    </Badge>
                  </InlineStack>
                ))
              )}
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Từng provider */}
        {data.providers.map((p) => (
          <Card key={p.id}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    {p.label}
                  </Text>
                  {p.hasKey ? (
                    <Badge tone={p.enabled ? 'success' : undefined}>
                      {p.enabled
                        ? `${t('active')} · ${p.masked}${p.source === 'env' ? ' (env)' : ''}`
                        : t('disabled')}
                    </Badge>
                  ) : (
                    <Badge>{t('noKey')}</Badge>
                  )}
                </InlineStack>
                {p.hasKey ? (
                  <Button
                    variant="tertiary"
                    tone={p.enabled ? 'critical' : undefined}
                    loading={busy === `en-${p.id}`}
                    onClick={() => post({ action: 'enable', provider: p.id, enabled: !p.enabled }, `en-${p.id}`)}
                  >
                    {p.enabled ? t('disable') : t('enable')}
                  </Button>
                ) : null}
              </InlineStack>

              {(() => {
                const editing = editKey[p.id] || !p.hasKey;
                const revealed = !!revealKey[p.id];
                const ms = models[p.id] ?? { loading: false, options: [] as string[] };
                const merged = Array.from(new Set([...ms.options, p.model])).filter(Boolean);
                const modelOptions = p.hasKey
                  ? merged.map((m) => ({ label: m, value: m }))
                  : [{ label: t('enterKeyFirst'), value: p.model }];
                return (
                  <>
                    <InlineGrid columns={{ xs: 1, md: '2fr 1fr' }} gap="300" alignItems="end">
                      <KeyField
                        label={t('apiKey')}
                        value={
                          editing
                            ? inputs[p.id] ?? ''
                            : revealed
                              ? fullKey[p.id] ?? ''
                              : p.masked ?? ''
                        }
                        type={editing ? (revealed ? 'text' : 'password') : 'text'}
                        readOnly={!editing}
                        placeholder={editing ? p.keyHint : undefined}
                        revealed={revealed}
                        onToggle={() =>
                          editing
                            ? setRevealKey((s) => ({ ...s, [p.id]: !s[p.id] }))
                            : void toggleRevealProvider(p.id)
                        }
                        onChange={editing ? (v) => setInputs((s) => ({ ...s, [p.id]: v })) : undefined}
                      />
                      <Select
                        label={t('model')}
                        options={modelOptions}
                        value={p.model}
                        disabled={!p.hasKey || ms.loading}
                        onChange={(model) => {
                          setData((d) => d && updateModel(d, p.id, model));
                          void post({ action: 'model', provider: p.id, model }, `m-${p.id}`);
                        }}
                      />
                    </InlineGrid>

                    {p.hasKey ? (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="subdued">
                          {`${t('default')}: ${p.defaultModel}`}
                        </Text>
                        {ms.loading ? (
                          <InlineStack gap="100" blockAlign="center">
                            <Spinner size="small" />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {t('loadingModels')}
                            </Text>
                          </InlineStack>
                        ) : (
                          <Button variant="plain" onClick={() => loadModels(p.id)}>
                            {t('reloadModels')}
                          </Button>
                        )}
                        {ms.error ? (
                          <Text as="span" variant="bodySm" tone="critical">
                            {t('modelLoadFail')}
                          </Text>
                        ) : null}
                      </InlineStack>
                    ) : null}

                    <InlineStack gap="200">
                      {editing ? (
                        <>
                          <Button
                            variant="primary"
                            disabled={!inputs[p.id]?.trim()}
                            loading={busy === `save-${p.id}`}
                            onClick={() => saveKey(p.id)}
                          >
                            {t('saveKey')}
                          </Button>
                          {p.hasKey ? (
                            <Button
                              onClick={() => {
                                setEditKey((s) => ({ ...s, [p.id]: false }));
                                setInputs((s) => ({ ...s, [p.id]: '' }));
                              }}
                            >
                              {t('cancel')}
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <Button onClick={() => setEditKey((s) => ({ ...s, [p.id]: true }))}>
                          {t('replaceKey')}
                        </Button>
                      )}
                      <Button
                        loading={busy === `test-${p.id}`}
                        disabled={!p.hasKey && !inputs[p.id]?.trim()}
                        onClick={() => testKey(p.id)}
                      >
                        {t('testConnection')}
                      </Button>
                      {p.source === 'store' ? (
                        <Button
                          variant="tertiary"
                          tone="critical"
                          loading={busy === `del-${p.id}`}
                          onClick={() => removeKey(p.id)}
                        >
                          {t('removeKey')}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </>
                );
              })()}

              {test[p.id] ? (
                <Box>
                  <Banner tone={test[p.id]!.ok ? 'success' : 'critical'}>{test[p.id]!.msg}</Banner>
                </Box>
              ) : null}
            </BlockStack>
          </Card>
        ))}

        {/* Khóa API tích hợp ngoài AI (PageSpeed…) - gom chung cho gọn */}
        {integrations && integrations.length ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {t('integrationsTitle')}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('integrationsDesc')}
              </Text>
              {integrations.map((it) => (
                <BlockStack key={it.id} gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {it.label}
                    </Text>
                    {it.hasKey ? (
                      <Badge tone="success">
                        {`${t('active')} · ${it.masked ?? ''}${it.source === 'env' ? ' (env)' : ''}`}
                      </Badge>
                    ) : (
                      <Badge>{t('noKey')}</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {t(`intHint.${it.hintKey}`)}
                  </Text>

                  {/* Hướng dẫn chi tiết lấy key - đọc & làm theo ngay trong app */}
                  <Box>
                    <Button
                      variant="plain"
                      onClick={() => setOpenGuide((s) => ({ ...s, [it.id]: !s[it.id] }))}
                    >
                      {openGuide[it.id] ? t('hideGuide') : t('showGuide')}
                    </Button>
                  </Box>
                  {openGuide[it.id] ? (
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="200">
                        {it.id === 'pagespeed' ? (
                          <InlineStack gap="300" wrap>
                            <ExtLink href="https://console.cloud.google.com">
                              {t('guideOpenConsole')}
                            </ExtLink>
                            <ExtLink href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com">
                              {t('guideEnableApi')}
                            </ExtLink>
                          </InlineStack>
                        ) : null}
                        <div style={{ whiteSpace: 'pre-line' }}>
                          <Text as="span" variant="bodySm">
                            {t(`intGuide.${it.hintKey}`)}
                          </Text>
                        </div>
                      </BlockStack>
                    </Box>
                  ) : null}

                  {(() => {
                    const editing = intEdit[it.id] || !it.hasKey;
                    const revealed = !!intReveal[it.id];
                    return (
                      <InlineGrid columns={{ xs: 1, md: '2fr 1fr' }} gap="300" alignItems="end">
                        <KeyField
                          label={t('apiKey')}
                          labelHidden
                          value={
                            editing
                              ? intInputs[it.id] ?? ''
                              : revealed
                                ? intFull[it.id] ?? ''
                                : it.masked ?? ''
                          }
                          type={editing ? (revealed ? 'text' : 'password') : 'text'}
                          readOnly={!editing}
                          placeholder={editing ? t('apiKey') : undefined}
                          revealed={revealed}
                          onToggle={() =>
                            editing
                              ? setIntReveal((s) => ({ ...s, [it.id]: !s[it.id] }))
                              : void toggleRevealIntegration(it.id)
                          }
                          onChange={
                            editing ? (v) => setIntInputs((s) => ({ ...s, [it.id]: v })) : undefined
                          }
                        />
                        <InlineStack gap="200">
                          {editing ? (
                            <>
                              <Button
                                variant="primary"
                                disabled={!intInputs[it.id]?.trim()}
                                loading={busy === `int-${it.id}`}
                                onClick={() => saveIntegration(it.id)}
                              >
                                {t('saveKey')}
                              </Button>
                              {it.hasKey ? (
                                <Button
                                  onClick={() => {
                                    setIntEdit((s) => ({ ...s, [it.id]: false }));
                                    setIntInputs((s) => ({ ...s, [it.id]: '' }));
                                  }}
                                >
                                  {t('cancel')}
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <Button onClick={() => setIntEdit((s) => ({ ...s, [it.id]: true }))}>
                              {t('replaceKey')}
                            </Button>
                          )}
                          {it.source === 'store' ? (
                            <Button
                              variant="tertiary"
                              tone="critical"
                              loading={busy === `int-del-${it.id}`}
                              onClick={() => removeIntegration(it.id)}
                            >
                              {t('removeKey')}
                            </Button>
                          ) : null}
                        </InlineStack>
                      </InlineGrid>
                    );
                  })()}
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        ) : null}

        <Divider />
        <Text as="p" tone="subdued" variant="bodySm">
          {t('envHint')}
        </Text>
      </BlockStack>
    </Page>
  );
}

function updateModel(d: StatusResponse, id: ProviderId, model: string): StatusResponse {
  return {
    ...d,
    providers: d.providers.map((p) => (p.id === id ? { ...p, model } : p)),
  };
}

// Ô nhập/hiển thị API key có nút con mắt để xem/che toàn bộ khóa.
function KeyField({
  label,
  labelHidden,
  value,
  type,
  readOnly,
  placeholder,
  revealed,
  onToggle,
  onChange,
}: {
  label: string;
  labelHidden?: boolean;
  value: string;
  type: 'text' | 'password';
  readOnly?: boolean;
  placeholder?: string;
  revealed: boolean;
  onToggle: () => void;
  onChange?: (value: string) => void;
}) {
  return (
    <TextField
      label={label}
      labelHidden={labelHidden}
      type={type}
      readOnly={readOnly}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={onChange ?? (() => {})}
      suffix={
        value ? (
          <button
            type="button"
            onClick={onToggle}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Icon source={revealed ? HideIcon : ViewIcon} tone="subdued" />
          </button>
        ) : undefined
      }
    />
  );
}
