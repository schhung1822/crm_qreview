'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Divider,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

// Quản lý API token của biz: tạo (hiện token thô 1 lần), thu hồi, kèm hướng dẫn gọi API.
export function ApiTokensPanel({ bizId }: { bizId: string }) {
  const t = useTranslations('biz');
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null); // token thô, chỉ hiện 1 lần
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/biz/${bizId}/api-tokens`);
    if (res.ok) setTokens((await res.json()).tokens ?? []);
    else setTokens([]);
  }, [bizId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${bizId}/api-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.plaintext) {
        setCreated(d.plaintext);
        setName('');
        await load();
      } else {
        setMsg({ ok: false, text: d?.error || t('saveErr') });
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t('tokenRevokeConfirm'))) return;
    const res = await fetch(`/api/biz/${bizId}/api-tokens?tokenId=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
    setMsg({ ok: true, text: t('tokenCopied') });
  }

  const curl = `curl -X POST ${origin || 'https://your-domain'}/api/v1/articles \\
  -H "Authorization: Bearer sg_..." \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Bài mới","locale":"vi","markdown":"# Tiêu đề\\n\\nNội dung..."}'`;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">
          {t('tabApiTokens')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('apiTokensHelp')}
        </Text>
      </BlockStack>

      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      {created ? (
        <Banner tone="warning" title={t('tokenCreatedTitle')} onDismiss={() => setCreated(null)}>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm">
              {t('tokenCreatedHelp')}
            </Text>
            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
              <div style={{ overflowX: 'auto', fontFamily: 'monospace', fontSize: 13 }}>{created}</div>
            </Box>
            <InlineStack>
              <Button size="slim" onClick={() => copy(created)}>
                {t('tokenCopy')}
              </Button>
            </InlineStack>
          </BlockStack>
        </Banner>
      ) : null}

      {/* Tạo token mới */}
      <InlineStack gap="200" blockAlign="end" wrap>
        <div style={{ flex: '1 1 240px' }}>
          <TextField
            label={t('tokenName')}
            value={name}
            onChange={setName}
            autoComplete="off"
            placeholder={t('tokenNamePlaceholder')}
          />
        </div>
        <Button variant="primary" loading={busy} onClick={() => void create()}>
          {t('tokenCreate')}
        </Button>
      </InlineStack>

      <Divider />

      {/* Danh sách token */}
      {tokens === null ? (
        <Text as="p" tone="subdued" variant="bodySm">
          …
        </Text>
      ) : tokens.length === 0 ? (
        <Text as="p" tone="subdued" variant="bodySm">
          {t('tokenEmpty')}
        </Text>
      ) : (
        <BlockStack gap="200">
          {tokens.map((tk) => (
            <Box
              key={tk.id}
              padding="300"
              borderWidth="025"
              borderColor="border"
              borderRadius="200"
            >
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <BlockStack gap="050">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {tk.name}
                    </Text>
                    {tk.revoked ? <Badge tone="critical">{t('tokenRevoked')}</Badge> : null}
                  </InlineStack>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {tk.prefix}… · {t('tokenCreatedAt')}: {new Date(tk.createdAt).toLocaleDateString()}
                    {tk.lastUsedAt
                      ? ` · ${t('tokenLastUsed')}: ${new Date(tk.lastUsedAt).toLocaleDateString()}`
                      : ` · ${t('tokenNeverUsed')}`}
                  </Text>
                </BlockStack>
                {!tk.revoked ? (
                  <Button size="slim" tone="critical" variant="plain" onClick={() => void revoke(tk.id)}>
                    {t('tokenRevoke')}
                  </Button>
                ) : null}
              </InlineStack>
            </Box>
          ))}
        </BlockStack>
      )}

      <Divider />

      {/* Hướng dẫn dùng API */}
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">
          {t('apiDocsTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('apiDocsHelp')}
        </Text>
        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
          <div style={{ overflowX: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12.5, whiteSpace: 'pre' }}>
              {curl}
            </pre>
          </div>
        </Box>
      </BlockStack>
    </BlockStack>
  );
}
