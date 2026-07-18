'use client';

// Thư viện ảnh: xem ảnh của BIZ HIỆN TẠI (AI tạo + tải lên), đổi tên, xóa, tải lên, copy URL.
// Ảnh cô lập theo biz (index metadata riêng mỗi biz); gate content:write + kiểm chủ ở API.
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  EmptyState,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Spinner,
  Text,
  TextField,
  Thumbnail,
  Toast,
} from '@shopify/polaris';
import { useCallback, useEffect, useRef, useState } from 'react';

interface LibImage {
  file: string;
  url: string;
  name: string;
  kind: 'ai' | 'upload' | 'other';
  size: number;
  createdAt: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const KIND_LABEL: Record<LibImage['kind'], string> = {
  ai: 'AI tạo',
  upload: 'Tải lên',
  other: 'Khác',
};

export default function ImageLibraryPage() {
  const [images, setImages] = useState<LibImage[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LibImage | null>(null);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Chọn nhiều để xóa hàng loạt.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSel = (file: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(file)) n.delete(file);
      else n.add(file);
      return n;
    });
  const selectAll = () => setSelected(new Set((images ?? []).map((i) => i.file)));
  const clearSel = () => setSelected(new Set());

  async function bulkDelete() {
    const files = [...selected];
    if (!files.length) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/image-library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const d = (await res.json().catch(() => null)) as { deleted?: number } | null;
      if (res.ok) {
        const gone = new Set(files);
        setImages((list) => (list ? list.filter((i) => !gone.has(i.file)) : list));
        setToast(`Đã xóa ${d?.deleted ?? files.length} ảnh.`);
        clearSel();
      } else setToast('Không xóa được ảnh.');
    } finally {
      setBulkBusy(false);
      setBulkOpen(false);
      setConfirmText('');
    }
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/image-library');
    const d = (await r.json().catch(() => null)) as { images?: LibImage[] } | null;
    const imgs = d?.images ?? [];
    setImages(imgs);
    setNames(Object.fromEntries(imgs.map((i) => [i.file, i.name])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result || ''));
        rd.onerror = () => reject(new Error('read'));
        rd.readAsDataURL(file);
      });
      const res = await fetch('/api/image-library/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUri, name: file.name.replace(/\.[^.]+$/, '') }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        setToast('Đã tải ảnh lên thư viện.');
        await load();
      } else setToast(d?.error ?? 'Tải ảnh lên thất bại.');
    } catch {
      setToast('Tải ảnh lên thất bại.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveName(img: LibImage) {
    const name = (names[img.file] ?? '').trim();
    if (name === img.name) return;
    setBusy(img.file);
    try {
      const res = await fetch('/api/image-library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: img.file, name }),
      });
      if (res.ok) {
        setImages((list) => (list ? list.map((i) => (i.file === img.file ? { ...i, name } : i)) : list));
        setToast('Đã lưu tên ảnh.');
      } else setToast('Không lưu được tên.');
    } finally {
      setBusy(null);
    }
  }

  async function doDelete(img: LibImage) {
    setBusy(img.file);
    try {
      const res = await fetch('/api/image-library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: img.file }),
      });
      if (res.ok) {
        setImages((list) => (list ? list.filter((i) => i.file !== img.file) : list));
        setToast('Đã xóa ảnh.');
      } else setToast('Không xóa được ảnh.');
    } finally {
      setBusy(null);
      setPendingDelete(null);
    }
  }

  async function copyUrl(url: string) {
    const abs = `${window.location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(abs);
      setToast('Đã copy URL ảnh.');
    } catch {
      setToast(abs);
    }
  }

  return (
    <Page
      title="Thư viện ảnh"
      subtitle="Toàn bộ ảnh AI tạo và ảnh tải lên. Đổi tên, xóa, copy URL để dùng lại."
      primaryAction={{
        content: 'Tải ảnh lên',
        loading: uploading,
        onAction: () => fileRef.current?.click(),
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      {images === null ? (
        <Box padding="600">
          <InlineStack align="center">
            <Spinner size="small" />
          </InlineStack>
        </Box>
      ) : images.length === 0 ? (
        <Card>
          <EmptyState heading="Chưa có ảnh nào" image="">
            <p>Ảnh do AI tạo (ảnh bìa, minh họa…) hoặc ảnh bạn tải lên sẽ xuất hiện ở đây.</p>
          </EmptyState>
        </Card>
      ) : (
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" wrap gap="200">
            <Text as="p" tone="subdued" variant="bodySm">
              {images.length} ảnh{selected.size > 0 ? ` · đã chọn ${selected.size}` : ''}
            </Text>
            <InlineStack gap="200">
              <Button
                variant="plain"
                onClick={selected.size === images.length ? clearSel : selectAll}
              >
                {selected.size === images.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </Button>
              {selected.size > 0 ? (
                <Button
                  tone="critical"
                  variant="primary"
                  onClick={() => {
                    setConfirmText('');
                    setBulkOpen(true);
                  }}
                >
                  {`Xóa ${selected.size} ảnh đã chọn`}
                </Button>
              ) : null}
            </InlineStack>
          </InlineStack>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="300">
            {images.map((img) => (
              <Card key={img.file}>
                <BlockStack gap="200">
                  <Checkbox
                    label="Chọn ảnh này"
                    checked={selected.has(img.file)}
                    onChange={() => toggleSel(img.file)}
                  />
                  <a href={img.url} target="_blank" rel="noopener noreferrer">
                    <Thumbnail source={img.url} alt={img.name} size="large" />
                  </a>
                  <InlineStack gap="150" blockAlign="center">
                    <Badge tone={img.kind === 'ai' ? 'info' : img.kind === 'upload' ? 'success' : undefined}>
                      {KIND_LABEL[img.kind]}
                    </Badge>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {fmtBytes(img.size)}
                    </Text>
                  </InlineStack>
                  <TextField
                    label="Tên ảnh"
                    labelHidden
                    value={names[img.file] ?? ''}
                    onChange={(v) => setNames((n) => ({ ...n, [img.file]: v }))}
                    autoComplete="off"
                    connectedRight={
                      <Button
                        loading={busy === img.file}
                        disabled={(names[img.file] ?? '').trim() === img.name}
                        onClick={() => void saveName(img)}
                      >
                        Lưu
                      </Button>
                    }
                  />
                  <InlineStack gap="200">
                    <Button size="slim" onClick={() => void copyUrl(img.url)}>
                      Copy URL
                    </Button>
                    <Button
                      size="slim"
                      tone="critical"
                      variant="plain"
                      onClick={() => setPendingDelete(img)}
                    >
                      Xóa
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </BlockStack>
      )}

      {pendingDelete ? (
        <Modal
          open
          onClose={() => setPendingDelete(null)}
          title="Xóa ảnh?"
          primaryAction={{
            content: 'Xóa',
            destructive: true,
            loading: busy === pendingDelete.file,
            onAction: () => void doDelete(pendingDelete),
          }}
          secondaryActions={[{ content: 'Hủy', onAction: () => setPendingDelete(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              Xóa vĩnh viễn ảnh này? Nếu ảnh đang được dùng trong bài viết/báo cáo, nơi đó sẽ mất ảnh.
            </Text>
          </Modal.Section>
        </Modal>
      ) : null}

      {bulkOpen ? (
        <Modal
          open
          onClose={() => {
            setBulkOpen(false);
            setConfirmText('');
          }}
          title={`Xóa ${selected.size} ảnh đã chọn?`}
          primaryAction={{
            content: `Xóa ${selected.size} ảnh`,
            destructive: true,
            loading: bulkBusy,
            // Xóa NHIỀU ảnh (>1) bắt buộc gõ đúng "DELETE" mới cho phép.
            disabled: selected.size > 1 && confirmText.trim() !== 'DELETE',
            onAction: () => void bulkDelete(),
          }}
          secondaryActions={[
            {
              content: 'Hủy',
              onAction: () => {
                setBulkOpen(false);
                setConfirmText('');
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                Xóa vĩnh viễn {selected.size} ảnh đã chọn? Ảnh đang được dùng trong bài viết/báo cáo
                sẽ mất.
              </Text>
              {selected.size > 1 ? (
                <TextField
                  label="Nhập DELETE (chữ in hoa) để xác nhận xóa nhiều ảnh"
                  value={confirmText}
                  onChange={setConfirmText}
                  autoComplete="off"
                  placeholder="DELETE"
                  error={confirmText.length > 0 && confirmText.trim() !== 'DELETE' ? 'Phải gõ đúng chữ DELETE' : undefined}
                />
              ) : null}
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      {toast ? <Toast content={toast} onDismiss={() => setToast('')} /> : null}
    </Page>
  );
}
