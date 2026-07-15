'use client';

import { Banner, FormLayout, Modal, Select, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { localeNames, locales } from '@/i18n/config';

export type CmsProvider = 'wordpress' | 'wix' | 'shopify' | 'haravan' | 'sapo';

interface FieldDef {
  key: string;
  label: string;
  password?: boolean;
  optional?: boolean;
}

export const PROVIDER_CFG: Record<
  CmsProvider,
  { name: string; baseLabel: string; basePlaceholder: string; fields: FieldDef[]; guideKey: string }
> = {
  wordpress: {
    name: 'WordPress',
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
    baseLabel: 'Store domain',
    basePlaceholder: 'your-store.myshopify.com',
    fields: [
      { key: 'accessToken', label: 'Admin API access token', password: true },
      { key: 'blogId', label: 'Blog ID', optional: true },
    ],
    guideKey: 'guideShopify',
  },
  haravan: {
    name: 'Haravan',
    baseLabel: 'Store URL',
    basePlaceholder: 'your-store.myharavan.com',
    fields: [
      { key: 'accessToken', label: 'Private App access token', password: true },
      { key: 'blogId', label: 'Blog ID', optional: true },
    ],
    guideKey: 'guideHaravan',
  },
  sapo: {
    name: 'Sapo',
    baseLabel: 'Store domain',
    basePlaceholder: 'your-store.mysapo.net',
    fields: [
      { key: 'apiKey', label: 'API Key', password: true },
      { key: 'apiSecret', label: 'API Secret', password: true },
      { key: 'blogId', label: 'Blog ID', optional: true },
    ],
    guideKey: 'guideSapo',
  },
};

// Modal thêm kết nối CMS (WordPress/Wix/Shopify). Dùng chung cho trang Quản lý kết nối.
export function AddConnectionModal({
  locale,
  presetProvider,
  onClose,
  onSaved,
}: {
  locale: string;
  presetProvider?: CmsProvider;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tc = useTranslations('connections');
  const [provider, setProvider] = useState<CmsProvider>(presetProvider ?? 'wordpress');
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
        { content: tc('cancel'), onAction: onClose },
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
              { label: 'Haravan', value: 'haravan' },
              { label: 'Sapo', value: 'sapo' },
            ]}
            value={provider}
            onChange={(v) => {
              setProvider(v as CmsProvider);
              setCreds({});
              setResult(null);
            }}
          />

          <Banner tone="info">
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
              label={`${f.label}${f.optional ? ` (${tc('optional')})` : ''}`}
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
