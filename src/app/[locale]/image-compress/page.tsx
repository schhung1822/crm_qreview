'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DropZone,
  InlineGrid,
  InlineStack,
  Page,
  RangeSlider,
  Select,
  Spinner,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

type OutFormat = 'webp' | 'avif' | 'jpeg' | 'png' | 'original';

interface Item {
  id: string;
  file: File;
  status: 'pending' | 'working' | 'done' | 'error';
  error?: string;
  // Kết quả sau nén
  name?: string;
  dataUrl?: string;
  format?: string;
  originalBytes: number;
  outputBytes?: number;
  width?: number;
  height?: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function download(dataUrl: string, name: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

let seq = 0;

export default function ImageCompressPage() {
  const t = useTranslations('imageCompress');

  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<OutFormat>('webp');
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState('');
  const [keepMeta, setKeepMeta] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDrop = useCallback((_files: File[], accepted: File[]) => {
    const next = accepted.map((file) => ({
      id: `f${++seq}`,
      file,
      status: 'pending' as const,
      originalBytes: file.size,
    }));
    setItems((cur) => [...cur, ...next]);
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const compressAll = useCallback(async () => {
    setBusy(true);
    try {
      // Xử lý TUẦN TỰ để không dồn bộ nhớ server khi nhiều ảnh lớn.
      for (const it of items) {
        if (it.status === 'done') continue;
        setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'working', error: undefined } : x)));
        const fd = new FormData();
        fd.append('file', it.file);
        fd.append('format', format);
        fd.append('quality', String(quality));
        fd.append('maxWidth', maxWidth.trim());
        fd.append('keepMeta', keepMeta ? '1' : '0');
        try {
          const res = await fetch('/api/images/compress', { method: 'POST', body: fd });
          const d = await res.json().catch(() => null);
          if (res.ok && d?.ok) {
            setItems((cur) =>
              cur.map((x) =>
                x.id === it.id
                  ? {
                      ...x,
                      status: 'done',
                      name: d.name,
                      dataUrl: d.dataUrl,
                      format: d.format,
                      outputBytes: d.outputBytes,
                      width: d.width,
                      height: d.height,
                    }
                  : x,
              ),
            );
          } else {
            setItems((cur) =>
              cur.map((x) => (x.id === it.id ? { ...x, status: 'error', error: d?.error || t('failed') } : x)),
            );
          }
        } catch {
          setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, status: 'error', error: t('failed') } : x)));
        }
      }
    } finally {
      setBusy(false);
    }
  }, [items, format, quality, maxWidth, keepMeta, t]);

  const done = items.filter((i) => i.status === 'done');
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'error');
  const totalOrig = done.reduce((s, i) => s + i.originalBytes, 0);
  const totalOut = done.reduce((s, i) => s + (i.outputBytes ?? 0), 0);
  const totalSavedPct = totalOrig > 0 ? Math.round((1 - totalOut / totalOrig) * 100) : 0;

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Banner tone="info">{t('seoBanner')}</Banner>

        <InlineGrid columns={{ xs: 1, md: '2fr 1fr' }} gap="400">
          {/* Tải ảnh lên - căn giữa DropZone theo chiều dọc trong thẻ (thẻ bị kéo cao bằng Tùy chọn) */}
          <div className="compress-uploader">
          <Card>
            <BlockStack gap="300">
              <DropZone accept="image/*" type="image" allowMultiple onDrop={onDrop}>
                <DropZone.FileUpload actionTitle={t('dropAction')} actionHint={t('dropHint')} />
              </DropZone>
              {items.length > 0 ? (
                <InlineStack gap="200" align="space-between" blockAlign="center" wrap>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('queued', { n: items.length })}
                  </Text>
                  <InlineStack gap="200">
                    <Button onClick={clearAll} disabled={busy} variant="tertiary">
                      {t('clearAll')}
                    </Button>
                    <Button
                      variant="primary"
                      loading={busy}
                      disabled={pending.length === 0}
                      onClick={() => void compressAll()}
                    >
                      {t('compressAll')}
                    </Button>
                  </InlineStack>
                </InlineStack>
              ) : null}
            </BlockStack>
          </Card>
          </div>

          {/* Tùy chọn */}
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {t('optionsTitle')}
              </Text>
              <Select
                label={t('format')}
                value={format}
                onChange={(v) => setFormat(v as OutFormat)}
                helpText={t('formatHint')}
                options={[
                  { label: t('optWebp'), value: 'webp' },
                  { label: t('optAvif'), value: 'avif' },
                  { label: t('optJpeg'), value: 'jpeg' },
                  { label: t('optPng'), value: 'png' },
                  { label: t('optOriginal'), value: 'original' },
                ]}
              />
              <RangeSlider
                label={t('quality')}
                min={30}
                max={100}
                value={quality}
                onChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)}
                output
                suffix={<Text as="span" variant="bodySm">{quality}</Text>}
              />
              <TextField
                label={t('maxWidth')}
                type="number"
                value={maxWidth}
                onChange={setMaxWidth}
                autoComplete="off"
                suffix="px"
                placeholder="1600"
                helpText={t('maxWidthHint')}
              />
              <Checkbox label={t('keepMeta')} checked={keepMeta} onChange={setKeepMeta} helpText={t('keepMetaHint')} />
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Kết quả */}
        {items.length > 0 ? (
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <Text as="h2" variant="headingSm">
                  {t('resultsTitle')}
                </Text>
                {done.length > 0 ? (
                  <InlineStack gap="300" blockAlign="center" wrap>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {t('totalSaved', { pct: totalSavedPct, from: fmtBytes(totalOrig), to: fmtBytes(totalOut) })}
                    </Text>
                    <Button
                      onClick={() => done.forEach((i) => i.dataUrl && i.name && download(i.dataUrl, i.name))}
                    >
                      {t('downloadAll')}
                    </Button>
                  </InlineStack>
                ) : null}
              </InlineStack>
            </Box>
            <BlockStack gap="0">
              {items.map((it) => {
                const savedPct =
                  it.outputBytes != null && it.originalBytes > 0
                    ? Math.round((1 - it.outputBytes / it.originalBytes) * 100)
                    : null;
                return (
                  <Box key={it.id} padding="400" borderBlockEndWidth="025" borderColor="border">
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      {it.dataUrl ? (
                        <Thumbnail source={it.dataUrl} alt={it.name ?? it.file.name} size="small" />
                      ) : (
                        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                          {it.status === 'working' ? <Spinner size="small" /> : <Text as="span" variant="bodySm">🖼️</Text>}
                        </Box>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text as="p" fontWeight="semibold" truncate>
                          {it.name ?? it.file.name}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued" truncate>
                          {it.status === 'done'
                            ? `${fmtBytes(it.originalBytes)} → ${fmtBytes(it.outputBytes ?? 0)}${it.width ? ` · ${it.width}×${it.height}px` : ''} · ${String(it.format).toUpperCase()}`
                            : it.status === 'error'
                              ? it.error
                              : `${fmtBytes(it.originalBytes)} · ${t('stPending')}`}
                        </Text>
                      </div>
                      {it.status === 'done' && savedPct != null ? (
                        <Badge tone={savedPct > 0 ? 'success' : 'warning'}>
                          {savedPct > 0 ? t('savedPct', { pct: savedPct }) : t('noGain')}
                        </Badge>
                      ) : it.status === 'error' ? (
                        <Badge tone="critical">{t('stError')}</Badge>
                      ) : it.status === 'working' ? (
                        <Badge>{t('stWorking')}</Badge>
                      ) : (
                        <Badge>{t('stPending')}</Badge>
                      )}
                      {it.status === 'done' && it.dataUrl && it.name ? (
                        <Button variant="primary" size="slim" onClick={() => download(it.dataUrl!, it.name!)}>
                          {t('download')}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
