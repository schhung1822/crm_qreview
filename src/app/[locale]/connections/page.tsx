'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Modal,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '@/components/brand-logos';
import { PlusIcon } from '@/components/icons';
import { localeNames, locales } from '@/i18n/config';

type Provider = 'wordpress' | 'wix' | 'shopify';

interface Conn {
  id: string;
  provider: Provider;
  label: string;
  baseUrl: string;
  locale: string;
  pathStrategy: 'subdir' | 'subdomain';
  seoPlugin?: string;
  status: 'active' | 'error';
}

interface FieldDef {
  key: string;
  label: string;
  password?: boolean;
  optional?: boolean;
}

const PROVIDER_CFG: Record<
  Provider,
  { name: string; color: string; text: string; baseLabel: string; basePlaceholder: string; fields: FieldDef[]; guideKey: string }
> = {
  wordpress: {
    name: 'WordPress',
    color: '#21759b',
    text: '#fff',
    baseLabel: 'Site URL',
    basePlaceholder: 'https://yoursite.com',
    fields: [
      { key: 'username', label: 'Username' },
      { key: 'appPassword', label: 'Application Password', password: true },
    ],
    guideKey: 'guideWordpress',
  },
  wix: {
    name: 'Wix',
    color: '#faad4d',
    text: '#1a1a1a',
    baseLabel: 'Site URL',
    basePlaceholder: 'https://your-site.wixsite.com',
    fields: [
      { key: 'apiKey', label: 'API Key', password: true },
      { key: 'siteId', label: 'Site ID' },
      { key: 'accountId', label: 'Account ID', optional: true },
    ],
    guideKey: 'guideWix',
  },
  shopify: {
    name: 'Shopify',
    color: '#95bf47',
    text: '#fff',
    baseLabel: 'Store domain',
    basePlaceholder: 'your-store.myshopify.com',
    fields: [
      { key: 'accessToken', label: 'Admin API access token', password: true },
      { key: 'blogId', label: 'Blog ID', optional: true },
    ],
    guideKey: 'guideShopify',
  },
};

export default function ConnectionsPage() {
  const t = useTranslations();
  const tc = useTranslations('connections');
  const locale = useLocale();

  const [conns, setConns] = useState<Conn[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/connections');
    if (res.ok) setConns((await res.json()).connections);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page
      title={tc('title')}
      subtitle={tc('subtitle')}
      primaryAction={{ content: tc('add'), icon: PlusIcon, onAction: () => setOpen(true) }}
    >
      <BlockStack gap="400">
        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <Text as="h2" variant="headingSm">
              {tc('connected')}
            </Text>
          </Box>
          {conns === null ? (
            <Box padding="400">
              <Spinner size="small" />
            </Box>
          ) : conns.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                {tc('empty')}
              </Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {conns.map((c) => (
                <Box key={c.id} padding="400" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack gap="400" blockAlign="center" wrap={false}>
                    <BrandLogo provider={c.provider} />
                    <div style={{ flex: 1 }}>
                      <Text as="p" fontWeight="semibold">
                        {c.label}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {PROVIDER_CFG[c.provider].name} · {c.baseUrl}
                        {c.seoPlugin && c.seoPlugin !== 'none' ? ` · ${c.seoPlugin}` : ''}
                      </Text>
                    </div>
                    <Badge>{`${localeNames[c.locale as keyof typeof localeNames]?.flag ?? ''} ${c.locale}`}</Badge>
                    <Badge tone={c.status === 'active' ? 'success' : 'critical'}>
                      {c.status === 'active' ? tc('connectedBadge') : tc('error')}
                    </Badge>
                    <Button
                      variant="tertiary"
                      tone="critical"
                      loading={busyId === c.id}
                      onClick={() => remove(c.id)}
                    >
                      {tc('delete')}
                    </Button>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              {tc('systemLanguages')} ({locales.length})
            </Text>
            <InlineStack gap="200" wrap>
              {locales.map((l) => (
                <Badge key={l} tone={l === 'vi' ? 'info' : undefined}>
                  {`${localeNames[l].flag} ${l}`}
                </Badge>
              ))}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {tc('languagesNote')}
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>

      {open ? (
        <AddConnectionModal
          locale={locale}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
    </Page>
  );
}

function AddConnectionModal({
  locale,
  onClose,
  onSaved,
}: {
  locale: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tc = useTranslations('connections');
  const [provider, setProvider] = useState<Provider>('wordpress');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [lang, setLang] = useState(locale);
  const [pathStrategy, setPathStrategy] = useState<'subdir' | 'subdomain'>('subdir');
  const [seoPlugin, setSeoPlugin] = useState('none');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const cfg = PROVIDER_CFG[provider];

  const payload = useMemo(
    () => ({
      provider,
      label: label || cfg.name,
      baseUrl,
      locale: lang,
      pathStrategy,
      seoPlugin: provider === 'wordpress' ? seoPlugin : undefined,
      credentials: creds,
    }),
    [provider, label, baseUrl, lang, pathStrategy, seoPlugin, creds, cfg.name],
  );

  const canSubmit =
    baseUrl.trim().length > 0 &&
    cfg.fields.filter((f) => !f.optional).every((f) => (creds[f.key] ?? '').trim().length > 0);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setResult({ ok: Boolean(json.ok), msg: json.ok ? tc('testOk') : json.error ?? tc('testFail') });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tc('add')}
      primaryAction={{ content: tc('save'), onAction: save, loading: saving, disabled: !canSubmit }}
      secondaryActions={[
        { content: tc('test'), onAction: test, loading: testing, disabled: !canSubmit },
        { content: 'Hủy', onAction: onClose },
      ]}
    >
      <Modal.Section>
        <FormLayout>
          <Select
            label={tc('provider')}
            options={[
              { label: 'WordPress', value: 'wordpress' },
              { label: 'Wix', value: 'wix' },
              { label: 'Shopify', value: 'shopify' },
            ]}
            value={provider}
            onChange={(v) => {
              setProvider(v as Provider);
              setCreds({});
              setResult(null);
            }}
          />

          <Banner tone="info">
            {/* Giữ xuống dòng để hiển thị hướng dẫn nhiều bước. */}
            <div style={{ whiteSpace: 'pre-line' }}>{tc(cfg.guideKey)}</div>
          </Banner>

          <TextField label={tc('label')} value={label} onChange={setLabel} autoComplete="off" placeholder={cfg.name} />
          <TextField
            label={cfg.baseLabel}
            value={baseUrl}
            onChange={setBaseUrl}
            autoComplete="off"
            placeholder={cfg.basePlaceholder}
          />

          {cfg.fields.map((f) => (
            <TextField
              key={f.key}
              label={`${f.label}${f.optional ? ' (tùy chọn)' : ''}`}
              type={f.password ? 'password' : 'text'}
              value={creds[f.key] ?? ''}
              onChange={(v) => setCreds((s) => ({ ...s, [f.key]: v }))}
              autoComplete="off"
            />
          ))}

          <FormLayout.Group>
            <Select
              label={tc('language')}
              options={locales.map((l) => ({ label: `${localeNames[l].flag} ${l}`, value: l }))}
              value={lang}
              onChange={setLang}
            />
            <Select
              label={tc('urlStructure')}
              options={[
                { label: 'subdir  /vi/', value: 'subdir' },
                { label: 'subdomain  vi.', value: 'subdomain' },
              ]}
              value={pathStrategy}
              onChange={(v) => setPathStrategy(v as 'subdir' | 'subdomain')}
            />
          </FormLayout.Group>

          {provider === 'wordpress' ? (
            <Select
              label={tc('seoPlugin')}
              options={[
                { label: 'Không / Khác', value: 'none' },
                { label: 'Yoast SEO', value: 'yoast' },
                { label: 'Rank Math', value: 'rankmath' },
              ]}
              value={seoPlugin}
              onChange={setSeoPlugin}
            />
          ) : null}

          {result ? <Banner tone={result.ok ? 'success' : 'critical'}>{result.msg}</Banner> : null}
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
