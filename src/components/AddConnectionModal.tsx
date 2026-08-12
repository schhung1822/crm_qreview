'use client';

import { Banner, FormLayout, Modal, Select, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CONNECTION_PROVIDERS, type ConnectionProvider } from '@/lib/connection-providers';

export type { ConnectionProvider };

interface FieldDef {
  key: string;
  label: string;
  password?: boolean;
  optional?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export const PROVIDER_CFG: Record<
  ConnectionProvider,
  {
    name: string;
    kind: 'cms' | 'social';
    baseLabel: string;
    basePlaceholder: string;
    defaultBaseUrl?: string;
    fixedBaseUrl?: boolean;
    fields: FieldDef[];
    guideKey?: string;
    guide?: string;
  }
> = {
  wordpress: {
    name: 'WordPress',
    kind: 'cms',
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
    kind: 'cms',
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
    kind: 'cms',
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
    kind: 'cms',
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
    kind: 'cms',
    baseLabel: 'Store domain',
    basePlaceholder: 'your-store.mysapo.net',
    fields: [
      { key: 'apiKey', label: 'API Key', password: true },
      { key: 'apiSecret', label: 'API Secret', password: true },
      { key: 'blogId', label: 'Blog ID', optional: true },
    ],
    guideKey: 'guideSapo',
  },
  facebook: {
    name: 'Facebook Fanpage',
    kind: 'social',
    baseLabel: 'Facebook',
    basePlaceholder: 'https://www.facebook.com',
    defaultBaseUrl: 'https://www.facebook.com',
    fixedBaseUrl: true,
    fields: [
      { key: 'pageId', label: 'Page ID' },
      { key: 'accessToken', label: 'Page Access Token', password: true },
    ],
    guide: 'Tạo ứng dụng Meta, cấp pages_manage_posts và pages_read_engagement; sau đó nhập Page ID cùng Page Access Token dài hạn.',
  },
  instagram: {
    name: 'Instagram',
    kind: 'social',
    baseLabel: 'Instagram',
    basePlaceholder: 'https://www.instagram.com',
    defaultBaseUrl: 'https://www.instagram.com',
    fixedBaseUrl: true,
    fields: [
      { key: 'instagramUserId', label: 'Instagram User ID' },
      { key: 'accessToken', label: 'Meta Access Token', password: true },
    ],
    guide: 'Dùng tài khoản Instagram Professional. Cấp quyền instagram_basic và instagram_content_publish, rồi nhập Instagram User ID và token dài hạn.',
  },
  tiktok: {
    name: 'TikTok',
    kind: 'social',
    baseLabel: 'TikTok',
    basePlaceholder: 'https://www.tiktok.com',
    defaultBaseUrl: 'https://www.tiktok.com',
    fixedBaseUrl: true,
    fields: [{ key: 'accessToken', label: 'User Access Token', password: true }],
    guide: 'Bật Content Posting API trong TikTok for Developers và cấp scope video.publish. Ứng dụng chưa được TikTok kiểm duyệt chỉ có thể đăng ở chế độ riêng tư.',
  },
  threads: {
    name: 'Threads',
    kind: 'social',
    baseLabel: 'Threads',
    basePlaceholder: 'https://www.threads.net',
    defaultBaseUrl: 'https://www.threads.net',
    fixedBaseUrl: true,
    fields: [
      { key: 'threadsUserId', label: 'Threads User ID', optional: true },
      { key: 'accessToken', label: 'Threads Access Token', password: true },
    ],
    guide: 'Tạo ứng dụng Threads API và cấp threads_basic, threads_content_publish. Có thể để trống User ID để API sử dụng tài khoản me.',
  },
  youtube: {
    name: 'YouTube',
    kind: 'social',
    baseLabel: 'YouTube',
    basePlaceholder: 'https://www.youtube.com',
    defaultBaseUrl: 'https://www.youtube.com',
    fixedBaseUrl: true,
    fields: [
      { key: 'clientId', label: 'Google OAuth Client ID' },
      { key: 'clientSecret', label: 'Google OAuth Client Secret', password: true },
      { key: 'refreshToken', label: 'Google Refresh Token', password: true },
      {
        key: 'privacyStatus',
        label: 'Chế độ mặc định',
        optional: true,
        options: [
          { label: 'Riêng tư', value: 'private' },
          { label: 'Không công khai', value: 'unlisted' },
          { label: 'Công khai', value: 'public' },
        ],
      },
    ],
    guide: 'Bật YouTube Data API v3, tạo OAuth Client và cấp scope youtube.upload. YouTube chỉ hỗ trợ tải video; dự án API chưa được kiểm duyệt có thể bị giới hạn video ở chế độ riêng tư.',
  },
};

// Modal thêm kết nối CMS (WordPress/Wix/Shopify). Dùng chung cho trang Quản lý kết nối.
export function AddConnectionModal({
  presetProvider,
  onClose,
  onSaved,
}: {
  presetProvider?: ConnectionProvider;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tc = useTranslations('connections');
  const initialProvider = presetProvider ?? 'wordpress';
  const [provider, setProvider] = useState<ConnectionProvider>(initialProvider);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_CFG[initialProvider].defaultBaseUrl ?? '');
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
      seoPlugin: provider === 'wordpress' ? seoPlugin : undefined,
      credentials: creds,
      locale: 'vi',
    }),
    [provider, label, baseUrl, seoPlugin, creds, cfg.name],
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
            options={CONNECTION_PROVIDERS.map((id) => ({
              label: `${PROVIDER_CFG[id].name}${PROVIDER_CFG[id].kind === 'social' ? ' · Mạng xã hội' : ''}`,
              value: id,
            }))}
            value={provider}
            onChange={(v) => {
              const next = v as ConnectionProvider;
              setProvider(next);
              setCreds({});
              setBaseUrl(PROVIDER_CFG[next].defaultBaseUrl ?? '');
              setResult(null);
            }}
          />

          <Banner tone="info">
            <div style={{ whiteSpace: 'pre-line' }}>{cfg.guide ?? tc(cfg.guideKey!)}</div>
          </Banner>

          <TextField label={tc('label')} value={label} onChange={setLabel} autoComplete="off" placeholder={cfg.name} />
          {!cfg.fixedBaseUrl ? (
            <TextField
              label={cfg.baseLabel}
              value={baseUrl}
              onChange={setBaseUrl}
              autoComplete="off"
              placeholder={cfg.basePlaceholder}
            />
          ) : null}

          {cfg.fields.map((f) =>
            f.options ? (
              <Select
                key={f.key}
                label={`${f.label}${f.optional ? ` (${tc('optional')})` : ''}`}
                options={f.options}
                value={creds[f.key] ?? f.options[0]?.value ?? ''}
                onChange={(v) => setCreds((s) => ({ ...s, [f.key]: v }))}
              />
            ) : (
              <TextField
                key={f.key}
                label={`${f.label}${f.optional ? ` (${tc('optional')})` : ''}`}
                type={f.password ? 'password' : 'text'}
                value={creds[f.key] ?? ''}
                onChange={(v) => setCreds((s) => ({ ...s, [f.key]: v }))}
                autoComplete="off"
              />
            ),
          )}

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
