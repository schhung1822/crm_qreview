'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  RangeSlider,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { TickerView, type TickerItem } from '@/components/AnnouncementTicker';
import { apiErrText } from '@/lib/admin/api-error';

interface Cfg {
  enabled: boolean;
  speed: number;
  items: TickerItem[];
}
type Draft = { isNew: boolean; item: TickerItem };

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return String(Date.now());
  }
}

export function AnnouncementsAdmin() {
  const t = useTranslations('admin');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/announcements');
    if (r.ok) setCfg(await r.json());
    else setCfg({ enabled: false, speed: 60, items: [] });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // ── Popup thêm/sửa 1 thông báo ──
  function openAdd() {
    setDraft({ isNew: true, item: { id: newId(), text: '', url: '', enabled: true } });
  }
  function openEdit(it: TickerItem) {
    setDraft({ isNew: false, item: { ...it } });
  }
  function updDraft(p: Partial<TickerItem>) {
    setDraft((d) => (d ? { ...d, item: { ...d.item, ...p } } : d));
  }
  function applyDraft() {
    if (!draft) return;
    setCfg((c) => {
      if (!c) return c;
      const items = draft.isNew
        ? [...c.items, draft.item]
        : c.items.map((it) => (it.id === draft.item.id ? draft.item : it));
      return { ...c, items };
    });
    setDraft(null);
  }
  function removeItem(id: string) {
    setCfg((c) => (c ? { ...c, items: c.items.filter((it) => it.id !== id) } : c));
  }
  function move(id: string, dir: -1 | 1) {
    setCfg((c) => {
      if (!c) return c;
      const i = c.items.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.items.length) return c;
      const items = [...c.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...c, items };
    });
  }

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: cfg.enabled,
          speed: cfg.speed,
          items: cfg.items.map((it) => ({
            id: it.id,
            text: it.text,
            url: it.url ?? '',
            enabled: it.enabled !== false,
          })),
        }),
      });
      if (r.ok) {
        setCfg(await r.json());
        setMsg({ ok: true, text: t('annSaved') });
      } else {
        const d = await r.json().catch(() => null);
        setMsg({ ok: false, text: apiErrText(d, t) });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cfg)
    return (
      <Box padding="400">
        <Spinner size="small" />
      </Box>
    );

  const preview = cfg.items.filter((i) => i.enabled !== false && i.text.trim());
  const draftTextOk = draft ? draft.item.text.trim().length > 0 : false;

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued" variant="bodySm">
        {t('annHelp')}
      </Text>
      {msg ? <Banner tone={msg.ok ? 'success' : 'critical'}>{msg.text}</Banner> : null}

      <Card>
        <BlockStack gap="300">
          <Checkbox
            label={t('annEnabled')}
            checked={cfg.enabled}
            onChange={(v) => setCfg((c) => (c ? { ...c, enabled: v } : c))}
          />
          <Box maxWidth="360px">
            <RangeSlider
              label={t('annSpeed')}
              min={10}
              max={200}
              step={5}
              value={cfg.speed}
              onChange={(v) => setCfg((c) => (c ? { ...c, speed: Array.isArray(v) ? v[0] : v } : c))}
              output
              helpText={t('annSpeedHint')}
            />
          </Box>
          {/* Xem trước trực tiếp (dùng chính component chạy ở header). */}
          <Box background="bg-surface-secondary" borderRadius="200" padding="200">
            <Text as="span" tone="subdued" variant="bodySm">
              {t('annPreview')}
            </Text>
            <Box paddingBlockStart="150">
              {preview.length ? (
                <TickerView items={preview} speed={cfg.speed} />
              ) : (
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('annPreviewEmpty')}
                </Text>
              )}
            </Box>
          </Box>
        </BlockStack>
      </Card>

      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" variant="headingSm">
            {t('annItems')}
          </Text>
          <Button onClick={openAdd}>{t('annAdd')}</Button>
        </InlineStack>

        {cfg.items.length === 0 ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {t('annEmpty')}
          </Text>
        ) : (
          cfg.items.map((it, idx) => (
            <Box key={it.id} padding="200" borderWidth="025" borderColor="border" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="150" blockAlign="center" wrap>
                  <Badge>{`#${idx + 1}`}</Badge>
                  <span
                    style={{
                      maxWidth: '46ch',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      fontWeight: 500,
                    }}
                  >
                    {it.text.trim() || t('annNoText')}
                  </span>
                  {it.enabled !== false ? <Badge tone="success">{t('annItemEnabled')}</Badge> : <Badge>{t('annHidden')}</Badge>}
                  {it.url ? <Badge>link</Badge> : null}
                </InlineStack>
                <InlineStack gap="100" blockAlign="center">
                  <Button size="slim" disabled={idx === 0} onClick={() => move(it.id, -1)}>
                    {t('annUp')}
                  </Button>
                  <Button size="slim" disabled={idx === cfg.items.length - 1} onClick={() => move(it.id, 1)}>
                    {t('annDown')}
                  </Button>
                  <Button size="slim" onClick={() => openEdit(it)}>
                    {t('trkEdit')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => removeItem(it.id)}>
                    {t('annRemove')}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Box>
          ))
        )}
      </BlockStack>

      <InlineStack>
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t('annSave')}
        </Button>
      </InlineStack>

      {/* Popup thêm/sửa thông báo */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft ? (draft.isNew ? t('annAdd') : t('annEditTitle')) : ''}
        primaryAction={{ content: t('trkApply'), onAction: applyDraft, disabled: !draftTextOk }}
        secondaryActions={[{ content: t('close'), onAction: () => setDraft(null) }]}
      >
        <Modal.Section>
          {draft ? (
            <BlockStack gap="300">
              <Checkbox label={t('annItemEnabled')} checked={draft.item.enabled !== false} onChange={(v) => updDraft({ enabled: v })} />
              <TextField
                label={t('annItemText')}
                value={draft.item.text}
                onChange={(v) => updDraft({ text: v })}
                autoComplete="off"
                maxLength={300}
                multiline
                autoFocus
              />
              <TextField
                label={t('annItemUrl')}
                value={draft.item.url ?? ''}
                onChange={(v) => updDraft({ url: v })}
                autoComplete="off"
                placeholder="https://noti.vn/…"
                helpText={t('annItemUrlHint')}
              />
              <Text as="span" tone="subdued" variant="bodySm">
                {t('annModalHint')}
              </Text>
            </BlockStack>
          ) : null}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
