'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  DataTable,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, XIcon } from '@/components/icons';
import { AiWorking, ScoreRing } from '@/components/ui';
import type { ScoreCheck, ScoreResult } from '@/lib/scoring/types';

interface Conn {
  id: string;
  label: string;
  provider: string;
  locale: string;
}
interface CmsPost {
  id: string;
  title: string;
  slug: string;
  date?: string;
  url?: string;
  contentHtml?: string;
}

// Token tiêu đề để chấm độ liên quan (client) - khớp logic server.
const STOP = new Set([
  'và','của','các','cho','bài','cách','hướng','dẫn','là','top','tốt','nhất',
  'the','a','of','for','to','guide','best','how','what','and','with','your',
]);
function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9đ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}
interface Analysis {
  post: {
    id: string;
    title: string;
    slug: string;
    metaDescription: string;
    markdown: string;
    locale: string;
    targetKeyword: string;
    tags?: string[];
    categories?: string[];
  };
  seo: ScoreResult;
  aeo: ScoreResult;
  geo: ScoreResult;
}

type ScanMode = 'recent' | 'all' | 'time' | 'keyword';

interface GraphNode {
  id: string;
  title: string;
  slug: string;
  url?: string;
  inLinks: number;
  outLinks: number;
}
interface GraphData {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string }>;
  suggestions: Array<{ from: string; to: string; reason: string }>;
  suggestBy?: 'ai' | 'keyword';
  aiError?: string | null;
}

export default function OptimizePage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conns, setConns] = useState<Conn[] | null>(null);
  const [connId, setConnId] = useState('');

  const [mode, setMode] = useState<ScanMode>('recent');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState('');

  // Chế độ xem + sơ đồ liên kết.
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphBusy, setGraphBusy] = useState(false);
  const [selectedSugg, setSelectedSugg] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  // Chọn AI + model để chạy gợi ý internal link theo nội dung.
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [suggBusy, setSuggBusy] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const restoredConn = useRef<string>('');

  // Tab: 0 = Tối ưu (quét/phân tích/sơ đồ), 1 = Công cụ nâng cao (bảo trì).
  const [tab, setTab] = useState(0);

  // Khôi phục bài bị bug chuyển thành nháp.
  const [repBusy, setRepBusy] = useState<'check' | 'apply' | null>(null);
  const [repFound, setRepFound] = useState<number | null>(null);
  // Gộp + dọn mục "Bài viết liên quan" (1 mục/bài, mọi dòng đều có link).
  const [mergeBusy, setMergeBusy] = useState<'check' | 'apply' | null>(null);
  const [mergeFound, setMergeFound] = useState<number | null>(null);

  // Khôi phục lần quét trước (khi back từ editor về) → vẫn thấy danh sách bài đã quét.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('opt_scan');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.connId) {
        setConnId(s.connId);
        restoredConn.current = s.connId;
      }
      if (s.mode) setMode(s.mode);
      if (s.fromDate) setFromDate(s.fromDate);
      if (s.toDate) setToDate(s.toDate);
      if (s.search) setSearch(s.search);
      if (Array.isArray(s.posts)) setPosts(s.posts);
      // KHÔNG khôi phục `view`: luôn mở ở chế độ Danh sách. Ai muốn xem Sơ đồ thì tự bấm.
    } catch {
      /* bỏ qua */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d: { connections: Conn[] }) => {
        setConns(d.connections);
        // Chỉ chọn mặc định nếu CHƯA khôi phục kết nối từ lần quét trước.
        if (!restoredConn.current && d.connections[0]) setConnId(d.connections[0].id);
      })
      .catch(() => setConns([]));
  }, []);

  // Đến từ trang Audit: ?conn=<id>&url=<page> → chọn kết nối + tự tra cứu bài & phân tích.
  const auditHandledRef = useRef(false);
  useEffect(() => {
    if (auditHandledRef.current) return;
    const conn = searchParams.get('conn');
    const pageUrl = searchParams.get('url');
    if (!conn) return;
    auditHandledRef.current = true;
    restoredConn.current = conn;
    setConnId(conn);
    if (!pageUrl) return;
    (async () => {
      try {
        const r = await fetch(`/api/connections/${conn}/resolve?url=${encodeURIComponent(pageUrl)}`);
        const d = await r.json();
        if (d.postId) await analyze(d.postId, conn);
        else setError(t('optimize.resolveFail'));
      } catch {
        setError(t('optimize.resolveFail'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Danh sách provider AI (để chọn khi chạy gợi ý theo nội dung).
  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean }> }) =>
        setProviders(d.providers),
      )
      .catch(() => {});
  }, []);

  async function loadModels(provider: string) {
    if (!provider) {
      setAiModels([]);
      return;
    }
    setModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, kind: 'text' }),
      });
      const d = await res.json();
      const list = res.ok && Array.isArray(d.models) ? (d.models as string[]) : [];
      setAiModels(list);
      if (list.length) setAiModel((cur) => (cur && list.includes(cur) ? cur : list[0]));
    } catch {
      setAiModels([]);
    } finally {
      setModelsBusy(false);
    }
  }
  function selectProvider(v: string) {
    setAiProvider(v);
    setAiModel('');
    void loadModels(v);
  }

  // Lưu lại trạng thái quét để khi quay lại trang vẫn còn (nhẹ - bỏ contentHtml nếu quá lớn).
  function persistScan(list: CmsPost[]) {
    const payload = { connId, mode, fromDate, toDate, search, view, posts: list };
    try {
      sessionStorage.setItem('opt_scan', JSON.stringify(payload));
    } catch {
      try {
        const trimmed = list.map(({ id, title, slug, date, url }) => ({ id, title, slug, date, url }));
        sessionStorage.setItem('opt_scan', JSON.stringify({ ...payload, posts: trimmed }));
      } catch {
        /* hết quota - bỏ qua */
      }
    }
  }

  // Tham số quét dùng chung cho list + graph.
  function scanParams() {
    const p: Record<string, string> = {};
    if (mode === 'all') p.mode = 'all';
    if (mode === 'time') {
      if (fromDate) p.after = fromDate;
      if (toDate) p.before = toDate;
    }
    if (mode === 'keyword' && search.trim()) p.search = search.trim();
    return p;
  }

  async function scan() {
    setScanning(true);
    setError(null);
    setPosts(null);
    setAnalysis(null);
    setGraph(null);
    setSelectedSugg(new Set());
    try {
      const qs = new URLSearchParams(scanParams());
      const res = await fetch(`/api/connections/${connId}/posts?${qs.toString()}`);
      const d = await res.json();
      if (res.ok && Array.isArray(d.posts)) {
        setPosts(d.posts);
        persistScan(d.posts);
        if (view === 'graph') void loadGraph();
      } else {
        setError(d.error ?? t('optimize.noPosts'));
        setPosts([]);
      }
    } finally {
      setScanning(false);
    }
  }

  async function loadGraph() {
    setGraphBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, ...scanParams() }),
      });
      const d = await res.json();
      if (res.ok && d.nodes) setGraph(d);
      else setError(d.error ?? 'Lỗi dựng sơ đồ');
    } finally {
      setGraphBusy(false);
    }
  }

  // Chạy gợi ý internal link BẰNG AI (đọc nội dung). Dùng provider/model đã chọn (nếu có).
  async function runAiSuggest() {
    if (!connId) return;
    setSuggBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connId,
          ...scanParams(),
          aiSuggest: true,
          ...(aiProvider ? { provider: aiProvider } : {}),
          ...(aiProvider && aiModel ? { model: aiModel } : {}),
        }),
      });
      const d = await res.json();
      if (res.ok && d.nodes) setGraph(d);
      else setError(d.error ?? 'Lỗi chạy gợi ý');
    } finally {
      setSuggBusy(false);
    }
  }

  // Sau F5 mà đang ở chế độ Sơ đồ → tự dựng lại sơ đồ (lấy nội dung MỚI từ web,
  // phản ánh đúng link vừa chèn).
  const graphAutoRef = useRef(false);
  useEffect(() => {
    if (graphAutoRef.current) return;
    if (view === 'graph' && !graph && !graphBusy && connId && (posts?.length ?? 0) > 0) {
      graphAutoRef.current = true;
      void loadGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, graph, graphBusy, connId, posts]);

  function switchView(v: 'list' | 'graph') {
    setView(v);
    try {
      const raw = sessionStorage.getItem('opt_scan');
      if (raw) sessionStorage.setItem('opt_scan', JSON.stringify({ ...JSON.parse(raw), view: v }));
    } catch {
      /* bỏ qua */
    }
    if (v === 'graph' && !graph && posts && posts.length) void loadGraph();
  }

  function toggleSugg(key: string) {
    setSelectedSugg((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async function applyInterlinks() {
    if (!graph || selectedSugg.size === 0) return;
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const editsMap = new Map<string, Array<{ url: string; anchor: string }>>();
    for (const key of selectedSugg) {
      const [from, to] = key.split('|');
      const target = byId.get(to);
      if (!target) continue;
      const url = target.url || `/${target.slug}`;
      const arr = editsMap.get(from) ?? [];
      arr.push({ url, anchor: target.title });
      editsMap.set(from, arr);
    }
    const edits = [...editsMap.entries()].map(([postId, links]) => ({ postId, links }));
    if (!edits.length) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize/interlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, confirm: true, edits }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setSelectedSugg(new Set());
        setError(null);
        setAnalysis(null);
        await loadGraph();
        setOkMsg(t('optimize.interlinkDone', { n: d.totalAdded }));
      } else {
        setError(d.error ?? 'Lỗi áp dụng internal link');
      }
    } finally {
      setApplying(false);
    }
  }

  async function analyze(postId: string, conn: string = connId) {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    // Cuộn xuống khu vực phân tích để người dùng thấy ngay tính năng đang chạy.
    setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    try {
      const res = await fetch('/api/optimize/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: conn, postId }),
      });
      const d = await res.json();
      if (res.ok && d.post) setAnalysis(d);
      else setError(d.error ?? 'Lỗi phân tích');
    } finally {
      setAnalyzing(false);
    }
  }

  // Khi đã CÓ kết quả phân tích → cuộn xuống khu vực kết quả (sau khi render xong).
  useEffect(() => {
    if (analysis) {
      requestAnimationFrame(() =>
        analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  }, [analysis]);

  // Internal link gợi ý cho 1 bài cũ: bài liên quan (chung từ khóa tiêu đề) mà bài này
  // CHƯA trỏ tới. Dùng dữ liệu đã quét (posts) → không cần gọi server lại.
  function relatedLinksFor(postId: string): Array<{ anchor: string; url: string }> {
    const all = posts ?? [];
    const self = all.find((p) => p.id === postId);
    if (!self) return [];
    const selfTok = new Set(titleTokens(self.title));
    const html = self.contentHtml ?? '';
    const scored = all
      .filter((p) => p.id !== postId)
      .map((p) => {
        const shared = [...new Set(titleTokens(p.title))].filter((w) => selfTok.has(w));
        const alreadyLinked = !!p.slug && new RegExp(`/${p.slug}(/|[?#"'])`).test(html);
        return { p, score: shared.length, alreadyLinked };
      })
      .filter((x) => x.score >= 2 && !x.alreadyLinked)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return scored.map((x) => ({ anchor: x.p.title, url: x.p.url || `/${x.p.slug}` }));
  }

  async function editThis() {
    if (!analysis) return;
    setOpening(true);
    try {
      const res = await fetch('/api/articles/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: analysis.post.title,
          slug: analysis.post.slug,
          metaDescription: analysis.post.metaDescription,
          markdown: analysis.post.markdown,
          locale: analysis.post.locale,
          targetKeyword: analysis.post.targetKeyword,
          tags: analysis.post.tags,
          categories: analysis.post.categories,
          connectionId: connId,
          cmsPostId: analysis.post.id,
          source: 'edited', // bài cũ nhập về để sửa/tối ưu
          seoScore: analysis.seo.score,
          aeoScore: analysis.aeo.score,
          geoScore: analysis.geo.score,
        }),
      });
      const d = await res.json();
      if (res.ok && d.article) {
        // Gửi kèm internal link gợi ý để editor dùng khi "Tối ưu bằng AI".
        try {
          const links = relatedLinksFor(analysis.post.id);
          if (links.length) {
            sessionStorage.setItem(`opt_interlinks_${d.article.id}`, JSON.stringify(links));
          }
        } catch {
          /* sessionStorage có thể bị chặn - bỏ qua */
        }
        router.push(`/${locale}/editor?draft=${d.article.id}&from=optimize`);
      } else {
        setError(d.error ?? 'Không mở được bản nháp để sửa');
      }
    } finally {
      setOpening(false);
    }
  }

  async function checkRepublish() {
    setRepBusy('check');
    setError(null);
    setOkMsg(null);
    setRepFound(null);
    try {
      const res = await fetch('/api/optimize/republish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, confirm: false }),
      });
      const d = await res.json();
      if (res.ok) setRepFound(d.count ?? 0);
      else setError(d.error ?? 'Lỗi kiểm tra');
    } finally {
      setRepBusy(null);
    }
  }

  async function applyRepublish() {
    setRepBusy('apply');
    setError(null);
    try {
      const res = await fetch('/api/optimize/republish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, confirm: true }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setOkMsg(t('optimize.republishDone', { n: d.republished }));
        setRepFound(0);
      } else setError(d.error ?? 'Lỗi xuất bản lại');
    } finally {
      setRepBusy(null);
    }
  }

  async function checkMerge() {
    setMergeBusy('check');
    setError(null);
    setOkMsg(null);
    setMergeFound(null);
    try {
      const res = await fetch('/api/optimize/merge-related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, confirm: false }),
      });
      const d = await res.json();
      if (res.ok) setMergeFound(d.count ?? 0);
      else setError(d.error ?? 'Lỗi kiểm tra');
    } finally {
      setMergeBusy(null);
    }
  }

  async function applyMerge() {
    setMergeBusy('apply');
    setError(null);
    try {
      const res = await fetch('/api/optimize/merge-related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, confirm: true }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setOkMsg(t('optimize.mergeDone', { n: d.merged }));
        setMergeFound(0);
      } else setError(d.error ?? 'Lỗi gộp');
    } finally {
      setMergeBusy(null);
    }
  }

  const noConns = conns !== null && conns.length === 0;
  const weak = analysis
    ? [...analysis.seo.checks, ...analysis.aeo.checks, ...analysis.geo.checks].filter((c) => c.state !== 'pass')
    : [];

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    const q = filter.trim().toLowerCase();
    return q ? posts.filter((p) => (p.title || p.slug).toLowerCase().includes(q)) : posts;
  }, [posts, filter]);

  const postRows = visiblePosts.map((p) => [
    <Text as="span" fontWeight="semibold" key={p.id}>
      {p.title || p.slug || p.id}
    </Text>,
    p.date ? new Date(p.date).toLocaleDateString() : '-',
    <Button key={`${p.id}-b`} size="slim" variant="primary" onClick={() => analyze(p.id)} disabled={analyzing}>
      {t('optimize.analyzeBtn')}
    </Button>,
  ]);

  return (
    <Page title={t('optimize.title')} subtitle={t('optimize.subtitle')}>
      <BlockStack gap="400">
        <Tabs
          tabs={[
            { id: 'opt-main', content: t('optimize.tabMain') },
            { id: 'opt-adv', content: t('optimize.tabAdvanced') },
          ]}
          selected={tab}
          onSelect={setTab}
        />

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        {okMsg ? (
          <Banner tone="success" onDismiss={() => setOkMsg(null)}>
            {okMsg}
          </Banner>
        ) : null}

        {tab === 0 ? (
          <BlockStack gap="400">
            <Banner tone="info">{t('optimize.analyzeHint')}</Banner>

            {noConns ? (
              <Banner
                tone="warning"
                title={t('optimize.noConnections')}
                action={{ content: t('optimize.goConnections'), url: `/${locale}/connections` }}
              />
            ) : (
          <Card>
            <BlockStack gap="300">
              <InlineGrid columns={{ xs: 2, md: '1fr 1fr' }} gap="300">
                <Select
                  label={t('optimize.selectSite')}
                  options={(conns ?? []).map((c) => ({
                    label: `${c.label} · ${c.provider} · ${c.locale}`,
                    value: c.id,
                  }))}
                  value={connId}
                  onChange={setConnId}
                />
                <Select
                  label={t('optimize.scanMode')}
                  options={[
                    { label: t('optimize.scanRecent'), value: 'recent' },
                    { label: t('optimize.scanAll'), value: 'all' },
                    { label: t('optimize.scanTime'), value: 'time' },
                    { label: t('optimize.scanKeyword'), value: 'keyword' },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as ScanMode)}
                />
              </InlineGrid>

              {mode === 'time' ? (
                <InlineGrid columns={{ xs: 2, md: 2 }} gap="300">
                  <TextField type="date" label={t('optimize.fromDate')} value={fromDate} onChange={setFromDate} autoComplete="off" />
                  <TextField type="date" label={t('optimize.toDate')} value={toDate} onChange={setToDate} autoComplete="off" />
                </InlineGrid>
              ) : null}
              {mode === 'keyword' ? (
                <TextField
                  label={t('optimize.searchTitle')}
                  value={search}
                  onChange={setSearch}
                  autoComplete="off"
                />
              ) : null}

              <InlineStack>
                <Button variant="primary" loading={scanning} disabled={!connId || scanning} onClick={scan}>
                  {scanning ? t('optimize.scanning') : t('optimize.scan')}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {scanning ? <AiWorking text={t('optimize.scanning')} progress="indeterminate" /> : null}

        {/* Kết quả quét - toggle Danh sách / Sơ đồ */}
        {posts ? (
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="300" blockAlign="center">
                  <Text as="h2" variant="headingSm">
                    {t('optimize.postsFound', { n: posts.length })}
                  </Text>
                  <ButtonGroup variant="segmented">
                    <Button pressed={view === 'list'} onClick={() => switchView('list')}>
                      {t('optimize.viewList')}
                    </Button>
                    <Button pressed={view === 'graph'} onClick={() => switchView('graph')}>
                      {t('optimize.viewGraph')}
                    </Button>
                  </ButtonGroup>
                </InlineStack>
                {view === 'list' ? (
                  <Box minWidth="220px">
                    <TextField
                      label={t('optimize.filterList')}
                      labelHidden
                      placeholder={t('optimize.filterList')}
                      value={filter}
                      onChange={setFilter}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setFilter('')}
                    />
                  </Box>
                ) : null}
              </InlineStack>
            </Box>

            {view === 'list' ? (
              visiblePosts.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    {t('optimize.noResults')}
                  </Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text']}
                  headings={[t('optimize.colPostTitle'), t('optimize.colDate'), '']}
                  rows={postRows}
                />
              )
            ) : (
              <Box padding="400">
                {graphBusy ? (
                  <AiWorking text={t('optimize.graphLoading')} progress="indeterminate" />
                ) : !graph ? (
                  <Text as="p" tone="subdued">
                    {t('optimize.graphEmpty')}
                  </Text>
                ) : (
                  <BlockStack gap="400">
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('optimize.graphHint')}
                    </Text>
                    <LinkGraph graph={graph} />
                  </BlockStack>
                )}
              </Box>
            )}
          </Card>
        ) : null}

        {/* Gợi ý internal link (chế độ sơ đồ) */}
        {view === 'graph' && graph ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                {t('optimize.suggTitle')} ({graph.suggestions.length})
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {graph.suggestBy === 'ai' ? t('optimize.suggByAi') : t('optimize.suggByKeywordHint')}
              </Text>

              {/* Chọn AI + model rồi chạy gợi ý theo NỘI DUNG bài */}
              <InlineGrid columns={{ xs: 2, sm: '1fr 1fr auto' }} gap="300">
                <Select
                  label={t('optimize.suggAi')}
                  options={[
                    { label: t('optimize.suggAiAuto'), value: '' },
                    ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                  ]}
                  value={aiProvider}
                  onChange={selectProvider}
                />
                <Select
                  label={t('optimize.suggModel')}
                  disabled={!aiProvider || modelsBusy}
                  options={[
                    { label: modelsBusy ? t('optimize.suggModelLoading') : t('optimize.suggModelDefault'), value: '' },
                    ...aiModels.map((m) => ({ label: m, value: m })),
                  ]}
                  value={aiModel}
                  onChange={setAiModel}
                />
                <Box paddingBlockStart="500">
                  <Button variant="primary" loading={suggBusy} disabled={suggBusy} onClick={runAiSuggest}>
                    {suggBusy ? t('optimize.suggRunning') : t('optimize.suggRun')}
                  </Button>
                </Box>
              </InlineGrid>
              {graph.aiError ? <Banner tone="warning">{graph.aiError}</Banner> : null}

              <Banner tone="warning">{t('optimize.interlinkWarn')}</Banner>
              {suggBusy ? <AiWorking text={t('optimize.suggRunning')} /> : null}
              {graph.suggestions.length === 0 ? (
                <Text as="p" tone="subdued">
                  {t('optimize.suggNone')}
                </Text>
              ) : (
                <>
                  <InlineStack gap="300" blockAlign="center">
                    <Checkbox
                      label={t('optimize.selectAllSugg')}
                      checked={selectedSugg.size === graph.suggestions.length && graph.suggestions.length > 0}
                      onChange={() =>
                        setSelectedSugg((s) =>
                          s.size === graph.suggestions.length
                            ? new Set()
                            : new Set(graph.suggestions.map((x) => `${x.from}|${x.to}`)),
                        )
                      }
                    />
                    <Button
                      variant="primary"
                      disabled={selectedSugg.size === 0}
                      loading={applying}
                      onClick={applyInterlinks}
                    >
                      {t('optimize.applyInterlink', { n: selectedSugg.size })}
                    </Button>
                  </InlineStack>
                  <BlockStack gap="100">
                    {graph.suggestions.slice(0, 100).map((s) => {
                      const key = `${s.from}|${s.to}`;
                      const from = graph.nodes.find((n) => n.id === s.from);
                      const to = graph.nodes.find((n) => n.id === s.to);
                      return (
                        <InlineStack key={key} gap="200" blockAlign="start" wrap={false}>
                          <Checkbox
                            label=""
                            labelHidden
                            checked={selectedSugg.has(key)}
                            onChange={() => toggleSugg(key)}
                          />
                          <Text as="span" variant="bodySm">
                            <Text as="span" fontWeight="semibold">
                              {from?.title}
                            </Text>{' '}
                            → {to?.title}
                            {s.reason ? (
                              <>
                                {' '}
                                <Text as="span" tone="subdued">
                                  ({s.reason})
                                </Text>
                              </>
                            ) : null}
                          </Text>
                        </InlineStack>
                      );
                    })}
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </Card>
        ) : null}

        <div ref={analysisRef} />
        {analyzing ? <AiWorking text={t('optimize.analyzingAI')} /> : null}

        {analysis ? (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">
                    {analysis.post.title}
                  </Text>
                  {analysis.post.targetKeyword ? (
                    <Box>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {t('optimize.detectedKeyword')}:{' '}
                      </Text>
                      <Badge tone="info">{analysis.post.targetKeyword}</Badge>
                    </Box>
                  ) : null}
                  <InlineStack gap="400" blockAlign="center">
                    <ScoreRing value={analysis.seo.score} />
                    <Text as="span" fontWeight="semibold">
                      {t('optimize.currentSeo')}
                    </Text>
                  </InlineStack>
                  <InlineStack gap="400" blockAlign="center">
                    <ScoreRing value={analysis.aeo.score} />
                    <Text as="span" fontWeight="semibold">
                      {t('optimize.currentAeo')}
                    </Text>
                  </InlineStack>
                  <InlineStack gap="400" blockAlign="center">
                    <ScoreRing value={analysis.geo.score} />
                    <Text as="span" fontWeight="semibold">
                      {t('optimize.currentGeo')}
                    </Text>
                  </InlineStack>
                  <Button variant="primary" loading={opening} onClick={editThis}>
                    {opening ? t('optimize.opening') : t('optimize.editThis')}
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <BlockStack gap="400">
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingSm">
                      {t('optimize.whatToFix')} ({weak.length})
                    </Text>
                    {weak.length === 0 ? (
                      <Badge tone="success">{t('optimize.allGood')}</Badge>
                    ) : null}
                  </InlineStack>
                </Card>

                {/* TOÀN BỘ kết quả: từng nhóm SEO / AEO / GEO + mọi tiêu chí (đạt & chưa đạt) */}
                {(
                  [
                    { key: 'seo', label: t('common.seo'), res: analysis.seo },
                    { key: 'aeo', label: t('common.aeo'), res: analysis.aeo },
                    { key: 'geo', label: t('common.geo'), res: analysis.geo },
                  ] as const
                ).map((g) => {
                  const fails = g.res.checks.filter((c) => c.state !== 'pass').length;
                  return (
                    <Card key={g.key}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <ScoreRing value={g.res.score} />
                            <Text as="h3" variant="headingSm">
                              {g.label}
                            </Text>
                          </InlineStack>
                          <Badge tone={fails === 0 ? 'success' : 'attention'}>
                            {t('optimize.checksPassed', {
                              ok: g.res.checks.length - fails,
                              total: g.res.checks.length,
                            })}
                          </Badge>
                        </InlineStack>
                        <BlockStack gap="150">
                          {g.res.checks.map((c) => (
                            <CheckRow key={`${g.key}-${c.id}`} check={c} />
                          ))}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            </Layout.Section>
          </Layout>
        ) : null}
          </BlockStack>
        ) : (
          <BlockStack gap="400">
            {noConns ? (
              <Banner
                tone="warning"
                title={t('optimize.noConnections')}
                action={{ content: t('optimize.goConnections'), url: `/${locale}/connections` }}
              />
            ) : (
              <>
                <Banner tone="info">{t('optimize.advancedHint')}</Banner>

                <Card>
                  <Select
                    label={t('optimize.selectSite')}
                    options={(conns ?? []).map((c) => ({
                      label: `${c.label} · ${c.provider} · ${c.locale}`,
                      value: c.id,
                    }))}
                    value={connId}
                    onChange={setConnId}
                  />
                </Card>

                {/* Khôi phục bài bị chuyển nháp do bug internal link trước đây */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingSm">
                      {t('optimize.republishTitle')}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('optimize.republishHint')}
                    </Text>
                    {repFound !== null ? (
                      <Banner tone={repFound > 0 ? 'warning' : 'success'}>
                        {repFound > 0 ? t('optimize.republishFound', { n: repFound }) : t('optimize.republishNone')}
                      </Banner>
                    ) : null}
                    <InlineStack gap="200">
                      <Button loading={repBusy === 'check'} disabled={!connId || repBusy !== null} onClick={checkRepublish}>
                        {repBusy === 'check' ? t('optimize.republishChecking') : t('optimize.republishCheck')}
                      </Button>
                      {repFound && repFound > 0 ? (
                        <Button variant="primary" loading={repBusy === 'apply'} disabled={repBusy !== null} onClick={applyRepublish}>
                          {repBusy === 'apply' ? t('optimize.republishApplying') : t('optimize.republishApply', { n: repFound })}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Gộp các mục "Bài viết liên quan" trùng lặp thành 1 */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingSm">
                      {t('optimize.mergeTitle')}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('optimize.mergeHint')}
                    </Text>
                    {mergeFound !== null ? (
                      <Banner tone={mergeFound > 0 ? 'warning' : 'success'}>
                        {mergeFound > 0 ? t('optimize.mergeFound', { n: mergeFound }) : t('optimize.mergeNone')}
                      </Banner>
                    ) : null}
                    <InlineStack gap="200">
                      <Button loading={mergeBusy === 'check'} disabled={!connId || mergeBusy !== null} onClick={checkMerge}>
                        {mergeBusy === 'check' ? t('optimize.mergeChecking') : t('optimize.mergeCheck')}
                      </Button>
                      {mergeFound && mergeFound > 0 ? (
                        <Button variant="primary" loading={mergeBusy === 'apply'} disabled={mergeBusy !== null} onClick={applyMerge}>
                          {mergeBusy === 'apply' ? t('optimize.mergeApplying') : t('optimize.mergeApply', { n: mergeFound })}
                        </Button>
                      ) : null}
                    </InlineStack>
                  </BlockStack>
                </Card>

              </>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}

// Sơ đồ mạng nhện: bài đặt trên vòng tròn, đường nối = internal link.
function LinkGraph({ graph }: { graph: GraphData }) {
  const t = useTranslations();
  const [hover, setHover] = useState<string | null>(null);
  const N = graph.nodes.length;
  const size = 640;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 70;
  const showLabel = N <= 48;

  const pos = new Map<string, { x: number; y: number; a: number }>();
  graph.nodes.forEach((n, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, N) - Math.PI / 2;
    pos.set(n.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a });
  });

  // Tập node nối trực tiếp với node đang hover (để làm nổi, làm mờ phần còn lại).
  const neighbors = new Set<string>();
  if (hover) {
    neighbors.add(hover);
    for (const e of graph.edges) {
      if (e.from === hover) neighbors.add(e.to);
      if (e.to === hover) neighbors.add(e.from);
    }
  }

  const hovered = hover ? graph.nodes.find((n) => n.id === hover) : null;
  const hp = hover ? pos.get(hover) : null;

  // Hộp tooltip: tính kích thước theo độ dài chữ, kẹp trong khung để không tràn.
  const title = hovered ? (hovered.title.length > 42 ? hovered.title.slice(0, 42) + '…' : hovered.title) : '';
  const meta = hovered ? t('optimize.graphTipLinks', { inn: hovered.inLinks, out: hovered.outLinks }) : '';
  const tipW = Math.min(320, Math.max(140, Math.max(title.length, meta.length) * 6.3 + 22));
  const tipH = 46;
  let tipX = hp ? hp.x - tipW / 2 : 0;
  tipX = Math.max(6, Math.min(size - tipW - 6, tipX));
  // Mặc định hiện phía trên node; nếu sát mép trên thì lật xuống dưới.
  const baseR = hovered ? 4 + Math.min(11, hovered.inLinks * 2) : 0;
  const above = hp ? hp.y - (baseR + 12) - tipH >= 6 : true;
  const tipY = hp ? (above ? hp.y - (baseR + 12) - tipH : hp.y + baseR + 12) : 0;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <style>{`@keyframes optTipIn{from{opacity:0}to{opacity:1}}`}</style>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Cạnh - cạnh nối node hover được tô đậm, còn lại làm mờ */}
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const active = hover != null && (e.from === hover || e.to === hover);
          const dim = hover != null && !active;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={active ? '#5b3ce0' : '#9bb0e8'}
              strokeWidth={active ? 2 : 1}
              opacity={dim ? 0.1 : active ? 0.9 : 0.5}
              style={{ transition: 'stroke 0.18s ease, stroke-width 0.18s ease, opacity 0.18s ease' }}
            />
          );
        })}

        {/* Nút */}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const deg = n.inLinks + n.outLinks;
          const r = 4 + Math.min(11, n.inLinks * 2);
          const isolated = deg === 0;
          const isH = hover === n.id;
          const conn = hover == null || neighbors.has(n.id);
          const fill = isolated ? '#c9c9c9' : isH ? '#4322c9' : '#5b3ce0';
          const labelRight = Math.cos(p.a) >= 0;
          const circle = (
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={fill}
              stroke="#fff"
              strokeWidth={isH ? 2 : 1}
              opacity={conn ? 1 : 0.25}
              style={{
                transform: isH ? 'scale(1.7)' : 'scale(1)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 0.18s ease, opacity 0.18s ease, fill 0.18s ease',
              }}
            />
          );
          const label = showLabel ? (
            <text
              x={p.x + (labelRight ? r + 4 : -(r + 4))}
              y={p.y + 3}
              fontSize={9}
              fill={isH ? '#1a1a1a' : '#444'}
              fontWeight={isH ? 600 : 400}
              textAnchor={labelRight ? 'start' : 'end'}
              opacity={conn ? 1 : 0.3}
              style={{ transition: 'opacity 0.18s ease' }}
            >
              {n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title}
            </text>
          ) : null;
          const inner = n.url ? (
            <a href={n.url} target="_blank" rel="noreferrer">
              {circle}
              {label}
            </a>
          ) : (
            <>
              {circle}
              {label}
            </>
          );
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onFocus={() => setHover(n.id)}
              style={{ cursor: n.url ? 'pointer' : 'default' }}
            >
              {inner}
            </g>
          );
        })}

        {/* Tooltip tùy biến: tiêu đề + số internal link (fade mượt) */}
        {hovered && hp ? (
          <g style={{ animation: 'optTipIn 0.18s ease', pointerEvents: 'none' }}>
            <rect
              x={tipX}
              y={tipY}
              width={tipW}
              height={tipH}
              rx={8}
              fill="#1f1f24"
              opacity={0.96}
            />
            <text x={tipX + 11} y={tipY + 19} fontSize={11.5} fontWeight={600} fill="#fff">
              {title}
            </text>
            <text x={tipX + 11} y={tipY + 35} fontSize={10.5} fill="#c9c9d4">
              {meta}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function CheckRow({ check }: { check: ScoreCheck }) {
  const icon = check.state === 'pass' ? CheckIcon : check.state === 'warn' ? AlertIcon : XIcon;
  const tone = check.state === 'pass' ? 'success' : check.state === 'warn' ? 'caution' : 'critical';
  return (
    <InlineStack gap="200" blockAlign="start" wrap={false}>
      <div style={{ width: 18, flex: 'none' }}>
        <Icon source={icon} tone={tone} />
      </div>
      <Text as="span" variant="bodySm">
        {check.label}
        {check.detail ? <span style={{ color: '#8a8a8a' }}> - {check.detail}</span> : null}
      </Text>
    </InlineStack>
  );
}
