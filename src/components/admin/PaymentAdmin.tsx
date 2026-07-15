'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiErrText } from '@/lib/admin/api-error';

// Danh sách ngân hàng phổ biến (mã theo chuẩn VietQR/Sepay).
const BANKS: Array<{ code: string; name: string }> = [
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'MB', name: 'MB Bank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'ICB', name: 'VietinBank' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'MSB', name: 'MSB' },
  { code: 'VIB', name: 'VIB' },
  { code: 'SHB', name: 'SHB' },
  { code: 'HDB', name: 'HDBank' },
  { code: 'OCB', name: 'OCB' },
  { code: 'SEAB', name: 'SeABank' },
  { code: 'VBA', name: 'Agribank' },
  { code: 'EIB', name: 'Eximbank' },
  { code: 'NAB', name: 'Nam A Bank' },
];

type AuthMethod = 'apikey' | 'hmac';

interface State {
  enabled: boolean;
  bankAccount: string;
  bankCode: string;
  accountHolder: string;
  contentPrefix: string;
  authMethod: AuthMethod;
  signatureHeader: string;
  apiKeySet: boolean;
  hmacSecretSet: boolean;
  webhookPath: string;
}

export function PaymentAdmin() {
  const t = useTranslations('admin');
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [f, setF] = useState({ enabled: false, bankAccount: '', bankCode: 'VCB', accountHolder: '', contentPrefix: 'NOTI', authMethod: 'apikey' as AuthMethod, signatureHeader: 'X-Signature', apiKey: '', hmacSecret: '' });

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/payment');
    if (r.ok) {
      const d: State = await r.json();
      setSt(d);
      setF((s) => ({
        ...s,
        enabled: d.enabled,
        bankAccount: d.bankAccount,
        bankCode: d.bankCode || 'VCB',
        accountHolder: d.accountHolder,
        contentPrefix: d.contentPrefix || 'NOTI',
        authMethod: d.authMethod || 'apikey',
        signatureHeader: d.signatureHeader || 'X-Signature',
        apiKey: '',
        hmacSecret: '',
      }));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: f.enabled,
          bankAccount: f.bankAccount,
          bankCode: f.bankCode,
          accountHolder: f.accountHolder,
          contentPrefix: f.contentPrefix,
          authMethod: f.authMethod,
          signatureHeader: f.signatureHeader,
          ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}),
          ...(f.hmacSecret.trim() ? { hmacSecret: f.hmacSecret.trim() } : {}),
        }),
      });
      if (r.ok) {
        setMsg({ ok: true, text: t('paySaved') });
        await load();
      } else setMsg({ ok: false, text: apiErrText(await r.json().catch(() => null), t) });
    } finally {
      setBusy(false);
    }
  }

  if (!st)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const webhookUrl = origin + st.webhookPath;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">
          {t('payTitle')}
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {t('payHelp')}
        </Text>
      </BlockStack>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      <Card>
        <BlockStack gap="300">
          <Checkbox label={t('payEnabled')} checked={f.enabled} onChange={(v) => setF((s) => ({ ...s, enabled: v }))} />
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
            <TextField label={t('payAccount')} value={f.bankAccount} onChange={(v) => setF((s) => ({ ...s, bankAccount: v }))} autoComplete="off" />
            <Select label={t('payBank')} options={BANKS.map((b) => ({ label: `${b.name} (${b.code})`, value: b.code }))} value={f.bankCode} onChange={(v) => setF((s) => ({ ...s, bankCode: v }))} />
            <TextField label={t('payHolder')} value={f.accountHolder} onChange={(v) => setF((s) => ({ ...s, accountHolder: v.toUpperCase() }))} autoComplete="off" helpText={t('payHolderHint')} />
            <TextField label={t('payPrefix')} value={f.contentPrefix} onChange={(v) => setF((s) => ({ ...s, contentPrefix: v.toUpperCase() }))} autoComplete="off" helpText={t('payPrefixHint')} />
          </InlineGrid>
          <Select
            label={t('payAuthMethod')}
            options={[
              { label: t('payAuthApikey'), value: 'apikey' },
              { label: t('payAuthHmac'), value: 'hmac' },
            ]}
            value={f.authMethod}
            onChange={(v) => setF((s) => ({ ...s, authMethod: v as AuthMethod }))}
            helpText={t('payAuthHint')}
          />
          {f.authMethod === 'apikey' ? (
            <TextField
              label={t('payApiKey')}
              type="password"
              value={f.apiKey}
              onChange={(v) => setF((s) => ({ ...s, apiKey: v }))}
              autoComplete="off"
              helpText={st.apiKeySet ? t('payApiKeyHint') : t('payApiKeyHint2')}
              connectedRight={st.apiKeySet ? <Box paddingBlockStart="150"><Badge tone="success">{t('paySet')}</Badge></Box> : undefined}
            />
          ) : (
            <>
              <TextField
                label={t('payHmacSecret')}
                type="password"
                value={f.hmacSecret}
                onChange={(v) => setF((s) => ({ ...s, hmacSecret: v }))}
                autoComplete="off"
                helpText={st.hmacSecretSet ? t('payHmacSecretHint') : t('payHmacSecretHint2')}
                connectedRight={st.hmacSecretSet ? <Box paddingBlockStart="150"><Badge tone="success">{t('paySet')}</Badge></Box> : undefined}
              />
              <TextField
                label={t('payHmacHeader')}
                value={f.signatureHeader}
                onChange={(v) => setF((s) => ({ ...s, signatureHeader: v }))}
                autoComplete="off"
                placeholder="X-Signature"
                helpText={t('payHmacHeaderHint')}
              />
            </>
          )}
          <InlineStack>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {t('paySave')}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="150">
          <Text as="h3" variant="headingSm">
            {t('payWebhook')}
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            {t('payWebhookHelp')}
          </Text>
          <Box background="bg-surface-secondary" padding="200" borderRadius="200">
            <div style={{ overflowX: 'auto', fontFamily: 'monospace', fontSize: 13 }}>{webhookUrl}</div>
          </Box>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
