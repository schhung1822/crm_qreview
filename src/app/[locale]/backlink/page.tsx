'use client';

// Backlink chéo site: quét bài từ các CMS đã kết nối → AI lọc cặp KHÁC SITE thật sự liên quan →
// đề xuất đi backlink 2 chiều (chèn link ngữ cảnh + utm_source) → sơ đồ liên kết. Không đi link bừa.
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  Page,
  ProgressBar,
  Text,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GraphView, type FGData } from '@/components/ForceGraph';
import type { DiffSeg } from '@/lib/content/diff';

interface BLNode {
  id: string;
  connectionId: string;
  siteLabel: string;
  postId: string;
  title: string;
  url?: string;
  inLinks: number;
  outLinks: number;
}
interface BLSuggestion {
  id: string;
  aId: string;
  bId: string;
  score: number;
  reason: string;
  anchorA: string;
  anchorB: string;
  status: 'suggested' | 'applied' | 'rejected';
}
interface BLScan {
  id: string;
  status: 'running' | 'done' | 'error';
  phase: 'fetching' | 'analyzing' | 'done' | 'error';
  sitesTotal: number;
  sitesDone: number;
  postsFound: number;
  nodes: BLNode[];
  edges: Array<{ from: string; to: string }>;
  suggestions: BLSuggestion[];
  aiError?: string | null;
  siteErrors?: Array<{ connectionId: string; siteLabel: string; error: string }>;
  error?: string;
}
interface DirResult {
  direction: 'a2b' | 'b2a';
  sourceLabel: string;
  targetLabel: string;
  targetTitle: string;
  anchor: string;
  targetUrl?: string;
  applied: boolean;
  skipped?: string;
  diff?: DiffSeg[];
  error?: string;
}
interface SugResult {
  suggestionId: string;
  directions: DirResult[];
  appliedCount: number;
}

export default function BacklinkPage() {
  const t = useTranslations('backlink');
  const locale = useLocale();
  const [scan, setScan] = useState<BLScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'scan' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ results: SugResult[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeById = useCallback(
    (id: string) => scan?.nodes.find((n) => n.id === id),
    [scan],
  );

  const load = useCallback(async () => {
    const r = await fetch('/api/backlink/scan');
    const d = await r.json().catch(() => null);
    if (r.ok) setScan(d?.scan ?? null);
    setLoading(false);
    return d?.scan as BLScan | null;
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [load]);

  // Poll khi đang quét.
  useEffect(() => {
    if (scan?.status === 'running') {
      pollRef.current = setTimeout(() => void load(), 2000);
      return () => {
        if (pollRef.current) clearTimeout(pollRef.current);
      };
    }
  }, [scan, load]);

  async function startScan() {
    setBusy('scan');
    setError(null);
    setNotice(null);
    setSelected(new Set());
    try {
      const r = await fetch('/api/backlink/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error ?? t('errGeneric'));
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const suggested = (scan?.suggestions ?? []).filter((s) => s.status === 'suggested');
  const appliedCount = (scan?.suggestions ?? []).filter((s) => s.status === 'applied').length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === suggested.length ? new Set() : new Set(suggested.map((s) => s.id))));
  }

  async function doPreview() {
    if (!selected.size) return;
    setBusy('apply');
    setError(null);
    try {
      const r = await fetch('/api/backlink/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', confirm: false, suggestionIds: [...selected] }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error ?? t('errGeneric'));
        return;
      }
      setPreview({ results: d.results ?? [] });
    } finally {
      setBusy(null);
    }
  }

  async function doApply() {
    if (!selected.size) return;
    setBusy('apply');
    setError(null);
    try {
      const r = await fetch('/api/backlink/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', confirm: true, suggestionIds: [...selected] }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error ?? t('errGeneric'));
        return;
      }
      const applied = (d.results as SugResult[]).reduce((s, r2) => s + r2.appliedCount, 0);
      setNotice(t('appliedToast', { n: applied }));
      setPreview(null);
      setSelected(new Set());
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    await fetch('/api/backlink/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', suggestionIds: [id] }),
    });
    await load();
  }

  const graph: FGData = {
    nodes: (scan?.nodes ?? []).map((n) => ({ id: n.id, title: `${n.title} · ${n.siteLabel}`, url: n.url, inLinks: n.inLinks, outLinks: n.outLinks })),
    edges: scan?.edges ?? [],
  };

  const running = scan?.status === 'running';
  const phaseLabel = scan?.phase === 'analyzing' ? t('phaseAnalyzing') : t('phaseFetching');
  const progress = scan ? Math.round(((scan.sitesDone || 0) / Math.max(1, scan.sitesTotal)) * 100) : 0;

  function skipReason(code?: string): string {
    switch (code) {
      case 'no-content': return t('skipNoContent');
      case 'no-anchor': return t('skipNoAnchor');
      case 'anchor-not-found': return t('skipAnchorNotFound');
      case 'already-linked': return t('skipAlready');
      case 'bad-target-url': return t('skipBadUrl');
      case 'no-connection': return t('skipNoConnection');
      default: return '';
    }
  }

  return (
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: running ? t('scanning') : scan ? t('rescan') : t('scan'), onAction: () => void startScan(), loading: busy === 'scan' || running, disabled: running }}
    >
      <BlockStack gap="400">
        <Banner tone="info">{t('relatedOnly')}</Banner>
        {error ? <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner> : null}
        {notice ? <Banner tone="success" onDismiss={() => setNotice(null)}>{notice}</Banner> : null}
        {scan?.aiError ? <Banner tone="warning">{scan.aiError}</Banner> : null}
        {scan?.siteErrors?.length ? (
          <Banner tone="warning">
            <BlockStack gap="100">
              {scan.siteErrors.map((e) => (
                <Text as="span" key={e.connectionId} variant="bodySm">{e.siteLabel}: {e.error}</Text>
              ))}
            </BlockStack>
          </Banner>
        ) : null}

        {running ? (
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">{phaseLabel}</Text>
              <ProgressBar progress={progress} size="small" />
              <Text as="span" tone="subdued" variant="bodySm">
                {t('progressSites', { done: scan?.sitesDone ?? 0, total: scan?.sitesTotal ?? 0 })} · {t('progressPosts', { n: scan?.postsFound ?? 0 })}
              </Text>
            </BlockStack>
          </Card>
        ) : null}

        {scan && !running ? (
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap gap="200">
              <InlineStack gap="300" wrap>
                <Text as="span" variant="bodyMd">{t('summaryNodes', { n: scan.nodes.length })}</Text>
                <Text as="span" variant="bodyMd">{t('summaryEdges', { n: scan.edges.length })}</Text>
                <Text as="span" variant="bodyMd" fontWeight="semibold">{t('summarySuggestions', { n: suggested.length })}</Text>
                {appliedCount ? <Badge tone="success">{t('appliedBadge', { n: appliedCount })}</Badge> : null}
              </InlineStack>
              <ButtonGroup variant="segmented">
                <Button pressed={view === 'list'} onClick={() => setView('list')}>{t('viewList')}</Button>
                <Button pressed={view === 'graph'} onClick={() => setView('graph')}>{t('viewGraph')}</Button>
              </ButtonGroup>
            </InlineStack>
          </Card>
        ) : null}

        {scan && !running && view === 'graph' ? (
          <Card>
            {graph.nodes.length ? (
              <GraphView graph={graph} onOpenNode={(id) => { const n = nodeById(id); if (n?.url) window.open(n.url, '_blank'); }} />
            ) : (
              <Box padding="400"><Text as="p" tone="subdued">{t('graphEmpty')}</Text></Box>
            )}
          </Card>
        ) : null}

        {scan && !running && view === 'list' ? (
          suggested.length ? (
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Checkbox label={t('selectAll')} checked={selected.size === suggested.length && suggested.length > 0} onChange={toggleAll} />
                  <Button variant="primary" disabled={!selected.size} loading={busy === 'apply'} onClick={() => void doPreview()}>
                    {t('previewApply', { n: selected.size })}
                  </Button>
                </InlineStack>
                <BlockStack gap="200">
                  {suggested.map((s) => {
                    const a = nodeById(s.aId);
                    const b = nodeById(s.bId);
                    return (
                      <Box key={s.id} padding="300" borderColor="border" borderWidth="025" borderRadius="200">
                        <InlineStack gap="300" blockAlign="start" wrap={false}>
                          <Checkbox label="" labelHidden checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Badge tone={s.score >= 85 ? 'success' : 'attention'}>{t('score', { n: s.score })}</Badge>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{a?.title ?? '?'}</Text>
                              <Text as="span" tone="subdued" variant="bodySm">({a?.siteLabel})</Text>
                              <Text as="span" tone="subdued">↔</Text>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{b?.title ?? '?'}</Text>
                              <Text as="span" tone="subdued" variant="bodySm">({b?.siteLabel})</Text>
                            </InlineStack>
                            {s.reason ? <Text as="p" tone="subdued" variant="bodySm">{s.reason}</Text> : null}
                            <InlineStack gap="200" wrap>
                              {s.anchorA ? <Text as="span" variant="bodySm">{t('anchorAt', { site: a?.siteLabel ?? '', anchor: s.anchorA })}</Text> : null}
                              {s.anchorB ? <Text as="span" variant="bodySm">{t('anchorAt', { site: b?.siteLabel ?? '', anchor: s.anchorB })}</Text> : null}
                            </InlineStack>
                          </BlockStack>
                        </InlineStack>
                        <Box paddingBlockStart="200">
                          <Button variant="plain" tone="critical" onClick={() => void reject(s.id)}>{t('reject')}</Button>
                        </Box>
                      </Box>
                    );
                  })}
                </BlockStack>
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <Box padding="400"><Text as="p" tone="subdued">{scan.nodes.length ? t('noSuggestions') : t('noPosts')}</Text></Box>
            </Card>
          )
        ) : null}

        {!scan && !loading ? (
          <Card>
            <Box padding="400">
              <BlockStack gap="200">
                <Text as="p">{t('emptyIntro')}</Text>
                <Text as="p" tone="subdued" variant="bodySm">{t('utmNote')}</Text>
              </BlockStack>
            </Box>
          </Card>
        ) : null}
      </BlockStack>

      {/* Preview diff trước khi đi backlink thật */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={t('previewTitle')}
        primaryAction={{ content: t('confirmApply'), loading: busy === 'apply', onAction: () => void doApply() }}
        secondaryActions={[{ content: t('cancel'), onAction: () => setPreview(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {(preview?.results ?? []).map((r) => (
              <BlockStack key={r.suggestionId} gap="200">
                {r.directions.map((d, i) => (
                  <Box key={i} padding="200" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {t('directionLabel', { source: d.sourceLabel, target: d.targetLabel })} — {d.targetTitle}
                      </Text>
                      {d.skipped ? (
                        <Text as="span" tone="subdued" variant="bodySm">{skipReason(d.skipped)}</Text>
                      ) : d.diff ? (
                        <Box>
                          <Text as="span" variant="bodySm">
                            {d.diff.map((seg, j) =>
                              seg.type === 'same' ? (
                                <span key={j}>{seg.text}</span>
                              ) : seg.type === 'add' ? (
                                <span key={j} style={{ background: 'rgba(46,160,67,.22)' }}>{seg.text}</span>
                              ) : (
                                <span key={j} style={{ background: 'rgba(229,72,77,.18)', textDecoration: 'line-through' }}>{seg.text}</span>
                              ),
                            )}
                          </Text>
                        </Box>
                      ) : null}
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
