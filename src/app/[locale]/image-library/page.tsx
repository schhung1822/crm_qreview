'use client';

// Thư viện ảnh: xem toàn bộ ảnh trong public/generated (AI tạo + tải lên), đổi tên, xóa, tải lên,
// copy URL. Ảnh dùng chung nền tảng (public/generated). Gate content:write ở API.
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
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
          <Text as="p" tone="subdued" variant="bodySm">
            {images.length} ảnh
          </Text>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }} gap="300">
            {images.map((img) => (
              <Card key={img.file}>
                <BlockStack gap="200">
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

      {toast ? <Toast content={toast} onDismiss={() => setToast('')} /> : null}
    </Page>
  );
}
