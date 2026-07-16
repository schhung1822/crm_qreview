'use client';

// Panel quản lý LINK RÚT GỌN của báo cáo (không bọc <Page> → nhúng được vào tab của Báo cáo Social).
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Modal,
  Page,
  Spinner,
  Text,
  TextField,
  Toast,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export interface ShareLink {
  slug: string;
  reportTitle: string;
  title?: string;
  description?: string;
  image?: string;
  createdAt: string;
  revoked?: boolean;
  locked?: boolean; // link đang bị khóa bằng mật khẩu
}

const ELLIPSIS: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function ShareLinksPanel() {
  const t = useTranslations('socialReport.shareLinks');
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [edit, setEdit] = useState<ShareLink | null>(null);
  const [del, setDel] = useState<ShareLink | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fImage, setFImage] = useState('');
  const [fPassword, setFPassword] = useState(''); // đặt/đổi mật khẩu (để trống = không đổi)

  const load = useCallback(async () => {
    const r = await fetch('/api/share-links');
    const d = (await r.json().catch(() => null)) as { links?: ShareLink[] } | null;
    setLinks(d?.links ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const urlOf = (l: ShareLink) => `${origin}/${l.slug}`;
  const nameOf = (l: ShareLink) => l.title || t('reportName', { name: l.reportTitle });

  async function copy(l: ShareLink) {
    try {
      await navigator.clipboard.writeText(urlOf(l));
      setToast(t('copied'));
    } catch {
      setToast(urlOf(l));
    }
  }

  function openEdit(l: ShareLink) {
    setEdit(l);
    setFTitle(l.title ?? '');
    setFDesc(l.description ?? '');
    setFImage(l.image ?? '');
    setFPassword('');
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(edit.slug);
    try {
      const body: Record<string, unknown> = {
        slug: edit.slug,
        title: fTitle,
        description: fDesc,
        image: fImage,
      };
      // Chỉ gửi password khi có nhập → đặt/đổi mật khẩu. Bỏ trống = giữ nguyên trạng thái khóa.
      if (fPassword.trim()) body.password = fPassword;
      const res = await fetch('/api/share-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast(t('saved'));
        await load();
      } else setToast(t('saveFailed'));
    } finally {
      setBusy(null);
      setEdit(null);
    }
  }

  // Gỡ khóa (chuyển công khai) cho link đang mở trong modal sửa.
  async function removeLock() {
    if (!edit) return;
    setBusy(edit.slug);
    try {
      const res = await fetch('/api/share-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: edit.slug, password: '' }),
      });
      if (res.ok) {
        setToast(t('lockRemoved'));
        await load();
      } else setToast(t('updateFailed'));
    } finally {
      setBusy(null);
      setEdit(null);
    }
  }

  async function toggleRevoke(l: ShareLink) {
    setBusy(l.slug);
    try {
      const res = await fetch('/api/share-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: l.slug, revoked: !l.revoked }),
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function doDelete(l: ShareLink) {
    setBusy(l.slug);
    try {
      const res = await fetch('/api/share-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: l.slug }),
      });
      if (res.ok) {
        setToast(t('deleted'));
        setLinks((x) => (x ? x.filter((i) => i.slug !== l.slug) : x));
      }
    } finally {
      setBusy(null);
      setDel(null);
    }
  }

  return (
    <>
      {links === null ? (
        <Box padding="600">
          <InlineStack align="center">
            <Spinner size="small" />
          </InlineStack>
        </Box>
      ) : links.length === 0 ? (
        <Card>
          <EmptyState heading={t('emptyTitle')} image="">
            <p>{t('emptyDesc')}</p>
          </EmptyState>
        </Card>
      ) : (
        <BlockStack gap="300">
          {links.map((l) => (
            <Card key={l.slug}>
              {/* Thông tin bên trái (co giãn + cắt "…"), nút + trạng thái bên phải, cùng 1 hàng. */}
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <BlockStack gap="050">
                    <div style={ELLIPSIS}>
                      <Text as="span" fontWeight="semibold">
                        {nameOf(l)}
                      </Text>
                    </div>
                    <div style={ELLIPSIS}>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {urlOf(l)}
                      </Text>
                    </div>
                  </BlockStack>
                </div>
                <InlineStack gap="150" blockAlign="center" wrap>
                  {l.revoked ? (
                    <Badge tone="critical">{t('revoked')}</Badge>
                  ) : (
                    <Badge tone="success">{t('active')}</Badge>
                  )}
                  {l.locked ? <Badge tone="attention">{t('locked')}</Badge> : null}
                  <Button size="slim" onClick={() => void copy(l)}>
                    {t('copy')}
                  </Button>
                  <Button size="slim" url={urlOf(l)} external>
                    {t('open')}
                  </Button>
                  <Button size="slim" onClick={() => openEdit(l)}>
                    {t('edit')}
                  </Button>
                  <Button size="slim" loading={busy === l.slug} onClick={() => void toggleRevoke(l)}>
                    {l.revoked ? t('reenable') : t('revoke')}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => setDel(l)}>
                    {t('delete')}
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>
          ))}
        </BlockStack>
      )}

      {edit ? (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={t('editTitle')}
          primaryAction={{ content: t('save'), loading: busy === edit.slug, onAction: () => void saveEdit() }}
          secondaryActions={[{ content: t('cancel'), onAction: () => setEdit(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" tone="subdued" variant="bodySm">
                {t('editHint')}
              </Text>
              <TextField
                label={t('fieldTitle')}
                value={fTitle}
                onChange={setFTitle}
                autoComplete="off"
                placeholder={t('reportName', { name: edit.reportTitle })}
              />
              <TextField label={t('fieldDesc')} value={fDesc} onChange={setFDesc} autoComplete="off" multiline={3} />
              <TextField
                label={t('fieldImage')}
                value={fImage}
                onChange={setFImage}
                autoComplete="off"
                placeholder="https://demo.noti.vn/generated/....jpg"
              />

              {/* Bảo mật: đặt/đổi/gỡ mật khẩu khóa link */}
              <Box paddingBlockStart="200" borderColor="border" borderBlockStartWidth="025">
                <BlockStack gap="200">
                  <InlineStack gap="150" blockAlign="center" wrap>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {t('security')}
                    </Text>
                    {edit.locked ? (
                      <Badge tone="attention">{t('lockedNeedPw')}</Badge>
                    ) : (
                      <Badge tone="success">{t('publicBadge')}</Badge>
                    )}
                  </InlineStack>
                  <TextField
                    label={edit.locked ? t('pwLabelChange') : t('pwLabelSet')}
                    type="password"
                    value={fPassword}
                    onChange={setFPassword}
                    autoComplete="off"
                    placeholder={t('pwPlaceholder')}
                  />
                  {edit.locked ? (
                    <InlineStack>
                      <Button
                        variant="plain"
                        tone="critical"
                        loading={busy === edit.slug}
                        onClick={() => void removeLock()}
                      >
                        {t('removeLock')}
                      </Button>
                    </InlineStack>
                  ) : null}
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('lockHint')}
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      {del ? (
        <Modal
          open
          onClose={() => setDel(null)}
          title={t('deleteTitle')}
          primaryAction={{
            content: t('delete'),
            destructive: true,
            loading: busy === del.slug,
            onAction: () => void doDelete(del),
          }}
          secondaryActions={[{ content: t('cancel'), onAction: () => setDel(null) }]}
        >
          <Modal.Section>
            <Text as="p">{t('deleteConfirm')}</Text>
          </Modal.Section>
        </Modal>
      ) : null}

      {toast ? <Toast content={toast} onDismiss={() => setToast('')} /> : null}
    </>
  );
}

// Trang độc lập (giữ để truy cập trực tiếp qua URL) — nội dung dùng chung với tab trong Báo cáo Social.
export function ShareLinksStandalonePage() {
  const t = useTranslations('socialReport.shareLinks');
  return (
    <Page title={t('standaloneTitle')} subtitle={t('standaloneSubtitle')}>
      <ShareLinksPanel />
    </Page>
  );
}
