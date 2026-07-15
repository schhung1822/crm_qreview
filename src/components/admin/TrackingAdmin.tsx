'use client';

import { Badge, Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Modal, Spinner, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { apiErrText } from '@/lib/admin/api-error';

interface PixelRow {
  id: string;
  pixelId?: string; // FB
  pixelCode?: string; // TikTok
  testCode: string;
  enabled: boolean;
  tokenSet: boolean;
  token: string; // nhập token mới (rỗng = giữ token cũ)
}
interface NamedResult {
  ok: boolean;
  status?: number;
  error?: string;
  label: string;
}
interface TestResult {
  fb: NamedResult[];
  tt: NamedResult[];
  ga4: NamedResult;
}
type Draft = { kind: 'fb' | 'tt'; isNew: boolean; row: PixelRow };

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return String(Date.now()) + Math.round(Math.random() * 1e6);
  }
}

export function TrackingAdmin() {
  const t = useTranslations('admin');
  const [fb, setFb] = useState<PixelRow[]>([]);
  const [tt, setTt] = useState<PixelRow[]>([]);
  const [ga4Enabled, setGa4Enabled] = useState(false);
  const [ga4Id, setGa4Id] = useState('');
  const [ga4SecretSet, setGa4SecretSet] = useState(false);
  const [ga4Secret, setGa4Secret] = useState('');
  const [gtmEnabled, setGtmEnabled] = useState(false);
  const [gtmId, setGtmId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/tracking');
    if (!r.ok) return;
    const d = await r.json();
    setFb((d.fb ?? []).map((p: PixelRow) => ({ ...p, token: '' })));
    setTt((d.tt ?? []).map((p: PixelRow) => ({ ...p, token: '' })));
    setGa4Enabled(!!d.ga4Enabled);
    setGa4Id(d.ga4MeasurementId ?? '');
    setGa4SecretSet(!!d.ga4ApiSecretSet);
    setGa4Secret('');
    setGtmEnabled(!!d.gtmEnabled);
    setGtmId(d.gtmContainerId ?? '');
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // ── Popup thêm/sửa 1 pixel ──
  function openAdd(kind: 'fb' | 'tt') {
    setDraft({ kind, isNew: true, row: { id: newId(), pixelId: '', pixelCode: '', testCode: '', enabled: true, tokenSet: false, token: '' } });
  }
  function openEdit(kind: 'fb' | 'tt', row: PixelRow) {
    setDraft({ kind, isNew: false, row: { ...row, token: '' } });
  }
  function updDraft(patch: Partial<PixelRow>) {
    setDraft((d) => (d ? { ...d, row: { ...d.row, ...patch } } : d));
  }
  function applyDraft() {
    if (!draft) return;
    const set = draft.kind === 'fb' ? setFb : setTt;
    set((rows) => (draft.isNew ? [...rows, draft.row] : rows.map((r) => (r.id === draft.row.id ? draft.row : r))));
    setDraft(null);
  }
  function removeRow(kind: 'fb' | 'tt', id: string) {
    const set = kind === 'fb' ? setFb : setTt;
    set((rows) => rows.filter((r) => r.id !== id));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        fb: fb.map((p) => ({ id: p.id, pixelId: p.pixelId ?? '', testCode: p.testCode, enabled: p.enabled, ...(p.token.trim() ? { accessToken: p.token.trim() } : {}) })),
        tt: tt.map((p) => ({ id: p.id, pixelCode: p.pixelCode ?? '', testCode: p.testCode, enabled: p.enabled, ...(p.token.trim() ? { accessToken: p.token.trim() } : {}) })),
        ga4Enabled,
        ga4MeasurementId: ga4Id,
        ...(ga4Secret.trim() ? { ga4ApiSecret: ga4Secret.trim() } : {}),
        gtmEnabled,
        gtmContainerId: gtmId,
      };
      const r = await fetch('/api/admin/tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        await load();
        setMsg({ ok: true, text: t('trkSaved') });
      } else {
        const d = await r.json().catch(() => null);
        setMsg({ ok: false, text: apiErrText(d, t) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTest(null);
    try {
      const r = await fetch('/api/admin/tracking/test', { method: 'POST' });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.result) setTest(d.result);
      else setMsg({ ok: false, text: apiErrText(d, t) });
    } finally {
      setTesting(false);
    }
  }

  if (!loaded)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const resultRow = (prefix: string, r: NamedResult) => (
    <InlineStack key={prefix + r.label} gap="200" blockAlign="center" wrap>
      <Text as="span" variant="bodySm" fontWeight="medium">
        {prefix}
        {r.label ? ` · ${r.label}` : ''}
      </Text>
      {r.ok ? (
        <Badge tone="success">{t('trkOk')}</Badge>
      ) : r.error === 'not-configured' ? (
        <Badge>{t('trkNotConfigured')}</Badge>
      ) : (
        <Badge tone="critical">{`${t('trkFail')}${r.error ? `: ${r.error}` : ''}`}</Badge>
      )}
    </InlineStack>
  );

  // Danh sách pixel GỌN: mỗi dòng chỉ hiện id + trạng thái + nút Sửa/Xóa. Chi tiết nhập trong popup.
  const pixelList = (kind: 'fb' | 'tt', rows: PixelRow[]) => (
    <BlockStack gap="200">
      {rows.length === 0 ? (
        <Text as="span" tone="subdued" variant="bodySm">
          {kind === 'fb' ? t('trkFbEmpty') : t('trkTtEmpty')}
        </Text>
      ) : (
        rows.map((p, i) => {
          const idText = (kind === 'fb' ? p.pixelId : p.pixelCode) || t('trkNoId');
          return (
            <Box key={p.id} padding="200" borderWidth="025" borderColor="border" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Badge>{`#${i + 1}`}</Badge>
                  <Text as="span" variant="bodyMd" fontWeight="medium">
                    {idText}
                  </Text>
                  {p.enabled ? <Badge tone="success">{t('trkEnabled')}</Badge> : <Badge>{t('trkOff')}</Badge>}
                  {p.tokenSet ? <Badge tone="success">{t('trkTokenSetBadge')}</Badge> : null}
                </InlineStack>
                <InlineStack gap="150" blockAlign="center">
                  <Button size="slim" onClick={() => openEdit(kind, p)}>
                    {t('trkEdit')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => removeRow(kind, p.id)}>
                    {t('trkRemove')}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Box>
          );
        })
      )}
      <InlineStack>
        <Button onClick={() => openAdd(kind)}>{kind === 'fb' ? t('trkFbAdd') : t('trkTtAdd')}</Button>
      </InlineStack>
    </BlockStack>
  );

  const draftIdOk = draft ? !!(draft.kind === 'fb' ? draft.row.pixelId : draft.row.pixelCode)?.trim() : false;

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued" variant="bodySm">
        {t('trkHelp')}
      </Text>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            {t('trkFbTitle')}
          </Text>
          {pixelList('fb', fb)}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            {t('trkTtTitle')}
          </Text>
          {pixelList('tt', tt)}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingSm">
              {t('trkGa4Title')}
            </Text>
            {ga4SecretSet ? <Badge tone="success">{t('trkTokenSetBadge')}</Badge> : null}
          </InlineStack>
          <Checkbox label={t('trkEnabled')} checked={ga4Enabled} onChange={setGa4Enabled} />
          <TextField label={t('trkGa4Id')} value={ga4Id} onChange={setGa4Id} autoComplete="off" placeholder="G-XXXXXXXXXX" />
          <TextField label={t('trkGa4Secret')} type="password" value={ga4Secret} onChange={setGa4Secret} autoComplete="off" placeholder={ga4SecretSet ? '••••••••' : ''} helpText={t('trkTokenHint')} />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            {t('trkGtmTitle')}
          </Text>
          <Checkbox label={t('trkEnabled')} checked={gtmEnabled} onChange={setGtmEnabled} />
          <TextField label={t('trkGtmId')} value={gtmId} onChange={setGtmId} autoComplete="off" placeholder="GTM-XXXXXXX" />
        </BlockStack>
      </Card>

      <InlineStack gap="300" blockAlign="center" wrap>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t('trkSave')}
        </Button>
        <Button loading={testing} onClick={() => void sendTest()}>
          {t('trkTest')}
        </Button>
      </InlineStack>

      {test ? (
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              {t('trkTestDone')}
            </Text>
            {test.fb.map((r) => resultRow('Facebook', r))}
            {test.tt.map((r) => resultRow('TikTok', r))}
            {resultRow('GA4', test.ga4)}
          </BlockStack>
        </Card>
      ) : null}

      {/* Popup thêm/sửa pixel */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={
          draft
            ? draft.isNew
              ? draft.kind === 'fb'
                ? t('trkFbAdd')
                : t('trkTtAdd')
              : t('trkEditTitle')
            : ''
        }
        primaryAction={{ content: t('trkApply'), onAction: applyDraft, disabled: !draftIdOk }}
        secondaryActions={[{ content: t('close'), onAction: () => setDraft(null) }]}
      >
        <Modal.Section>
          {draft ? (
            <BlockStack gap="300">
              <Checkbox label={t('trkEnabled')} checked={draft.row.enabled} onChange={(v) => updDraft({ enabled: v })} />
              {draft.kind === 'fb' ? (
                <TextField label={t('trkPixelId')} value={draft.row.pixelId ?? ''} onChange={(v) => updDraft({ pixelId: v })} autoComplete="off" autoFocus />
              ) : (
                <TextField label={t('trkPixelCode')} value={draft.row.pixelCode ?? ''} onChange={(v) => updDraft({ pixelCode: v })} autoComplete="off" autoFocus />
              )}
              <TextField
                label={t('trkAccessToken')}
                type="password"
                value={draft.row.token}
                onChange={(v) => updDraft({ token: v })}
                autoComplete="off"
                placeholder={draft.row.tokenSet ? '••••••••' : ''}
                helpText={t('trkTokenHint')}
              />
              <TextField label={t('trkTestCode')} value={draft.row.testCode} onChange={(v) => updDraft({ testCode: v })} autoComplete="off" helpText={t('trkTestCodeHint')} />
              <Text as="span" tone="subdued" variant="bodySm">
                {t('trkModalHint')}
              </Text>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
