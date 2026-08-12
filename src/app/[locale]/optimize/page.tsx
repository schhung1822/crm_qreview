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
import { createPortal } from 'react-dom';
import { AlertIcon, CheckIcon, MagicIcon, XIcon } from '@/components/icons';
import { GraphView } from '@/components/ForceGraph';
import { HelpLabel } from '@/components/InfoHint';
import { AiWorking, ExtLink, ScoreRing } from '@/components/ui';
import { titleTokens } from '@/lib/content/tokens';
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

interface Analysis {
  post: {
    id: string;
    title: string;
    slug: string;
    metaDescription: string;
    markdown: string;
    url?: string; // URL công khai của bài (mở tab mới để xem trực tiếp)
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

  // Chọn nhiều bài + xuất lên Google Drive.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drive, setDrive] = useState<{ configured: boolean; connected: boolean }>({ configured: false, connected: false });
  const [exportFmt, setExportFmt] = useState<'doc' | 'txt'>('doc');
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const cancelExport = useRef(false);
  const exportAbort = useRef<AbortController | null>(null);
  const [exportRes, setExportRes] = useState<{
    okCount: number;
    count: number;
    folder: string;
    folderUrl: string;
    results: Array<{ postId: string; title: string; ok: boolean; webViewLink?: string; error?: string }>;
  } | null>(null);

  // Chế độ xem + sơ đồ liên kết.
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphBusy, setGraphBusy] = useState(false);
  const [selectedSugg, setSelectedSugg] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0); // % tiến độ áp dụng internal link

  // Chọn AI + model để chạy gợi ý internal link theo nội dung.
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [suggBusy, setSuggBusy] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const analyzeSeq = useRef(0); // chống race: chỉ nhận kết quả của lần phân tích MỚI NHẤT
  const [opening, setOpening] = useState(false);
  // Slide panel chi tiết bài (mở khi bấm node trên biểu đồ).
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelData, setPanelData] = useState<Analysis | null>(null);
  const [panelErr, setPanelErr] = useState<string | null>(null);
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
        const ids = new Set(d.connections.map((c) => c.id));
        // Kết nối khôi phục từ lần trước ĐÃ BỊ XÓA (vd xóa rồi thêm mới) → bỏ danh sách bài cũ
        // + chọn kết nối còn tồn tại, tránh quét trúng id không còn → "Không tìm thấy kết nối".
        if (restoredConn.current && !ids.has(restoredConn.current)) {
          restoredConn.current = '';
          setPosts(null);
          try {
            sessionStorage.removeItem('opt_scan');
          } catch {
            /* bỏ qua */
          }
          setConnId(d.connections[0]?.id ?? '');
        } else if (!restoredConn.current && d.connections[0]) {
          setConnId(d.connections[0].id);
        }
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
    // Trạng thái Google Drive (để bật/tắt nút xuất).
    fetch('/api/drive/status')
      .then((r) => r.json())
      .then((d) => setDrive({ configured: !!d.configured, connected: !!d.connected }))
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
    setSelected(new Set());
    setExportRes(null);
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
    // Tính năng theo gói: gói của biz không bật "gợi ý internal link" → báo không có quyền.
    setApplying(true);
    setApplyProgress(0);
    setError(null);
    setOkMsg(null);
    try {
      let added = 0;
      let failed = 0;
      // Áp TỪNG BÀI một để hiện tiến độ (mỗi bài = 1 lần ghi lên CMS).
      for (let i = 0; i < edits.length; i++) {
        try {
          const res = await fetch('/api/optimize/interlink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: connId, confirm: true, edits: [edits[i]] }),
          });
          const d = await res.json();
          if (res.ok && d.ok) added += d.totalAdded ?? 0;
          else failed += 1;
        } catch {
          failed += 1;
        }
        setApplyProgress(Math.round(((i + 1) / edits.length) * 100));
      }
      setSelectedSugg(new Set());
      setAnalysis(null);
      await loadGraph();
      if (failed > 0) setError(t('optimize.interlinkPartial', { done: added, failed }));
      else setOkMsg(t('optimize.interlinkDone', { n: added }));
    } finally {
      setApplying(false);
      setApplyProgress(0);
    }
  }

  async function analyze(postId: string, conn: string = connId) {
    const seq = ++analyzeSeq.current; // đánh dấu lần phân tích này
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
      if (seq !== analyzeSeq.current) return; // đã có lần phân tích mới hơn → bỏ kết quả cũ (chống ghi đè)
      if (res.ok && d.post) setAnalysis(d);
      else setError(d.error ?? 'Lỗi phân tích');
    } finally {
      if (seq === analyzeSeq.current) setAnalyzing(false);
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

  // Mở 1 bài (đã phân tích) trong trình soạn thảo để "Sửa bằng AI" — dùng cho cả nút dưới lẫn slide panel.
  async function openInEditor(a: Analysis) {
    setOpening(true);
    try {
      const res = await fetch('/api/articles/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: a.post.title,
          slug: a.post.slug,
          metaDescription: a.post.metaDescription,
          markdown: a.post.markdown,
          locale: a.post.locale,
          targetKeyword: a.post.targetKeyword,
          tags: a.post.tags,
          categories: a.post.categories,
          connectionId: connId,
          cmsPostId: a.post.id,
          publishedUrl: a.post.url, // để editor hiện link "Xem bài trên web"
          source: 'edited', // bài cũ nhập về để sửa/tối ưu
          seoScore: a.seo.score,
          aeoScore: a.aeo.score,
          geoScore: a.geo.score,
        }),
      });
      const d = await res.json();
      if (res.ok && d.article) {
        // Gửi kèm internal link gợi ý để editor dùng khi "Tối ưu bằng AI".
        try {
          const links = relatedLinksFor(a.post.id);
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
  const editThis = () => (analysis ? openInEditor(analysis) : undefined);

  // ── Slide panel bên phải: bấm node trên biểu đồ → phân tích bài → hiện chi tiết SEO/AEO/GEO. ──
  async function openGraphPanel(postId: string) {
    setPanelOpen(true);
    setPanelBusy(true);
    setPanelData(null);
    setPanelErr(null);
    try {
      const res = await fetch('/api/optimize/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, postId }),
      });
      const d = await res.json();
      if (res.ok && d.post) setPanelData(d);
      else setPanelErr(d.error ?? t('optimize.panelError'));
    } catch {
      setPanelErr(t('optimize.panelError'));
    } finally {
      setPanelBusy(false);
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

  // ── Chọn bài (1 / nhiều / tất cả) để xuất Drive ──
  const allVisibleSelected = visiblePosts.length > 0 && visiblePosts.every((p) => selected.has(p.id));
  const someVisibleSelected = visiblePosts.some((p) => selected.has(p.id));
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAllVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visiblePosts.forEach((p) => n.delete(p.id));
      else visiblePosts.forEach((p) => n.add(p.id));
      return n;
    });
  }

  function stopExport() {
    cancelExport.current = true;
    exportAbort.current?.abort();
  }

  // Xuất cả lô trong 1 request; server STREAM tiến trình từng bài (NDJSON). Dừng = abort fetch.
  async function exportToDrive() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setExporting(true);
    setError(null);
    setExportRes(null);
    cancelExport.current = false;
    setExportTotal(ids.length);
    setExportDone(0);

    type Row = { postId: string; title: string; ok: boolean; webViewLink?: string; error?: string };
    const results: Row[] = [];
    let folder = 'SEO-AEO-GEO-by-noti';
    let folderUrl = '';
    const ac = new AbortController();
    exportAbort.current = ac;

    try {
      const res = await fetch('/api/optimize/export-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, postIds: ids, format: exportFmt }),
        signal: ac.signal,
      });
      // Lỗi tiền xử lý (needsConnect / rate-limit / tham số) trả JSON, không stream.
      if (!res.body || (res.headers.get('content-type') || '').includes('application/json')) {
        const d = await res.json().catch(() => ({}));
        if (d.needsConnect) {
          setDrive((s) => ({ ...s, connected: false }));
          setError(t('optimize.driveNeedConnect'));
        } else {
          setError(d.error ?? t('optimize.exportError'));
        }
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: {
            type: string;
            total?: number;
            folder?: string;
            folderUrl?: string;
            done?: number;
            result?: Row;
            error?: string;
          };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === 'meta') {
            if (msg.total != null) setExportTotal(msg.total);
            if (msg.folder) folder = msg.folder;
            if (msg.folderUrl) folderUrl = msg.folderUrl;
          } else if (msg.type === 'progress') {
            if (msg.result) results.push(msg.result);
            if (msg.done != null) setExportDone(msg.done);
            // Cập nhật kết quả trực tiếp để thấy danh sách lớn dần.
            setExportRes({
              okCount: results.filter((r) => r.ok).length,
              count: results.length,
              folder,
              folderUrl,
              results: [...results],
            });
          } else if (msg.type === 'error') {
            setError(msg.error ?? t('optimize.exportError'));
          }
        }
      }
    } catch {
      if (!ac.signal.aborted) setError(t('optimize.exportError'));
    } finally {
      exportAbort.current = null;
      const okCount = results.filter((r) => r.ok).length;
      if (results.length) setExportRes({ okCount, count: results.length, folder, folderUrl, results: [...results] });
      if (cancelExport.current) setOkMsg(t('optimize.exportStopped', { ok: okCount, total: ids.length }));
      else if (results.length) setOkMsg(t('optimize.exportDone', { ok: okCount, total: results.length, folder }));
      setExporting(false);
    }
  }

  const postRows = visiblePosts.map((p) => [
    <Checkbox
      key={`${p.id}-c`}
      label=""
      labelHidden
      checked={selected.has(p.id)}
      onChange={() => toggleOne(p.id)}
    />,
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
                action={{ content: t('optimize.goConnections'), url: `/${locale}/settings` }}
              />
            ) : (
          <Card>
            <BlockStack gap="300">
              <InlineGrid columns={{ xs: 1, md: '1fr 1fr' }} gap="300">
                <Select
                  label={<HelpLabel label={t('optimize.selectSite')} help={t('optimize.selectSiteHelp')} />}
                  options={(conns ?? []).map((c) => ({
                    label: `${c.label} · ${c.provider} · ${c.locale}`,
                    value: c.id,
                  }))}
                  value={connId}
                  onChange={setConnId}
                />
                <Select
                  label={<HelpLabel label={t('optimize.scanMode')} help={t('optimize.scanModeHelp')} />}
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
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                  <TextField type="date" label={<HelpLabel label={t('optimize.fromDate')} help={t('optimize.fromDateHelp')} />} value={fromDate} onChange={setFromDate} autoComplete="off" />
                  <TextField type="date" label={<HelpLabel label={t('optimize.toDate')} help={t('optimize.toDateHelp')} />} value={toDate} onChange={setToDate} autoComplete="off" />
                </InlineGrid>
              ) : null}
              {mode === 'keyword' ? (
                <TextField
                  label={<HelpLabel label={t('optimize.searchTitle')} help={t('optimize.searchTitleHelp')} />}
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
                <>
                  {/* Thanh xuất Drive: chọn N bài → xuất .doc/.txt lên Google Drive. */}
                  <Box padding="300" background="bg-surface-secondary" borderBlockEndWidth="025" borderColor="border">
                    <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                      <Text as="span" variant="bodySm" tone="subdued">
                        {t('optimize.selectedN', { n: selected.size })}
                      </Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Box minWidth="110px">
                          <Select
                            label={t('optimize.exportFormat')}
                            labelHidden
                            options={[
                              { label: '.doc', value: 'doc' },
                              { label: '.txt', value: 'txt' },
                            ]}
                            value={exportFmt}
                            onChange={(v) => setExportFmt(v as 'doc' | 'txt')}
                          />
                        </Box>
                        {drive.connected ? (
                          <Button
                            variant="primary"
                            loading={exporting}
                            disabled={selected.size === 0 || exporting}
                            onClick={exportToDrive}
                          >
                            {t('optimize.exportDrive', { n: selected.size })}
                          </Button>
                        ) : (
                          <Button url={`/${locale}/settings`}>{t('optimize.driveConnect')}</Button>
                        )}
                      </InlineStack>
                    </InlineStack>
                  </Box>

                  {exporting ? (
                    <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                      <BlockStack gap="200">
                        <AiWorking
                          text={t('optimize.exportProgress', { done: exportDone, total: exportTotal })}
                          progress={exportTotal ? Math.round((exportDone / exportTotal) * 100) : 0}
                        />
                        <InlineStack>
                          <Button tone="critical" onClick={stopExport}>
                            {t('optimize.exportStop')}
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  ) : null}

                  {exportRes ? (
                    <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                      <BlockStack gap="200">
                        <InlineStack gap="300" blockAlign="center" wrap>
                          <Text as="span" fontWeight="semibold">
                            {t('optimize.exportDone', { ok: exportRes.okCount, total: exportRes.count, folder: exportRes.folder })}
                          </Text>
                          {exportRes.folderUrl ? (
                            <ExtLink href={exportRes.folderUrl}>{t('optimize.exportViewFolder')}</ExtLink>
                          ) : null}
                        </InlineStack>
                        <Box>
                          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <BlockStack gap="050">
                              {exportRes.results.map((r) => (
                                <InlineStack key={r.postId} gap="150" blockAlign="center" wrap={false}>
                                  <div style={{ width: 18, flex: 'none' }}>
                                    <Icon source={r.ok ? CheckIcon : XIcon} tone={r.ok ? 'success' : 'critical'} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text as="span" variant="bodySm" truncate>
                                      {r.title}
                                    </Text>
                                  </div>
                                  {r.ok && r.webViewLink ? (
                                    <div style={{ flex: 'none' }}>
                                      <ExtLink href={r.webViewLink}>{t('optimize.exportView')}</ExtLink>
                                    </div>
                                  ) : null}
                                </InlineStack>
                              ))}
                            </BlockStack>
                          </div>
                        </Box>
                      </BlockStack>
                    </Box>
                  ) : null}

                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text']}
                    headings={[
                      <Checkbox
                        key="all"
                        label=""
                        labelHidden
                        checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                        onChange={toggleAllVisible}
                      />,
                      t('optimize.colPostTitle'),
                      t('optimize.colDate'),
                      '',
                    ]}
                    rows={postRows}
                  />
                </>
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
                    <GraphView graph={graph} onOpenNode={openGraphPanel} />
                  </BlockStack>
                )}
              </Box>
            )}
          </Card>
        ) : null}


        <div ref={analysisRef} />
        {analyzing ? <AiWorking text={t('optimize.analyzingAI')} progress="indeterminate" /> : null}

        {analysis ? (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">
                    {analysis.post.title}
                  </Text>
                  {analysis.post.url ? (
                    <ExtLink href={analysis.post.url}>{t('optimize.viewArticle')}</ExtLink>
                  ) : null}
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
                action={{ content: t('optimize.goConnections'), url: `/${locale}/settings` }}
              />
            ) : (
              <>
                <Banner tone="info">{t('optimize.advancedHint')}</Banner>

                <Card>
                  <Select
                    label={<HelpLabel label={t('optimize.selectSite')} help={t('optimize.selectSiteHelp')} />}
                    options={(conns ?? []).map((c) => ({
                      label: `${c.label} · ${c.provider} · ${c.locale}`,
                      value: c.id,
                    }))}
                    value={connId}
                    onChange={setConnId}
                  />
                </Card>

                {/* Gợi ý internal link — AI đọc nội dung bài, gợi ý bài liên quan để chèn */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingSm">
                      {t('optimize.suggTitle')}
                      {graph?.suggestBy === 'ai' ? ` (${graph.suggestions.length})` : ''}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {graph?.suggestBy === 'ai' ? t('optimize.suggByAi') : t('optimize.suggRunHint')}
                    </Text>

                    {/* Chọn AI + model rồi chạy gợi ý theo NỘI DUNG bài */}
                    <InlineGrid columns={{ xs: 1, sm: '1fr 1fr auto' }} gap="300" alignItems="end">
                      <Select
                        label={<HelpLabel label={t('optimize.suggAi')} help={t('optimize.suggAiHelp')} />}
                        options={[
                          { label: t('optimize.suggAiAuto'), value: '' },
                          ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                        ]}
                        value={aiProvider}
                        onChange={selectProvider}
                      />
                      <Select
                        label={<HelpLabel label={t('optimize.suggModel')} help={t('optimize.suggModelHelp')} />}
                        disabled={!aiProvider || modelsBusy}
                        options={[
                          { label: modelsBusy ? t('optimize.suggModelLoading') : t('optimize.suggModelDefault'), value: '' },
                          ...aiModels.map((m) => ({ label: m, value: m })),
                        ]}
                        value={aiModel}
                        onChange={setAiModel}
                      />
                      <Button
                        variant="primary"
                        icon={MagicIcon}
                        loading={suggBusy}
                        disabled={!connId || suggBusy}
                        onClick={runAiSuggest}
                      >
                        {suggBusy ? t('optimize.suggRunning') : t('optimize.suggRun')}
                      </Button>
                    </InlineGrid>
                    {graph?.aiError ? <Banner tone="warning">{graph.aiError}</Banner> : null}

                    <Banner tone="warning">{t('optimize.interlinkWarn')}</Banner>
                    {suggBusy ? <AiWorking text={t('optimize.suggRunning')} progress="indeterminate" /> : null}
                    {graph && graph.suggestBy === 'ai' && graph.suggestions.length > 0 ? (
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
                        {applying ? (
                          <AiWorking text={t('optimize.interlinkApplying')} progress={applyProgress} />
                        ) : null}
                        <BlockStack gap="100">
                          {graph.suggestions.slice(0, 100).map((s) => {
                            const key = `${s.from}|${s.to}`;
                            const from = graph.nodes.find((n) => n.id === s.from);
                            const to = graph.nodes.find((n) => n.id === s.to);
                            return (
                              <InlineStack key={key} gap="200" blockAlign="start" wrap>
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
                    ) : (
                      <Text as="p" tone="subdued">
                        {graph?.suggestBy === 'ai' ? t('optimize.suggNone') : t('optimize.suggRunHint')}
                      </Text>
                    )}
                  </BlockStack>
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

      {/* Slide panel bên phải: chi tiết bài khi bấm node trên biểu đồ. */}
      {panelOpen && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                onClick={() => setPanelOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 1000 }}
              />
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: 'min(460px, 94vw)',
                  background: '#fff',
                  zIndex: 1001,
                  boxShadow: '-8px 0 28px rgba(0,0,0,0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'optPanelIn 0.22s ease',
                }}
              >
                <style>{`@keyframes optPanelIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--p-color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text as="h2" variant="headingSm">
                      {t('optimize.panelTitle')}
                    </Text>
                  </div>
                  <Button
                    variant="tertiary"
                    icon={XIcon}
                    onClick={() => setPanelOpen(false)}
                    accessibilityLabel={t('optimize.panelClose')}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  {panelBusy ? (
                    <AiWorking text={t('optimize.analyzingAI')} progress="indeterminate" />
                  ) : panelErr ? (
                    <Banner tone="critical">{panelErr}</Banner>
                  ) : panelData ? (
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">
                        {panelData.post.title}
                      </Text>
                      {panelData.post.targetKeyword ? (
                        <Box>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {t('optimize.detectedKeyword')}:{' '}
                          </Text>
                          <Badge tone="info">{panelData.post.targetKeyword}</Badge>
                        </Box>
                      ) : null}

                      <InlineStack gap="500" blockAlign="center" align="center" wrap>
                        {(
                          [
                            { label: t('common.seo'), v: panelData.seo.score },
                            { label: t('common.aeo'), v: panelData.aeo.score },
                            { label: t('common.geo'), v: panelData.geo.score },
                          ] as const
                        ).map((s) => (
                          <BlockStack key={s.label} gap="100" inlineAlign="center">
                            <ScoreRing value={s.v} />
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {s.label}
                            </Text>
                          </BlockStack>
                        ))}
                      </InlineStack>

                      <InlineStack gap="200" wrap>
                        <Button variant="primary" icon={MagicIcon} loading={opening} onClick={() => openInEditor(panelData)}>
                          {t('optimize.panelEditAi')}
                        </Button>
                        {panelData.post.url ? (
                          <Button onClick={() => window.open(panelData.post.url, '_blank', 'noopener,noreferrer')}>
                            {t('optimize.viewArticle')}
                          </Button>
                        ) : null}
                      </InlineStack>

                      {(
                        [
                          { key: 'seo', label: t('common.seo'), res: panelData.seo },
                          { key: 'aeo', label: t('common.aeo'), res: panelData.aeo },
                          { key: 'geo', label: t('common.geo'), res: panelData.geo },
                        ] as const
                      ).map((g) => {
                        const fails = g.res.checks.filter((c) => c.state !== 'pass').length;
                        return (
                          <Card key={g.key}>
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="h4" variant="headingSm">
                                  {g.label}
                                </Text>
                                <Badge tone={fails === 0 ? 'success' : 'attention'}>
                                  {t('optimize.checksPassed', { ok: g.res.checks.length - fails, total: g.res.checks.length })}
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
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </Page>
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
