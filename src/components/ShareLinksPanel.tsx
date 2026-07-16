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
        setToast('Đã lưu.');
        await load();
      } else setToast('Lưu thất bại.');
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
        setToast('Đã bỏ khóa — link công khai.');
        await load();
      } else setToast('Không cập nhật được.');
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
    <>
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
              {/* Thông tin bên trái (co giãn + cắt "…"), nút + trạng thái bên phải, cùng 1 hàng. */}
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <BlockStack gap="050">
                    <div style={ELLIPSIS}>
                      <Text as="span" fontWeight="semibold">
                        {l.title || `Báo cáo ${l.reportTitle}`}
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
                    <Badge tone="critical">Đã thu hồi</Badge>
                  ) : (
                    <Badge tone="success">Đang bật</Badge>
                  )}
                  {l.locked ? <Badge tone="attention">Đã khóa</Badge> : null}
                  <Button size="slim" onClick={() => void copy(l)}>
                    Copy
                  </Button>
                  <Button size="slim" url={urlOf(l)} external>
                    Mở
                  </Button>
                  <Button size="slim" onClick={() => openEdit(l)}>
                    Sửa
                  </Button>
                  <Button size="slim" loading={busy === l.slug} onClick={() => void toggleRevoke(l)}>
                    {l.revoked ? 'Bật lại' : 'Thu hồi'}
                  </Button>
                  <Button size="slim" tone="critical" variant="plain" onClick={() => setDel(l)}>
                    Xóa
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
              <TextField label="Mô tả" value={fDesc} onChange={setFDesc} autoComplete="off" multiline={3} />
              <TextField
                label="URL ảnh bìa"
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
                      Bảo mật:
                    </Text>
                    {edit.locked ? (
                      <Badge tone="attention">Đã khóa — cần mật khẩu</Badge>
                    ) : (
                      <Badge tone="success">Công khai</Badge>
                    )}
                  </InlineStack>
                  <TextField
                    label={edit.locked ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Đặt mật khẩu để khóa'}
                    type="password"
                    value={fPassword}
                    onChange={setFPassword}
                    autoComplete="off"
                    placeholder="Nhập mật khẩu"
                  />
                  {edit.locked ? (
                    <InlineStack>
                      <Button
                        variant="plain"
                        tone="critical"
                        loading={busy === edit.slug}
                        onClick={() => void removeLock()}
                      >
                        Bỏ khóa (chuyển công khai)
                      </Button>
                    </InlineStack>
                  ) : null}
                  <Text as="span" tone="subdued" variant="bodySm">
                    Khi khóa, người xem phải nhập đúng mật khẩu mới xem được nội dung báo cáo.
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
    </>
  );
}

// Trang độc lập (giữ để truy cập trực tiếp qua URL) — nội dung dùng chung với tab trong Báo cáo Social.
export function ShareLinksStandalonePage() {
  return (
    <Page
      title="Link chia sẻ báo cáo"
      subtitle="Các link rút gọn dạng blog (tự tạo khi bật chia sẻ báo cáo). Copy để đăng lên mạng xã hội — có ảnh bìa, tiêu đề, mô tả."
    >
      <ShareLinksPanel />
    </Page>
  );
}
