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
  InlineStack,
  Modal,
  Page,
  Spinner,
  Text,
  TextField,
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

function fmtDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

const KIND_LABEL: Record<LibImage['kind'], string> = {
  ai: 'AI tạo',
  upload: 'Tải lên',
  other: 'Khác',
};

export default function ImageLibraryPage() {
  const [images, setImages] = useState<LibImage[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [editingFile, setEditingFile] = useState<string | null>(null);
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
    if (!name || name === img.name) {
      setNames((current) => ({ ...current, [img.file]: img.name }));
      setEditingFile(null);
      return;
    }
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
        setEditingFile(null);
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

  function cancelRename(img: LibImage) {
    setNames((current) => ({ ...current, [img.file]: img.name }));
    setEditingFile(null);
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
          <Box paddingBlock="800" paddingInline="400">
            <BlockStack gap="300" inlineAlign="center">
              <Text as="h2" variant="headingMd" alignment="center">Chưa có ảnh nào</Text>
              <Text as="p" tone="subdued" alignment="center">
                Ảnh do AI tạo hoặc ảnh bạn tải lên sẽ xuất hiện tại đây để dễ tìm và sử dụng lại.
              </Text>
              <Button variant="primary" onClick={() => fileRef.current?.click()}>Tải ảnh đầu tiên</Button>
            </BlockStack>
          </Box>
        </Card>
      ) : (
        <BlockStack gap="300">
          <div className={`image-library-toolbar${selected.size ? ' image-library-toolbar--active' : ''}`}>
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">
                  {selected.size ? `${selected.size} ảnh được chọn` : `${images.length} ảnh trong thư viện`}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {selected.size ? 'Bạn có thể bỏ chọn hoặc xóa các ảnh này.' : 'Chọn ảnh để thao tác hàng loạt.'}
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button onClick={selected.size === images.length ? clearSel : selectAll}>
                  {selected.size === images.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </Button>
                {selected.size > 0 ? (
                  <Button
                    tone="critical"
                    onClick={() => {
                      setConfirmText('');
                      setBulkOpen(true);
                    }}
                  >
                    {`Xóa ${selected.size} ảnh`}
                  </Button>
                ) : null}
              </InlineStack>
            </InlineStack>
          </div>

          <div className="image-library-grid">
            {images.map((img) => (
              <article
                key={img.file}
                className={`image-library-card${selected.has(img.file) ? ' image-library-card--selected' : ''}`}
              >
                <div className="image-library-card__preview">
                  {img.url ? (
                    <a href={img.url} target="_blank" rel="noopener noreferrer" aria-label={`Mở ảnh ${img.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.name} loading="lazy" />
                    </a>
                  ) : (
                    <div className="image-library-card__missing">Không có ảnh xem trước</div>
                  )}
                  <div className="image-library-card__select">
                    <Checkbox
                      label={`Chọn ảnh ${img.name}`}
                      labelHidden
                      checked={selected.has(img.file)}
                      onChange={() => toggleSel(img.file)}
                    />
                  </div>
                  <div className="image-library-card__kind">
                    <Badge tone={img.kind === 'ai' ? 'info' : img.kind === 'upload' ? 'success' : undefined}>
                      {KIND_LABEL[img.kind]}
                    </Badge>
                  </div>
                </div>

                <div className="image-library-card__body">
                  {editingFile === img.file ? (
                    <BlockStack gap="200">
                      <TextField
                        label="Tên ảnh"
                        labelHidden
                        value={names[img.file] ?? ''}
                        onChange={(value) => setNames((current) => ({ ...current, [img.file]: value }))}
                        autoComplete="off"
                      />
                      <InlineStack align="end" gap="150">
                        <Button size="slim" variant="plain" disabled={busy === img.file} onClick={() => cancelRename(img)}>
                          Hủy
                        </Button>
                        <Button
                          size="slim"
                          variant="primary"
                          loading={busy === img.file}
                          disabled={!(names[img.file] ?? '').trim() || (names[img.file] ?? '').trim() === img.name}
                          onClick={() => void saveName(img)}
                        >
                          Lưu
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  ) : (
                    <div className="image-library-card__title" title={img.name}>
                      <Text as="h3" fontWeight="semibold" truncate>{img.name || '(Chưa đặt tên)'}</Text>
                    </div>
                  )}

                  <InlineStack gap="150" blockAlign="center">
                    <Text as="span" tone="subdued" variant="bodySm">{fmtBytes(img.size)}</Text>
                    {fmtDate(img.createdAt) ? <span className="image-library-card__dot" aria-hidden="true">·</span> : null}
                    {fmtDate(img.createdAt) ? (
                      <Text as="span" tone="subdued" variant="bodySm">{fmtDate(img.createdAt)}</Text>
                    ) : null}
                  </InlineStack>
                </div>

                <div className="image-library-card__actions">
                  <Button size="slim" disabled={!img.url} onClick={() => void copyUrl(img.url)}>Copy URL</Button>
                  <InlineStack gap="100">
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        setNames((current) => ({ ...current, [img.file]: img.name }));
                        setEditingFile(img.file);
                      }}
                    >
                      Đổi tên
                    </Button>
                    <Button size="slim" tone="critical" variant="plain" onClick={() => setPendingDelete(img)}>
                      Xóa
                    </Button>
                  </InlineStack>
                </div>
              </article>
            ))}
          </div>
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
