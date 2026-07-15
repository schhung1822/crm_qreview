'use client';

// Phân tích kịch bản video/reels: dán link (TikTok/YouTube/Facebook) → chọn AI + model → phân tích.
// Hệ thống tự nhận nền tảng → lấy transcript qua Apify → AI mổ xẻ kịch bản (hook, công thức, timeline
// theo giây, tông giọng, lý do thành công...). Kết quả lưu lịch sử làm tài liệu tham khảo.
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  List,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { videoEmbed, type VideoEmbed } from '@/lib/script-analysis/embed';

type Platform = 'tiktok' | 'youtube' | 'facebook';
type Status = 'running' | 'done' | 'error';
type Phase = 'transcript' | 'analyzing' | 'done' | 'error';

interface Summary {
  id: string;
  url: string;
  platform: Platform;
  status: Status;
  phase: Phase;
  title?: string;
  createdAt: string;
}
interface TimelineSeg {
  from: string;
  to: string;
  segment: string;
  purpose: string;
}
interface Analysis {
  summary: string;
  contentType: string;
  targetAudience: string;
  successReasons: string[];
  formula: string;
  hookText: string;
  hookWhy: string;
  intro: string;
  tone: string;
  pacing: string;
  timeline: TimelineSeg[];
  cta: string;
  strengths: string[];
  improvements: string[];
  takeaways: string[];
}
interface Metrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  author?: string;
}
interface Record_ {
  id: string;
  url: string;
  platform: Platform;
  status: Status;
  phase: Phase;
  title?: string;
  metrics?: Metrics;
  transcript?: string;
  analysis?: Analysis;
  share?: { token: string; createdAt: string };
  error?: string;
  createdAt: string;
  updatedAt: string;
}
interface ProviderStatus {
  id: string;
  label: string;
  hasKey: boolean;
  enabled: boolean;
}

const PLATFORM_TONE: Record<Platform, 'info' | 'success' | 'attention'> = {
  tiktok: 'info',
  youtube: 'attention',
  facebook: 'success',
};

export default function ScriptAnalysisPage() {
  const t = useTranslations('scriptAnalysis');
  const locale = useLocale();
  const [items, setItems] = useState<Summary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record_ | null>(null);
  const [url, setUrl] = useState('');
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch('/api/script-analysis');
    const d = await r.json().catch(() => null);
    if (r.ok) setItems(d?.items ?? []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/script-analysis/${id}`);
    const d = await r.json().catch(() => null);
    if (r.ok) {
      const rec = d?.record as Record_ | null;
      setDetail(rec ?? null);
      setShareUrl(rec?.share ? `${window.location.origin}/share/video/${rec.share.token}` : '');
    }
  }, []);

  const toggleShare = useCallback(
    async (enable: boolean) => {
      if (!openId) return;
      setShareBusy(true);
      try {
        const r = await fetch(`/api/script-analysis/${openId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: enable ? 'enable' : 'disable' }),
        });
        const d = (await r.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!r.ok) {
          setError(d?.error ?? t('errGeneric'));
          return;
        }
        setShareUrl(enable ? (d?.url ?? '') : '');
        await loadDetail(openId);
      } finally {
        setShareBusy(false);
      }
    },
    [openId, t, loadDetail],
  );

  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard bị chặn → user tự copy từ ô */
    }
  }, [shareUrl]);

  useEffect(() => {
    void loadList();
    void fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: ProviderStatus[] }) => setProviders(d.providers.filter((p) => p.hasKey && p.enabled)))
      .catch(() => setProviders([]));
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadList]);

  // Poll khi có bản đang chạy (trong list hoặc chi tiết đang mở).
  useEffect(() => {
    const anyRunning = items.some((i) => i.status === 'running') || detail?.status === 'running';
    if (!anyRunning) return;
    pollRef.current = setTimeout(() => {
      void loadList();
      if (openId) void loadDetail(openId);
    }, 2500);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [items, detail, openId, loadList, loadDetail]);

  async function selectProvider(v: string) {
    setProvider(v);
    setModel('');
    setModels([]);
    if (!v) return;
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: v }),
      });
      const d = await res.json();
      if (res.ok && Array.isArray(d.models)) setModels(d.models as string[]);
    } catch {
      /* giữ rỗng → model mặc định */
    }
  }

  async function analyze() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/script-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), provider: provider || undefined, model: model || undefined, locale }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error ?? t('errGeneric'));
        return;
      }
      setUrl('');
      setOpenId(d.id);
      setDetail(null);
      setShowTranscript(false);
      await loadList();
      await loadDetail(d.id);
    } finally {
      setBusy(false);
    }
  }

  // Phân tích LẠI một bản đã lỗi/xong bằng AI/model đang chọn (tái dùng transcript đã lấy).
  async function reanalyze(id: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/script-analysis/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider || undefined, model: model || undefined }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error ?? t('errGeneric'));
        return;
      }
      await loadList();
      await loadDetail(id);
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setOpenId(id);
    setDetail(null);
    setShowTranscript(false);
    await loadDetail(id);
  }
  async function del(id: string) {
    await fetch(`/api/script-analysis/${id}`, { method: 'DELETE' });
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    }
    await loadList();
  }

  const providerOptions = [
    { label: t('aiAuto'), value: '' },
    ...(providers ?? []).map((p) => ({ label: p.label, value: p.id })),
  ];
  const modelOptions = [{ label: t('aiDefaultModel'), value: '' }, ...models.map((m) => ({ label: m, value: m }))];

  const a = detail?.analysis;
  // Video nhúng để xem ngay trong khối timeline (null nếu không suy được, vd TikTok link rút gọn).
  const emb = detail ? videoEmbed(detail.url, detail.platform) : null;
  const phaseText = (p: Phase) => (p === 'analyzing' ? t('phaseAnalyzing') : t('phaseTranscript'));
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const stat = (label: string, value?: number) =>
    value === undefined ? null : (
      <BlockStack gap="050" inlineAlign="start">
        <Text as="span" variant="headingMd" fontWeight="bold">{fmt(value)}</Text>
        <Text as="span" tone="subdued" variant="bodySm">{label}</Text>
      </BlockStack>
    );

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        {/* Form phân tích mới: [link] [AI] [model] [nút] trên một hàng (xuống dòng khi hẹp). */}
        <Card>
          <BlockStack gap="200">
            <InlineGrid gap="300" columns={{ xs: 1, md: '2fr 1fr 1fr auto' }} alignItems="end">
              <TextField
                label={t('urlLabel')}
                value={url}
                onChange={setUrl}
                placeholder={t('urlPlaceholder')}
                autoComplete="off"
              />
              <Select
                label={t('aiProvider')}
                options={providerOptions}
                value={provider}
                onChange={(v) => void selectProvider(v)}
              />
              <Select
                label={t('aiModel')}
                options={modelOptions}
                value={model}
                onChange={setModel}
                disabled={!provider}
              />
              <Button variant="primary" size="large" loading={busy} disabled={!url.trim()} onClick={() => void analyze()}>
                {t('analyze')}
              </Button>
            </InlineGrid>
            <Text as="span" tone="subdued" variant="bodySm">{t('urlHelp')}</Text>
            {providers !== null && providers.length === 0 ? <Banner tone="warning">{t('noAiKey')}</Banner> : null}
            {error ? <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner> : null}
          </BlockStack>
        </Card>

        {/* Chi tiết bản đang mở */}
        {openId && detail ? (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Badge tone={PLATFORM_TONE[detail.platform]}>{detail.platform.toUpperCase()}</Badge>
                  <Text as="span" variant="headingSm">{detail.title || t('resultFor')}</Text>
                </InlineStack>
                <Button variant="plain" url={detail.url} external>{t('openVideo')}</Button>
              </InlineStack>

              {detail.metrics?.author ? (
                <Text as="span" tone="subdued" variant="bodySm">{detail.metrics.author}</Text>
              ) : null}
              {detail.metrics &&
              [detail.metrics.views, detail.metrics.likes, detail.metrics.comments, detail.metrics.shares, detail.metrics.saves].some(
                (v) => v !== undefined,
              ) ? (
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <InlineStack gap="600" wrap>
                    {stat(t('statViews'), detail.metrics.views)}
                    {stat(t('statLikes'), detail.metrics.likes)}
                    {stat(t('statComments'), detail.metrics.comments)}
                    {stat(t('statShares'), detail.metrics.shares)}
                    {stat(t('statSaves'), detail.metrics.saves)}
                  </InlineStack>
                </Box>
              ) : null}

              {detail.status === 'running' ? (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" tone="subdued">{phaseText(detail.phase)} — {t('runningHint')}</Text>
                </InlineStack>
              ) : null}
              {detail.status === 'error' ? (
                <BlockStack gap="200">
                  <Banner tone="critical">{detail.error || t('errGeneric')}</Banner>
                  {/* Cho chọn LẠI AI + model rồi phân tích lại (không khóa cứng AI cũ). */}
                  <InlineGrid gap="300" columns={{ xs: 1, md: '1fr 1fr auto' }} alignItems="end">
                    <Select
                      label={t('aiProvider')}
                      options={providerOptions}
                      value={provider}
                      onChange={(v) => void selectProvider(v)}
                    />
                    <Select
                      label={t('aiModel')}
                      options={modelOptions}
                      value={model}
                      onChange={setModel}
                      disabled={!provider}
                    />
                    <Button variant="primary" loading={busy} onClick={() => void reanalyze(detail.id)}>
                      {t('analyze')}
                    </Button>
                  </InlineGrid>
                </BlockStack>
              ) : null}

              {/* Chia sẻ công khai (chỉ-xem, thu gọn). Nội dung công khai vẫn theo gói của chủ. */}
              {detail.status === 'done' ? (
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="span" variant="headingSm">{t('shareTitle')}</Text>
                    {shareUrl ? (
                      <BlockStack gap="200">
                        <TextField
                          label={t('shareLinkLabel')}
                          labelHidden
                          value={shareUrl}
                          readOnly
                          autoComplete="off"
                          connectedRight={<Button onClick={() => void copyShare()}>{t('shareCopy')}</Button>}
                        />
                        <InlineStack gap="200">
                          <Button variant="plain" url={shareUrl} external>{t('shareOpen')}</Button>
                          <Button variant="plain" tone="critical" loading={shareBusy} onClick={() => void toggleShare(false)}>
                            {t('shareRevoke')}
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    ) : (
                      <InlineStack gap="200" blockAlign="center">
                        <Button loading={shareBusy} onClick={() => void toggleShare(true)}>{t('shareCreate')}</Button>
                        <Text as="span" tone="subdued" variant="bodySm">{t('shareDesc')}</Text>
                      </InlineStack>
                    )}
                  </BlockStack>
                </Box>
              ) : null}

              {detail.status === 'done' && a ? (
                <BlockStack gap="400">
                  <BlockStack gap="150">
                    <Text as="p">{a.summary}</Text>
                    <InlineStack gap="150" wrap>
                      {a.contentType ? <Badge>{a.contentType}</Badge> : null}
                      {a.tone ? <Badge tone="info">{`${t('tone')}: ${a.tone}`}</Badge> : null}
                      {a.pacing ? <Badge>{`${t('pacing')}: ${a.pacing}`}</Badge> : null}
                      {a.targetAudience ? <Badge>{a.targetAudience}</Badge> : null}
                    </InlineStack>
                  </BlockStack>

                  {a.hookText ? (
                    <Section title={t('hook')}>
                      <Text as="p" fontWeight="semibold">“{a.hookText}”</Text>
                      {a.hookWhy ? <Text as="p" tone="subdued">{a.hookWhy}</Text> : null}
                    </Section>
                  ) : null}
                  {a.intro ? <Section title={t('intro')}><Text as="p">{a.intro}</Text></Section> : null}
                  {a.formula ? <Section title={t('formula')}><Text as="p">{a.formula}</Text></Section> : null}

                  {a.timeline.length ? (
                    <Section title={t('timeline')}>
                      {/* [timeline] [video nhúng] — xem video ngay khi bóc tách theo thời gian. */}
                      <InlineGrid columns={{ xs: 1, md: emb ? '3fr 2fr' : 1 }} gap="400">
                        <BlockStack gap="150">
                          {a.timeline.map((s, i) => (
                            <InlineStack key={i} gap="300" blockAlign="start" wrap={false}>
                              <Box minWidth="90px">
                                <Text as="span" variant="bodySm" fontWeight="semibold">{s.from}{s.to ? `–${s.to}` : ''}</Text>
                              </Box>
                              <BlockStack gap="050">
                                <Text as="span">{s.segment}</Text>
                                {s.purpose ? <Text as="span" tone="subdued" variant="bodySm">{s.purpose}</Text> : null}
                              </BlockStack>
                            </InlineStack>
                          ))}
                        </BlockStack>
                        {emb ? <VideoEmbedBox emb={emb} title={detail.title} /> : null}
                      </InlineGrid>
                    </Section>
                  ) : null}

                  {a.successReasons.length ? (
                    <Section title={t('successReasons')}><List>{a.successReasons.map((x, i) => <List.Item key={i}>{x}</List.Item>)}</List></Section>
                  ) : null}
                  {a.strengths.length ? (
                    <Section title={t('strengths')}><List>{a.strengths.map((x, i) => <List.Item key={i}>{x}</List.Item>)}</List></Section>
                  ) : null}
                  {a.improvements.length ? (
                    <Section title={t('improvements')}><List>{a.improvements.map((x, i) => <List.Item key={i}>{x}</List.Item>)}</List></Section>
                  ) : null}
                  {a.takeaways.length ? (
                    <Section title={t('takeaways')}><List type="bullet">{a.takeaways.map((x, i) => <List.Item key={i}>{x}</List.Item>)}</List></Section>
                  ) : null}
                  {a.cta ? <Section title={t('cta')}><Text as="p">{a.cta}</Text></Section> : null}

                  {detail.transcript ? (
                    <BlockStack gap="150">
                      <Button variant="plain" onClick={() => setShowTranscript((v) => !v)}>
                        {showTranscript ? t('hideTranscript') : t('showTranscript')}
                      </Button>
                      {showTranscript ? (
                        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                          <Text as="p" tone="subdued" variant="bodySm">{detail.transcript}</Text>
                        </Box>
                      ) : null}
                    </BlockStack>
                  ) : null}
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        ) : null}

        {/* Lịch sử */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">{t('history')}</Text>
            {items.length === 0 ? (
              <Text as="p" tone="subdued">{t('empty')}</Text>
            ) : (
              <BlockStack gap="0">
                {items.map((it, idx) => (
                  <Box key={it.id}>
                    {idx > 0 ? <Divider /> : null}
                    <Box paddingBlock="300">
                      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Badge tone={PLATFORM_TONE[it.platform]}>{it.platform.toUpperCase()}</Badge>
                          {it.status === 'running' ? <Badge tone="attention" progress="incomplete">{phaseText(it.phase)}</Badge> : null}
                          {it.status === 'error' ? <Badge tone="critical">{t('statusError')}</Badge> : null}
                          {it.status === 'done' ? <Badge tone="success">{t('statusDone')}</Badge> : null}
                          <Text as="span" truncate>{it.title || it.url}</Text>
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          {/* Nút xem: đồng bộ với nút xem báo cáo Social (slim, primary khi đã xong). */}
                          <Button size="slim" variant={it.status === 'done' ? 'primary' : 'secondary'} onClick={() => void open(it.id)}>
                            {t('open')}
                          </Button>
                          <Button variant="plain" tone="critical" onClick={() => void del(it.id)}>{t('delete')}</Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  </Box>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BlockStack gap="150">
      <Text as="h4" variant="headingSm">{title}</Text>
      {children}
    </BlockStack>
  );
}

// Khung video nhúng cạnh timeline. Dọc (9/16) → giới hạn bề ngang cho gọn; ngang (16/9) → phủ cột.
// Dính (sticky) để cuộn timeline vẫn thấy video.
function VideoEmbedBox({ emb, title }: { emb: VideoEmbed; title?: string }) {
  const vertical = emb.ratio === '9 / 16';
  return (
    <div style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: vertical ? 300 : undefined,
          margin: vertical ? '0 auto' : undefined,
          aspectRatio: emb.ratio,
          background: '#000',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--p-color-border)',
        }}
      >
        <iframe
          src={emb.src}
          title={title || 'Video'}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </div>
    </div>
  );
}
