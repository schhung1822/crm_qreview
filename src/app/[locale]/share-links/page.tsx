'use client';

// Quản lý LINK RÚT GỌN dạng blog của báo cáo: xem, copy, sửa (tiêu đề/mô tả/ảnh OG), thu hồi, xóa.
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
import { useCallback, useEffect, useState } from 'react';

interface ShareLink {
  slug: string;
  reportTitle: string;
  title?: string;
  description?: string;
  image?: string;
  createdAt: string;
  revoked?: boolean;
}

export default function ShareLinksPage() {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [edit, setEdit] = useState<ShareLink | null>(null);
  const [del, setDel] = useState<ShareLink | null>(null);
  // form sửa
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fImage, setFImage] = useState('');

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

  async function copy(l: ShareLink) {
    try {
      await navigator.clipboard.writeText(urlOf(l));
      setToast('Đã copy link.');
    } catch {
      setToast(urlOf(l));
    }
  }

  function openEdit(l: ShareLink) {
    setEdit(l);
    setFTitle(l.title ?? '');
    setFDesc(l.description ?? '');
    setFImage(l.image ?? '');
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(edit.slug);
    try {
      const res = await fetch('/api/share-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: edit.slug, title: fTitle, description: fDesc, image: fImage }),
      });
      if (res.ok) {
        setToast('Đã lưu.');
        await load();
      } else setToast('Lưu thất bại.');
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
        setToast('Đã xóa.');
        setLinks((x) => (x ? x.filter((i) => i.slug !== l.slug) : x));
      }
    } finally {
      setBusy(null);
      setDel(null);
    }
  }

  return (
    <Page
      title="Link chia sẻ báo cáo"
      subtitle="Các link rút gọn dạng blog (tự tạo khi bật chia sẻ báo cáo). Copy để đăng lên mạng xã hội — có ảnh bìa, tiêu đề, mô tả."
    >
      {links === null ? (
        <Box padding="600">
          <InlineStack align="center">
            <Spinner size="small" />
          </InlineStack>
        </Box>
      ) : links.length === 0 ? (
        <Card>
          <EmptyState heading="Chưa có link chia sẻ nào" image="">
            <p>Vào một báo cáo → bật “Chia sẻ” để tự tạo link rút gọn, rồi quản lý ở đây.</p>
          </EmptyState>
        </Card>
      ) : (
        <BlockStack gap="300">
          {links.map((l) => (
            <Card key={l.slug}>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                  <BlockStack gap="050">
                    <Text as="span" fontWeight="semibold">
                      {l.title || `Báo cáo ${l.reportTitle}`}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {urlOf(l)}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="150" blockAlign="center">
                    {l.revoked ? (
                      <Badge tone="critical">Đã thu hồi</Badge>
                    ) : (
                      <Badge tone="success">Đang bật</Badge>
                    )}
                  </InlineStack>
                </InlineStack>
                <InlineStack gap="200" wrap>
                  <Button size="slim" onClick={() => void copy(l)}>
                    Copy link
                  </Button>
                  <Button size="slim" url={urlOf(l)} external>
                    Mở
                  </Button>
                  <Button size="slim" onClick={() => openEdit(l)}>
                    Sửa tiêu đề/mô tả/ảnh
                  </Button>
                  <Button size="slim" loading={busy === l.slug} onClick={() => void toggleRevoke(l)}>
                    {l.revoked ? 'Bật lại' : 'Thu hồi'}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => setDel(l)}>
                    Xóa
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      )}

      {edit ? (
        <Modal
          open
          onClose={() => setEdit(null)}
          title="Sửa nội dung hiển thị khi chia sẻ"
          primaryAction={{ content: 'Lưu', loading: busy === edit.slug, onAction: () => void saveEdit() }}
          secondaryActions={[{ content: 'Hủy', onAction: () => setEdit(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" tone="subdued" variant="bodySm">
                Bỏ trống = dùng mặc định của báo cáo. Ảnh nên là URL http(s) (JPEG/PNG) để MXH hiển thị.
              </Text>
              <TextField
                label="Tiêu đề"
                value={fTitle}
                onChange={setFTitle}
                autoComplete="off"
                placeholder={`Báo cáo ${edit.reportTitle}`}
              />
              <TextField
                label="Mô tả"
                value={fDesc}
                onChange={setFDesc}
                autoComplete="off"
                multiline={3}
              />
              <TextField
                label="URL ảnh bìa"
                value={fImage}
                onChange={setFImage}
                autoComplete="off"
                placeholder="https://demo.noti.vn/generated/....jpg"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      {del ? (
        <Modal
          open
          onClose={() => setDel(null)}
          title="Xóa link chia sẻ?"
          primaryAction={{
            content: 'Xóa',
            destructive: true,
            loading: busy === del.slug,
            onAction: () => void doDelete(del),
          }}
          secondaryActions={[{ content: 'Hủy', onAction: () => setDel(null) }]}
        >
          <Modal.Section>
            <Text as="p">Xóa vĩnh viễn link này? Ai có link cũ sẽ không xem được nữa.</Text>
          </Modal.Section>
        </Modal>
      ) : null}

      {toast ? <Toast content={toast} onDismiss={() => setToast('')} /> : null}
    </Page>
  );
}
