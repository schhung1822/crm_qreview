'use client';

import {
  ActionList,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DropZone,
  Icon,
  InlineGrid,
  InlineStack,
  Layout,
  Link,
  List,
  Modal,
  Page,
  Popover,
  Select,
  Tabs,
  Text,
  TextField,
  Tooltip,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ImageIcon,
  MagicIcon,
  NoteIcon,
  ReplaceIcon,
  SearchIcon,
  XIcon,
} from '@/components/icons';
import { ArticleComments } from '@/components/ArticleComments';
import { HelpLabel } from '@/components/InfoHint';
import { AiWorking, ExtLink, ScoreRing } from '@/components/ui';
import { buildExport, EXPORT_MIME, exportFileName } from '@/lib/export/article-file';
import { can, type Role } from '@/lib/auth/permissions';
import { coverImageHtml, markdownToHtml } from '@/lib/content/markdown';
import { fillMissingAltMarkdown } from '@/lib/content/alt';
import { diffWords } from '@/lib/content/diff';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput, type ScoreCheck } from '@/lib/scoring/types';

interface Change {
  field: string;
  note: string;
}

export default function EditorPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();

  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [publishedUrl, setPublishedUrl] = useState<string>(''); // URL bài đã đăng (bài cũ mở về sửa)
  // Điểm SEO/AEO/GEO NGAY TRƯỚC lần AI sửa gần nhất → so với điểm hiện tại để hiện mũi tên tăng/giảm.
  const [prevScores, setPrevScores] = useState<{ seo: number; aeo: number; geo: number } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null); // ảnh đang xem phóng to
  const [title, setTitle] = useState(params.get('title') ?? '');
  const [slug, setSlug] = useState('');
  const [meta, setMeta] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [keyword, setKeyword] = useState(params.get('keyword') ?? '');
  // Lưu Ô NHẬP thẻ dạng văn bản thô để gõ tự do (gõ được dấu phẩy/khoảng trắng).
  // Mảng thẻ chỉ tách ra khi lưu/đăng (tagList).
  const [tags, setTags] = useState('');
  const tagList = useMemo(
    () => tags.split(',').map((s) => s.trim()).filter(Boolean),
    [tags],
  );

  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<
    | 'write'
    | 'optimize'
    | 'save'
    | 'publish'
    | 'replace'
    | 'alt'
    | 'edit'
    | 'editAll'
    | 'factcheck'
    | 'humanize'
    | null
  >(null);
  // Kết quả kiểm chứng bài (link chết / số liệu thiếu nguồn / dấu hiệu giọng AI) + modal hiển thị.
  const [factOpen, setFactOpen] = useState(false);
  const [factResult, setFactResult] = useState<{
    links: Array<{ url: string; ok: boolean; status?: number; error?: string }>;
    deadLinks: number;
    claims: Array<{ claim: string; note: string }>;
    claimsError?: string;
    aiNess: { score: number; flags: Array<{ key: string; count?: number; sample?: string }>; sentences: number };
  } | null>(null);

  // Chat sửa bài (AI): yêu cầu tự nhiên + đề xuất chờ duyệt (diff xanh/đỏ).
  const [chatInput, setChatInput] = useState(''); // ô nhập trong POPUP (sửa đoạn bôi đen)
  const [reqInput, setReqInput] = useState(''); // ô nhập PANEL DƯỚI (sửa cả bài)
  // Nút AI nổi hiện tại vị trí con trỏ khi bôi đen (x,y theo viewport) — null = ẩn.
  const [selBtn, setSelBtn] = useState<{ x: number; y: number } | null>(null);
  // Đoạn đã chọn "chốt" lại khi mở popup (không đọc lại DOM để tránh mất vùng chọn).
  const [activeSel, setActiveSel] = useState<{ start: number; end: number; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Ghi chú (cộng tác): mở/đóng chi tiết, số lượng (hiện ở header Soạn thảo), trích dẫn khi bôi đen.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [commentQuote, setCommentQuote] = useState<{ text: string; nonce: number } | null>(null);
  // Đề xuất sửa CẢ BÀI (panel dưới): xem trước các trường đổi + diff nội dung, duyệt rồi mới áp.
  const [fullProposal, setFullProposal] = useState<{
    fields: Array<{ label: string; before: string; after: string }>; // các trường ngắn đã đổi
    mdBefore: string;
    mdAfter: string;
    mdChanged: boolean;
    result: {
      title: string;
      metaDescription: string;
      slug: string;
      markdown: string;
      tags: string[];
      targetKeyword: string;
    };
    note: string;
  } | null>(null);
  const [proposal, setProposal] = useState<{
    before: string; // đoạn cũ (selection hoặc cả bài) để hiển thị diff
    after: string; // đoạn AI đề xuất
    resultMarkdown: string; // markdown mới đầy đủ, set khi bấm Chấp nhận
    note: string; // AI tóm tắt đã sửa gì
    scope: 'selection' | 'all';
  } | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'warning' | 'critical';
    text: string;
    url?: string; // link kèm (vd "Xem trên Drive")
    urlLabel?: string;
  } | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);

  // Quy trình AI 2 bước: lập KHUNG (blueprint) rồi VIẾT. Mode auto / duyệt tay.
  // pipelineEnabled bật/tắt ở "Cài đặt bài viết".
  const [pipelineEnabled, setPipelineEnabled] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<'auto' | 'manual'>('manual');
  const [bpBusy, setBpBusy] = useState(false);
  const [blueprint, setBlueprint] = useState<{
    title: string;
    targetKeyword: string;
    secondaryKeywords: string; // phân tách dấu phẩy
    outline: string; // mỗi dòng 1 mục
    questions: string; // mỗi dòng 1 câu hỏi
    brief: string;
  } | null>(null);

  // Cách tạo bài (chỉ khi tạo mới): 0 = Nhập thông tin cơ bản, 1 = Tải file / link.
  const [genTab, setGenTab] = useState(0);

  // ── Viết từ NGUỒN có sẵn (file/URL) → phân tích → khung → viết ──
  const [srcTab, setSrcTab] = useState(0); // 0 = file, 1 = link, 2 = dán text
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [srcPaste, setSrcPaste] = useState(''); // văn bản dán trực tiếp (không cần trích xuất)
  const [basicReq, setBasicReq] = useState(''); // yêu cầu cho tab "Thông tin cơ bản" (chỉ dẫn viết)
  // genOpen: mở/thu gọn phần NHẬP LIỆU tạo bài. Sau khi AI tạo xong → thu gọn cho gọn gàng.
  const [genOpen, setGenOpen] = useState(true);
  const resultRef = useRef<HTMLDivElement>(null); // mốc cuộn tới KẾT QUẢ (nội dung bài) sau khi AI xong
  // Nút "Viết bằng AI" ở nhiều chỗ đều dùng busy='write' → writeAt cho biết BẤM Ở ĐÂU để hiện
  // animation ngay tại chỗ đó (thanh công cụ / tab cơ bản / tab nguồn / quy trình 2 bước).
  const [writeAt, setWriteAt] = useState<'toolbar' | 'basic' | 'source' | 'pipeline' | null>(null);
  const [srcRequirement, setSrcRequirement] = useState('');
  const [srcBusy, setSrcBusy] = useState(false);
  const [sourceText, setSourceText] = useState(''); // text đã trích (đưa vào research khi viết)
  const [sourceInfo, setSourceInfo] = useState<string | null>(null);

  // ── Chọn AI + model để viết/tối ưu (không fix cứng trong cài đặt) ──
  type ProviderStatus = {
    id: string;
    label: string;
    hasKey: boolean;
    enabled: boolean;
    keyHint?: string;
  };
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [aiProvider, setAiProvider] = useState(''); // '' = tự động
  const [aiModel, setAiModel] = useState(''); // '' = mặc định provider
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [canManageKeys, setCanManageKeys] = useState(false);
  // Xuất file (.txt/.doc) + đồng bộ Google Drive.
  const [exportOpen, setExportOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [drive, setDrive] = useState<{ configured: boolean; connected: boolean; email?: string }>({
    configured: false,
    connected: false,
  });
  const [showAddKey, setShowAddKey] = useState(false);
  const [keyProvider, setKeyProvider] = useState('anthropic');
  const [keyValue, setKeyValue] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);

  const refreshProviders = () =>
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: ProviderStatus[] }) => {
        setProviders(d.providers);
        setAiReady(d.providers.some((p) => p.hasKey && p.enabled));
      })
      .catch(() => setAiReady(false));

  useEffect(() => {
    void refreshProviders();
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { user?: { role?: Role } }) =>
        setCanManageKeys(can(d.user?.role, 'aikeys:manage')),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chọn AI mặc định cho trình soạn thảo theo thứ tự: (1) Định tuyến tác vụ "write"
  // người dùng đặt ở Cài đặt → (2) AI dùng lần trước (cache cục bộ).
  const prefRestored = useRef(false);
  useEffect(() => {
    if (prefRestored.current || providers.length === 0) return;
    prefRestored.current = true;
    const hasKey = (id?: string) => !!id && providers.some((p) => p.id === id && p.hasKey);
    void (async () => {
      try {
        const tr = await fetch('/api/task-routing').then((r) => r.json());
        const w = tr?.write as { provider?: string; model?: string } | undefined;
        if (hasKey(w?.provider)) {
          setAiProvider(w!.provider!);
          if (w!.model) setAiModel(w!.model);
          void loadModels(w!.provider!);
          return;
        }
      } catch {
        /* bỏ qua, dùng cache */
      }
      try {
        const raw = localStorage.getItem('seo_ai_pref');
        if (!raw) return;
        const pref = JSON.parse(raw) as { provider?: string; model?: string };
        if (hasKey(pref.provider)) {
          setAiProvider(pref.provider!);
          if (pref.model) setAiModel(pref.model);
          void loadModels(pref.provider!);
        }
      } catch {
        /* bỏ qua */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  // Lưu lựa chọn (sau khi đã khôi phục) để dùng cho lần sau. CHỈ lưu khi ĐÃ chọn AI (aiProvider
  // khác rỗng) → tránh race ghi đè pref cũ bằng {provider:''} trước khi bước khôi phục async xong.
  useEffect(() => {
    if (!prefRestored.current || !aiProvider) return;
    try {
      localStorage.setItem('seo_ai_pref', JSON.stringify({ provider: aiProvider, model: aiModel }));
    } catch {
      /* bỏ qua */
    }
  }, [aiProvider, aiModel]);

  // Tải danh sách model của provider (dùng key đã lưu).
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
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      const list = res.ok && Array.isArray(d.models) ? (d.models as string[]) : [];
      setAiModels(list);
      // Tự chọn model đầu để tránh dùng "model mặc định" có thể đã lỗi thời.
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

  async function saveKey() {
    if (!keyValue.trim()) return;
    setKeyBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setKey', provider: keyProvider, key: keyValue.trim() }),
      });
      if (res.status === 403) {
        setNotice({ tone: 'warning', text: t('editor.noPermKeys') });
        return;
      }
      if (!res.ok) {
        setNotice({ tone: 'critical', text: t('editor.keyError') });
        return;
      }
      setKeyValue('');
      setShowAddKey(false);
      await refreshProviders();
      selectProvider(keyProvider);
      setNotice({ tone: 'success', text: t('editor.keySaved') });
    } finally {
      setKeyBusy(false);
    }
  }

  const aiOverride = () => ({
    ...(aiProvider ? { provider: aiProvider } : {}),
    ...(aiProvider && aiModel ? { model: aiModel } : {}),
  });

  // Kiểm chứng bài: link sống/chết + số liệu thiếu nguồn + dấu hiệu giọng AI → mở modal.
  async function factCheck() {
    if (!markdown.trim()) return;
    setBusy('factcheck');
    setNotice(null);
    try {
      const res = await fetch('/api/articles/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, locale, ...aiOverride() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFactResult(data);
        setFactOpen(true);
      } else {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.factError') });
      }
    } finally {
      setBusy(null);
    }
  }

  // Nhân hóa: AI viết lại bài cho tự nhiên hơn (giữ nguyên ảnh/link/số liệu).
  async function humanize() {
    if (!markdown.trim()) return;
    // Tính năng theo gói: gói của biz không bật "nhân hóa" → báo không có quyền.
    setBusy('humanize');
    setNotice(null);
    try {
      const res = await fetch('/api/articles/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, locale, ...aiOverride() }),
      });
      const data = await res.json();
      if (data.ok && data.markdown) {
        setMarkdown(data.markdown);
        setNotice({ tone: 'success', text: t('editor.humanizeDone') });
      } else if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.usingMock') });
      } else {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
      }
    } finally {
      setBusy(null);
    }
  }

  // Bật/tắt quy trình 2 bước theo Cài đặt bài viết.
  useEffect(() => {
    fetch('/api/article-config')
      .then((r) => r.json())
      .then((d: { pipelineEnabled?: boolean }) => setPipelineEnabled(d.pipelineEnabled !== false))
      .catch(() => setPipelineEnabled(true));
  }, []);

  // Nhớ chế độ quy trình (auto/duyệt tay).
  useEffect(() => {
    try {
      const m = localStorage.getItem('seo_pipeline_mode');
      if (m === 'auto' || m === 'manual') setPipelineMode(m);
    } catch {
      /* bỏ qua */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('seo_pipeline_mode', pipelineMode);
    } catch {
      /* bỏ qua */
    }
  }, [pipelineMode]);

  // Nạp bản nháp đã lưu nếu mở từ ?draft=
  // Chỉ nạp bản nháp MỘT LẦN theo id (tránh ghi đè nội dung khi component re-render,
  // vd lúc tạo ảnh - trước đây effect chạy lại mỗi render do params đổi tham chiếu).
  const draftParam = params.get('draft');
  const loadedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draftParam || loadedDraftRef.current === draftParam) return;
    loadedDraftRef.current = draftParam;
    fetch(`/api/articles/draft?id=${draftParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.article) {
          const a = d.article;
          setDraftId(a.id);
          setTitle(a.title);
          setSlug(a.slug || '');
          setMeta(a.metaDescription || '');
          setMarkdown(a.markdown || '');
          setCoverImageUrl(a.coverImageUrl || '');
          setPublishedUrl(a.publishedUrl || '');
          setPrevScores(null); // bài vừa mở → chưa có delta
          if (a.coverImageUrl) setCoverGallery((g) => (g.includes(a.coverImageUrl) ? g : [a.coverImageUrl, ...g]));
          if (Array.isArray(a.tags)) setTags(a.tags.join(', '));
          if (a.targetKeyword) setKeyword(a.targetKeyword);
        }
      })
      .catch(() => {});
  }, [draftParam]);

  const input = useMemo(
    () => buildScoreInput({ title, metaDescription: meta, slug, markdown, locale, targetKeyword: keyword }),
    [title, meta, markdown, locale, keyword, slug],
  );

  const seo = useMemo(() => scoreSeo(input), [input]);
  const aeo = useMemo(() => scoreAeo(input), [input]);
  const geo = useMemo(() => scoreGeo(input), [input]);
  const previewHtml = useMemo(() => markdownToHtml(markdown), [markdown]);

  // Lightbox: đóng bằng Esc khi đang xem ảnh phóng to.
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);

  const [mdExpanded, setMdExpanded] = useState(false); // mở rộng khung soạn thảo (giãn hết, bỏ cuộn dọc)
  const [mdPreviewOpen, setMdPreviewOpen] = useState(false); // popup xem trước

  // Theo dõi vùng bôi đen trong ô Markdown để hiện NÚT AI NỔI cạnh con trỏ.
  // Đọc trực tiếp <textarea id="editor-markdown"> (Polaris không expose onSelect).
  useEffect(() => {
    const el = document.getElementById('editor-markdown') as HTMLTextAreaElement | null;
    if (!el) {
      setSelBtn(null);
      return;
    }
    const len = () => Math.max(0, el.selectionEnd - el.selectionStart);
    // Chọn bằng chuột → đặt nút tại điểm thả chuột.
    const onMouseUp = (e: MouseEvent) => {
      setSelBtn(len() > 0 ? { x: e.clientX, y: e.clientY } : null);
    };
    // Chọn bằng bàn phím (shift+mũi tên) → đặt nút ở góc trên-phải ô soạn.
    const onKeyUp = () => {
      if (len() > 0) {
        const r = el.getBoundingClientRect();
        setSelBtn({ x: r.right - 16, y: r.top + 16 });
      } else {
        setSelBtn(null);
      }
    };
    const onSelect = () => {
      if (len() === 0) setSelBtn(null); // thu gọn vùng chọn → ẩn nút
    };
    const hide = () => setSelBtn(null); // cuộn → ẩn để nút không lệch vị trí
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('select', onSelect);
    el.addEventListener('scroll', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    onSelect();
    return () => {
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('select', onSelect);
      el.removeEventListener('scroll', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ảnh AI - style lấy từ Cài đặt ảnh AI; ở đây chỉnh nhanh tỉ lệ + chọn AI/model ảnh.
  const [imgBusy, setImgBusy] = useState<'cover' | 'illustrate' | null>(null);
  const [imgNotice, setImgNotice] = useState<{ tone: 'success' | 'warning' | 'critical'; text: string } | null>(null);
  const [imgSize, setImgSize] = useState<'1024x1024' | '1536x1024' | '1024x1536' | ''>('');
  const [imgProvider, setImgProvider] = useState(''); // '' = theo Cài đặt ảnh AI
  const [imgModel, setImgModel] = useState('');
  const [imgModels, setImgModels] = useState<string[]>([]);
  const [imgModelsBusy, setImgModelsBusy] = useState(false);
  // Mô tả người dùng muốn ảnh trông thế nào (tùy chọn) — truyền vào prompt tạo ảnh.
  const [coverBrief, setCoverBrief] = useState('');
  const [illusBrief, setIllusBrief] = useState('');
  // Thư viện ảnh: tạo nhiều lần → tích chọn ảnh muốn dùng (bìa 1, minh họa nhiều).
  const [coverGallery, setCoverGallery] = useState<string[]>([]);
  const [illusGallery, setIllusGallery] = useState<Array<{ alt: string; url: string }>>([]);
  const [selectedIllus, setSelectedIllus] = useState<Set<string>>(new Set());

  // Provider tạo ảnh đang có key (chỉ OpenAI/Gemini).
  const imageProviders = providers.filter((p) => p.hasKey && (p.id === 'openai' || p.id === 'gemini'));

  async function loadImageModels(provider: string) {
    if (!provider) {
      setImgModels([]);
      return;
    }
    setImgModelsBusy(true);
    try {
      const res = await fetch('/api/ai-keys/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, kind: 'image' }),
      });
      const d = await res.json();
      setImgModels(res.ok && Array.isArray(d.models) ? d.models : []);
    } catch {
      setImgModels([]);
    } finally {
      setImgModelsBusy(false);
    }
  }

  function selectImgProvider(v: string) {
    setImgProvider(v);
    setImgModel('');
    void loadImageModels(v);
  }

  const imgOverride = () => ({
    ...(imgProvider ? { imageProvider: imgProvider } : {}),
    ...(imgProvider && imgModel ? { imageModel: imgModel } : {}),
  });

  async function genCover() {
    setImgBusy('cover');
    setImgNotice(null);
    try {
      const res = await fetch('/api/images/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || keyword || 'bài viết',
          summary: meta || keyword,
          content: plainExcerpt(markdown),
          ...(coverBrief.trim() ? { brief: coverBrief.trim() } : {}),
          ...(imgSize ? { size: imgSize } : {}),
          ...imgOverride(),
        }),
      });
      const d = await res.json();
      if (d.needsImageKey) setImgNotice({ tone: 'warning', text: t('editor.needsImageKey') });
      else if (d.ok && d.url) {
        // Không đè: thêm vào thư viện và tự chọn ảnh mới nhất làm ảnh bìa.
        setCoverGallery((g) => [d.url, ...g]);
        setCoverImageUrl(d.url);
        setImgNotice({ tone: 'success', text: t('editor.coverDone') });
      } else setImgNotice({ tone: 'critical', text: d.error ?? t('editor.imgError') });
    } finally {
      setImgBusy(null);
    }
  }

  async function genIllustrations() {
    setImgBusy('illustrate');
    setImgNotice(null);
    try {
      const res = await fetch('/api/images/illustrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          ...(illusBrief.trim() ? { brief: illusBrief.trim() } : {}),
          ...imgOverride(),
        }),
      });
      const d = await res.json();
      if (d.needsImageKey) setImgNotice({ tone: 'warning', text: t('editor.needsImageKey') });
      else if (d.ok) {
        // Thêm ảnh vào thư viện (không tự chèn) để người dùng tích chọn.
        const imgs = (d.images ?? []) as Array<{ alt: string; url: string }>;
        setIllusGallery((g) => [...imgs, ...g]);
        setImgNotice({
          tone: imgs.length ? 'success' : 'warning',
          text: imgs.length ? t('editor.illustrateReady', { n: imgs.length }) : t('editor.noPlaceholder'),
        });
      } else setImgNotice({ tone: 'critical', text: d.error ?? t('editor.imgError') });
    } finally {
      setImgBusy(null);
    }
  }

  // Chèn các ảnh minh họa đã tích vào bài: thay placeholder của đúng mục (theo alt).
  function applyIllustrations() {
    let md = markdown;
    let n = 0;
    for (const item of illusGallery) {
      if (!selectedIllus.has(item.url)) continue;
      const ph = new RegExp(
        `!\\[${item.alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\((?!https?:\\/\\/|\\/generated\\/)[^)]*\\)`,
      );
      if (ph.test(md)) {
        md = md.replace(ph, `![${item.alt}](${item.url})`);
        n++;
      } else {
        // Không còn placeholder cho mục này → chèn vào cuối bài.
        md += `\n\n![${item.alt}](${item.url})\n`;
        n++;
      }
    }
    if (n) {
      setMarkdown(md);
      setImgNotice({ tone: 'success', text: t('editor.illustrateInserted', { n }) });
    }
  }

  function toggleIllus(url: string) {
    setSelectedIllus((s) => {
      const ns = new Set(s);
      if (ns.has(url)) ns.delete(url);
      else ns.add(url);
      return ns;
    });
  }

  // Mọi tiêu chí CHƯA đạt (fail + warn) → để tối ưu hoàn thiện hết checklist.
  const weakPoints = [...seo.checks, ...aeo.checks, ...geo.checks]
    .filter((c) => c.state !== 'pass')
    .map((c) => c.label);

  // ─── Quy trình AI 2 bước ───
  type BpApi = {
    title: string;
    targetKeyword: string;
    secondaryKeywords: string[];
    outline: string[];
    questions: string[];
    brief: string;
  };

  // Bước 1: AI lập KHUNG (blueprint). Trả về khung (mảng) hoặc null.
  async function fetchBlueprint(): Promise<BpApi | null> {
    const topic = (title || keyword).trim();
    if (!topic) {
      setNotice({ tone: 'warning', text: t('editor.bpNeedTopic') });
      return null;
    }
    setBpBusy(true);
    setNotice(null);
    setSourceText(''); // lập khung từ chủ đề → không phải nguồn file/URL
    try {
      const res = await fetch('/api/articles/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, targetKeyword: keyword || undefined, locale }),
      });
      const data = await res.json();
      if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.noKeyBody') });
        return null;
      }
      if (!data.ok || !data.blueprint) {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return null;
      }
      const bp = data.blueprint as BpApi;
      setBlueprint({
        title: bp.title || topic,
        targetKeyword: bp.targetKeyword || keyword,
        secondaryKeywords: (bp.secondaryKeywords ?? []).join(', '),
        outline: (bp.outline ?? []).join('\n'),
        questions: (bp.questions ?? []).join('\n'),
        brief: bp.brief ?? '',
      });
      return bp;
    } finally {
      setBpBusy(false);
    }
  }

  // Bước 2: AI VIẾT bài từ khung (bp). Điền kết quả vào trình soạn thảo.
  // Sau khi AI tạo/sửa xong: cuộn xuống phần KẾT QUẢ (nội dung bài) cho user thấy ngay.
  const scrollToResult = () =>
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

  async function writeWith(
    bp: BpApi,
    sourceOverride?: string,
    where: 'source' | 'pipeline' = 'pipeline',
  ) {
    setBusy('write');
    setWriteAt(where);
    setChanges([]);
    setNotice(null);
    try {
      // sourceOverride (text dán) truyền thẳng để tránh đọc state sourceText chưa cập nhật.
      const src = (sourceOverride ?? sourceText).trim();
      const research = [
        bp.brief,
        bp.questions?.length ? `${t('editor.bpQuestions')}:\n- ${bp.questions.join('\n- ')}` : '',
        // Bám sát nội dung NGUỒN (file/URL/dán) nếu có - cây viết dùng làm dữ liệu nền.
        src ? `${t('editor.srcContextLabel')}:\n${src.slice(0, 6000)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bp.title || title || keyword,
          targetKeyword: bp.targetKeyword || keyword || bp.title,
          secondaryKeywords: bp.secondaryKeywords,
          outline: bp.outline,
          research,
          locale,
          ...aiOverride(),
        }),
      });
      const data = await res.json();
      if (data.aiError) {
        setNotice({ tone: 'critical', text: data.aiError });
      } else if (data.article) {
        setTitle(data.article.title);
        setMeta(data.article.metaDescription);
        setMarkdown(data.article.markdown);
        if (data.article.slug) setSlug(data.article.slug);
        if (Array.isArray(data.article.tags)) setTags(data.article.tags.join(', '));
        if (data.targetKeyword) setKeyword(data.targetKeyword);
        setNotice(
          data.needsKey
            ? { tone: 'warning', text: t('editor.usingMock') }
            : { tone: 'success', text: t('editor.bpWritten') },
        );
        setGenOpen(false);
        scrollToResult();
      }
    } finally {
      setBusy(null);
      setWriteAt(null);
    }
  }

  // Duyệt tay: viết từ khung đã (chỉnh sửa) trên giao diện.
  async function writeFromBlueprint() {
    if (!blueprint) return;
    await writeWith({
      title: blueprint.title.trim(),
      targetKeyword: blueprint.targetKeyword.trim(),
      secondaryKeywords: blueprint.secondaryKeywords.split(',').map((s) => s.trim()).filter(Boolean),
      outline: blueprint.outline.split('\n').map((s) => s.trim()).filter(Boolean),
      questions: blueprint.questions.split('\n').map((s) => s.trim()).filter(Boolean),
      brief: blueprint.brief.trim(),
    });
  }

  // Viết THẲNG bằng AI từ nguồn (dán text / file / link) — BỎ bước phân tích & lập khung.
  // AI dựa nội dung nguồn viết bài hoàn chỉnh, tự chuẩn hóa SEO/AEO/GEO (generateArticle có rubric).
  // Yêu cầu bổ sung = CHỈ DẪN cách viết (brief), KHÔNG phải chủ đề.
  async function writeFromSource() {
    let text = '';
    let srcTitle2 = '';
    if (srcTab === 2) {
      text = srcPaste.trim();
      if (!text) {
        setNotice({ tone: 'warning', text: t('editor.srcNeedPaste') });
        return;
      }
    } else {
      // Trích văn bản từ file / URL trước khi viết.
      setSrcBusy(true);
      setNotice(null);
      setSourceInfo(null);
      try {
        let exRes: Response;
        if (srcTab === 0) {
          if (!srcFile) {
            setNotice({ tone: 'warning', text: t('editor.srcNeedFile') });
            return;
          }
          const form = new FormData();
          form.append('file', srcFile);
          exRes = await fetch('/api/articles/extract', { method: 'POST', body: form });
        } else {
          if (!srcUrl.trim()) {
            setNotice({ tone: 'warning', text: t('editor.srcNeedUrl') });
            return;
          }
          exRes = await fetch('/api/articles/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: srcUrl.trim() }),
          });
        }
        const ex = (await exRes.json()) as {
          text?: string;
          title?: string;
          chars?: number;
          error?: string;
        };
        if (!exRes.ok || !ex.text) {
          setNotice({ tone: 'critical', text: ex.error ?? t('editor.aiError') });
          return;
        }
        text = ex.text;
        srcTitle2 = ex.title ?? '';
        setSourceInfo(t('editor.srcExtracted', { n: ex.chars ?? ex.text.length }));
      } finally {
        setSrcBusy(false);
      }
    }
    // CHỦ ĐỀ lấy từ nội dung nguồn (tiêu đề bài > tiêu đề trích được > dòng đầu > từ khóa).
    const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    const topic = (title.trim() || srcTitle2.trim() || firstLine || keyword.trim() || 'bài viết').slice(0, 300);
    await writeWith(
      {
        title: topic,
        targetKeyword: keyword.trim() || '',
        secondaryKeywords: [],
        outline: [],
        questions: [],
        brief: srcRequirement.trim() ? `${t('editor.srcRequirement')}: ${srcRequirement.trim()}` : '',
      },
      text,
      'source',
    );
  }

  // Tự động: lập khung rồi viết luôn, không cần duyệt.
  async function runAuto() {
    const bp = await fetchBlueprint();
    if (bp) await writeWith(bp);
  }

  async function aiWrite(where: 'toolbar' | 'basic' = 'toolbar') {
    setBusy('write');
    setWriteAt(where);
    setPrevScores(null); // viết mới → không so với điểm cũ (không có "trước")
    setChanges([]);
    setNotice(null);
    try {
      const req = basicReq.trim();
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          targetKeyword: keyword,
          locale,
          // Yêu cầu (nếu có) → gửi NGUYÊN VĂN làm brief cho AI (không thêm nhãn để khỏi lẫn vào tiêu đề).
          ...(req ? { research: req } : {}),
          ...aiOverride(),
        }),
      });
      const data = await res.json();
      if (data.aiError) {
        setNotice({ tone: 'critical', text: data.aiError });
      } else if (data.article) {
        setTitle(data.article.title);
        setMeta(data.article.metaDescription);
        setMarkdown(data.article.markdown);
        if (data.article.slug) setSlug(data.article.slug);
        if (Array.isArray(data.article.tags)) setTags(data.article.tags.join(', '));
        // Target keyword bám nội dung (server chọn cụm cho điểm cao nhất).
        if (data.targetKeyword) setKeyword(data.targetKeyword);
        setNotice(data.needsKey ? { tone: 'warning', text: t('editor.usingMock') } : null);
        setGenOpen(false);
        scrollToResult();
      } else {
        // Lỗi validate/khác từ server → hiện rõ, KHÔNG im lặng (trước đây bấm mà không thấy gì).
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
      }
    } finally {
      setBusy(null);
      setWriteAt(null);
    }
  }

  async function aiOptimize() {
    setBusy('optimize');
    setPrevScores({ seo: seo.score, aeo: aeo.score, geo: geo.score });
    setChanges([]);
    setNotice(null);
    try {
      // Internal link gợi ý (bài cũ liên quan) lưu từ trang Tối ưu bài cũ.
      let internalLinks: Array<{ anchor: string; url: string }> = [];
      try {
        const raw = draftParam ? sessionStorage.getItem(`opt_interlinks_${draftParam}`) : null;
        if (raw) internalLinks = JSON.parse(raw);
      } catch {
        internalLinks = [];
      }
      const res = await fetch('/api/articles/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          markdown,
          metaDescription: meta,
          targetKeyword: keyword,
          locale,
          weakPoints,
          ...(internalLinks.length ? { internalLinks } : {}),
          ...aiOverride(),
        }),
      });
      const data = await res.json();
      if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.noKeyBody') });
        return;
      }
      if (!data.ok || !data.result) {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return;
      }
      setTitle(data.result.title);
      setMeta(data.result.metaDescription);
      setMarkdown(data.result.markdown);
      // Chỉ điền slug khi đang trống — tối ưu bài đã có slug thì GIỮ URL cũ (đổi slug = đổi URL, hại SEO).
      if (data.result.slug && !slug) setSlug(data.result.slug);
      if (Array.isArray(data.result.tags) && data.result.tags.length) setTags(data.result.tags.join(', '));
      // Target keyword bám nội dung mới sau tối ưu (server chọn cụm cho điểm cao nhất).
      if (data.targetKeyword) setKeyword(data.targetKeyword);
      setChanges(data.result.changes ?? []);
      setNotice({
        tone: 'success',
        text: t('editor.optimizedDelta', {
          sb: data.before.seo,
          sa: data.after.seo,
          ab: data.before.aeo,
          aa: data.after.aeo,
          gb: data.before.geo,
          ga: data.after.geo,
        }),
      });
      scrollToResult();
    } finally {
      setBusy(null);
    }
  }

  // Áp QUY TẮC THAY THẾ (Cài đặt bài viết → Quy tắc thay thế) lên nội dung đang soạn để đồng
  // bộ ký tự/keyword — không dùng AI, không tốn token. Chạy được cả khi chưa có API key.
  async function applyRules() {
    setBusy('replace');
    setNotice(null);
    try {
      const res = await fetch('/api/articles/apply-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, metaDescription: meta, markdown, tags: tagList }),
      });
      const data = await res.json();
      if (!data.ok || !data.result) {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return;
      }
      setTitle(data.result.title ?? title);
      setMeta(data.result.metaDescription ?? meta);
      setMarkdown(data.result.markdown ?? markdown);
      if (Array.isArray(data.result.tags)) setTags(data.result.tags.join(', '));
      const n = typeof data.count === 'number' ? data.count : 0;
      setNotice(
        n > 0
          ? { tone: 'success', text: t('editor.rulesApplied', { n }) }
          : { tone: 'info', text: t('editor.rulesNone') },
      );
    } finally {
      setBusy(null);
    }
  }

  // Tự điền alt (văn bản thay thế) cho ảnh còn thiếu — thuần logic, không AI, không tốn token.
  async function fillAlt() {
    // Tính năng theo gói: gói của biz không bật "điền alt ảnh" → báo không có quyền.
    setBusy('alt');
    setNotice(null);
    try {
      const { markdown: fixed, fixed: n } = fillMissingAltMarkdown(markdown, {
        title,
        keyword,
      });
      if (n > 0) {
        setMarkdown(fixed);
        setNotice({ tone: 'success', text: t('editor.altFilled', { n }) });
      } else {
        setNotice({ tone: 'info', text: t('editor.altNone') });
      }
    } finally {
      setBusy(null);
    }
  }

  // ─── Chat sửa bài (AI) ───
  // Chốt đoạn đang bôi đen rồi mở popup sửa (khỏi kéo xuống panel dưới).
  function openSelEditor() {
    const el = document.getElementById('editor-markdown') as HTMLTextAreaElement | null;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end <= start) return;
    setActiveSel({ start, end, text: markdown.slice(start, end) });
    setChatInput('');
    setProposal(null);
    setModalOpen(true);
    setSelBtn(null);
  }

  // Bôi đen để GHI CHÚ: chốt đoạn đang chọn → mở khu ghi chú, điền sẵn trích dẫn đoạn đó.
  function openSelComment() {
    const el = document.getElementById('editor-markdown') as HTMLTextAreaElement | null;
    const text =
      el && el.selectionEnd > el.selectionStart
        ? markdown.slice(el.selectionStart, el.selectionEnd)
        : '';
    setCommentQuote({ text, nonce: Date.now() });
    setCommentsOpen(true);
    setSelBtn(null);
  }

  // Gửi yêu cầu sửa. `sel` truyền vào (từ popup) sẽ được ưu tiên; nếu không, đọc vùng chọn từ
  // ô soạn (panel dưới). Có vùng chọn → chỉ sửa đoạn đó; không → sửa cả bài.
  async function sendEdit(instruction: string, sel?: { start: number; end: number; text: string }) {
    const instr = instruction.trim();
    if (!instr || busy) return;
    let start = 0;
    let end = 0;
    let selectionText: string | undefined;
    if (sel) {
      start = sel.start;
      end = sel.end;
      selectionText = sel.text || undefined;
    } else {
      const el = document.getElementById('editor-markdown') as HTMLTextAreaElement | null;
      start = el ? el.selectionStart : 0;
      end = el ? el.selectionEnd : 0;
      selectionText = end > start ? markdown.slice(start, end) : undefined;
    }
    const hasSel = end > start && !!selectionText;

    setBusy('edit');
    setPrevScores({ seo: seo.score, aeo: aeo.score, geo: geo.score });
    setNotice(null);
    try {
      const res = await fetch('/api/articles/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instr,
          ...(selectionText ? { selection: selectionText } : {}),
          markdown,
          title,
          targetKeyword: keyword,
          locale,
          ...aiOverride(),
        }),
      });
      const data = await res.json();
      if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.noKeyBody') });
        return;
      }
      if (!data.ok || typeof data.text !== 'string') {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return;
      }
      const after: string = data.text;
      const before = hasSel ? (selectionText as string) : markdown;
      const resultMarkdown = hasSel ? markdown.slice(0, start) + after + markdown.slice(end) : after;
      if (resultMarkdown === markdown) {
        setNotice({ tone: 'info', text: t('editor.chatNoChange') });
        return;
      }
      setProposal({ before, after, resultMarkdown, note: data.note ?? '', scope: hasSel ? 'selection' : 'all' });
      setChatInput('');
    } finally {
      setBusy(null);
    }
  }

  function acceptEdit() {
    if (!proposal) return;
    setMarkdown(proposal.resultMarkdown);
    setProposal(null);
    setModalOpen(false);
    setActiveSel(null);
    setNotice({ tone: 'success', text: t('editor.chatApplied') });
    scrollToResult();
  }

  function rejectEdit() {
    setProposal(null);
    setModalOpen(false);
    setActiveSel(null);
    setNotice({ tone: 'info', text: t('editor.chatDiscarded') });
  }

  // Panel "Nhập yêu cầu chỉnh sửa": AI sửa TOÀN BỘ bài theo yêu cầu và cập nhật MỌI trường
  // (tiêu đề, từ khóa, slug, meta, thẻ, nội dung). Áp trực tiếp + báo tóm tắt.
  async function sendFullEdit(instruction: string) {
    const instr = instruction.trim();
    if (!instr || busy) return;
    setBusy('editAll');
    setPrevScores({ seo: seo.score, aeo: aeo.score, geo: geo.score });
    setNotice(null);
    try {
      const res = await fetch('/api/articles/edit-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instr,
          title,
          metaDescription: meta,
          slug,
          markdown,
          tags: tagList,
          targetKeyword: keyword,
          locale,
          ...aiOverride(),
        }),
      });
      const data = await res.json();
      if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.noKeyBody') });
        return;
      }
      if (!data.ok || !data.result) {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return;
      }
      const r = data.result;
      const norm = (s?: unknown) => (typeof s === 'string' ? s : '');
      const newTags = Array.isArray(r.tags) ? r.tags : tagList;
      const newTagsStr = newTags.join(', ');
      // Chỉ liệt kê trường THỰC SỰ đổi để người dùng xem trước.
      const fields: Array<{ label: string; before: string; after: string }> = [];
      const add = (label: string, before: string, after: string) => {
        if (before !== after) fields.push({ label, before, after });
      };
      add(t('publish.fieldTitle'), title, norm(r.title));
      add(t('editor.targetKeyword'), keyword, norm(r.targetKeyword));
      add(t('publish.slug'), slug, norm(r.slug));
      add(t('publish.metaDescription'), meta, norm(r.metaDescription));
      add(t('publish.tags'), tags, newTagsStr);
      const mdAfter = norm(r.markdown) || markdown;
      const mdChanged = mdAfter !== markdown;
      if (!fields.length && !mdChanged) {
        setNotice({ tone: 'info', text: t('editor.chatNoChange') });
        return;
      }
      setFullProposal({
        fields,
        mdBefore: markdown,
        mdAfter,
        mdChanged,
        result: {
          title: norm(r.title),
          metaDescription: norm(r.metaDescription),
          slug: norm(r.slug),
          markdown: mdAfter,
          tags: newTags,
          targetKeyword: norm(r.targetKeyword),
        },
        note: data.note ?? '',
      });
      setReqInput('');
    } finally {
      setBusy(null);
    }
  }

  // Duyệt đề xuất sửa cả bài → áp mọi trường vào bài hiện tại.
  function acceptFullEdit() {
    if (!fullProposal) return;
    const r = fullProposal.result;
    if (r.title) setTitle(r.title);
    setMeta(r.metaDescription);
    if (r.slug) setSlug(r.slug);
    setMarkdown(r.markdown);
    setTags(r.tags.join(', '));
    if (r.targetKeyword) setKeyword(r.targetKeyword);
    setFullProposal(null);
    setNotice({ tone: 'success', text: t('editor.editReqApplied') });
    scrollToResult();
  }

  function rejectFullEdit() {
    setFullProposal(null);
    setNotice({ tone: 'info', text: t('editor.chatDiscarded') });
  }

  // Khối hiển thị diff xanh (thêm) / đỏ (xóa) — dùng chung cho popup và panel dưới.
  function diffView(before: string, after: string) {
    return (
      <div
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: 340,
          overflow: 'auto',
        }}
      >
        {diffWords(before, after).map((s, idx) => (
          <span
            key={idx}
            style={
              s.type === 'add'
                ? { background: 'rgba(46,160,67,0.18)', color: '#0f5132' }
                : s.type === 'del'
                  ? { background: 'rgba(207,34,46,0.15)', color: '#842029', textDecoration: 'line-through' }
                  : undefined
            }
          >
            {s.text}
          </span>
        ))}
      </div>
    );
  }

  async function saveDraft(): Promise<string | undefined> {
    setBusy('save');
    try {
      const res = await fetch('/api/articles/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          title,
          slug,
          metaDescription: meta,
          markdown,
          locale,
          targetKeyword: keyword,
          tags: tagList,
          coverImageUrl,
          seoScore: seo.score,
          aeoScore: aeo.score,
          geoScore: geo.score,
        }),
      });
      const data = await res.json();
      if (data.article) {
        setDraftId(data.article.id);
        setNotice({ tone: 'success', text: t('editor.savedDraft') });
        return data.article.id as string;
      }
    } finally {
      setBusy(null);
    }
    return undefined;
  }

  async function publishHandoff() {
    setBusy('publish');
    const id = await saveDraft();
    setBusy(null);
    if (id) router.push(`/${locale}/publish?draft=${id}`);
  }

  // ── Xuất file + Google Drive ──
  useEffect(() => {
    fetch('/api/drive/status')
      .then((r) => r.json())
      .then((d) => setDrive({ configured: !!d.configured, connected: !!d.connected, email: d.email }))
      .catch(() => {});
    // Quay về sau khi kết nối Drive (?drive=connected|error) → báo + dọn URL.
    const dp = params.get('drive');
    if (dp === 'connected') setNotice({ tone: 'success', text: t('editor.driveConnected') });
    else if (dp === 'error') setNotice({ tone: 'critical', text: t('editor.driveError') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportArticle = () => ({
    title,
    metaDescription: meta,
    slug,
    targetKeyword: keyword,
    tags: tagList,
    markdown,
  });

  function downloadFile(name: string, mime: string, content: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = name;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function doExport(fmt: 'txt' | 'doc') {
    setExportOpen(false);
    downloadFile(exportFileName(title, fmt), EXPORT_MIME[fmt], buildExport(exportArticle(), fmt));
  }

  async function saveToDrive(fmt: 'txt' | 'doc') {
    setExportOpen(false);
    setDriveBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...exportArticle(), format: fmt }),
      });
      const d = await res.json();
      if (d.needsConnect) {
        setDrive((s) => ({ ...s, connected: false }));
        setNotice({ tone: 'warning', text: t('editor.driveNeedConnect') });
      } else if (!res.ok || !d.ok) {
        setNotice({ tone: 'critical', text: d.error ?? t('editor.driveError') });
      } else {
        setNotice({
          tone: 'success',
          text: t('editor.driveSaved', { folder: d.folder }),
          url: d.webViewLink || undefined,
          urlLabel: t('editor.driveView'),
        });
      }
    } catch {
      setNotice({ tone: 'critical', text: t('editor.driveError') });
    } finally {
      setDriveBusy(false);
    }
  }

  // Back về đúng trang nguồn (mở từ Optimize/Drafts/Plan).
  const from = params.get('from');
  const backTarget =
    from === 'optimize'
      ? { content: t('nav.optimize'), url: `/${locale}/optimize` }
      : from === 'articles'
        ? { content: t('nav.articles'), url: `/${locale}/articles` }
        : { content: t('nav.plan'), url: `/${locale}/plan` };

  return (
    <Page title={title || t('editor.newTitle')} backAction={backTarget}>
      <BlockStack gap="400">
        {/* Thanh công cụ: LUÔN hiện đủ nút (tự xuống dòng khi hẹp), không thu vào "More actions"
            theo độ dài tiêu đề như header mặc định của Polaris Page. */}
        <InlineStack align="end" blockAlign="center" gap="200" wrap>
          <Tooltip content={t('editor.tipAiWrite')} dismissOnMouseOut>
            <Button
              icon={MagicIcon}
              loading={busy === 'write' && writeAt === 'toolbar'}
              disabled={busy !== null || aiReady === false}
              onClick={() => void aiWrite('toolbar')}
            >
              {busy === 'write' && writeAt === 'toolbar' ? t('editor.writing') : t('editor.aiWrite')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipAiOptimize')} dismissOnMouseOut>
            <Button
              icon={MagicIcon}
              loading={busy === 'optimize'}
              disabled={busy !== null || aiReady === false}
              onClick={aiOptimize}
            >
              {busy === 'optimize' ? t('editor.optimizing') : t('editor.aiOptimize')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipApplyRules')} dismissOnMouseOut>
            <Button
              icon={ReplaceIcon}
              loading={busy === 'replace'}
              disabled={busy !== null}
              onClick={applyRules}
            >
              {busy === 'replace' ? t('editor.applyingRules') : t('editor.applyRules')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipFillAlt')} dismissOnMouseOut>
            <Button
              icon={ImageIcon}
              loading={busy === 'alt'}
              disabled={busy !== null}
              onClick={fillAlt}
            >
              {busy === 'alt' ? t('editor.fillingAlt') : t('editor.fillAlt')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipFactCheck')} dismissOnMouseOut>
            <Button
              icon={CheckIcon}
              loading={busy === 'factcheck'}
              disabled={busy !== null || !markdown.trim()}
              onClick={() => void factCheck()}
            >
              {busy === 'factcheck' ? t('editor.checking') : t('editor.factCheck')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipHumanize')} dismissOnMouseOut>
            <Button
              icon={MagicIcon}
              loading={busy === 'humanize'}
              disabled={busy !== null || aiReady === false || !markdown.trim()}
              onClick={() => void humanize()}
            >
              {busy === 'humanize' ? t('editor.humanizing') : t('editor.humanize')}
            </Button>
          </Tooltip>
          <Popover
            active={exportOpen}
            onClose={() => setExportOpen(false)}
            activator={
              <Tooltip content={t('editor.tipExport')} dismissOnMouseOut>
                <Button
                  disclosure
                  loading={driveBusy}
                  disabled={busy !== null || !markdown.trim()}
                  onClick={() => setExportOpen((o) => !o)}
                >
                  {t('editor.exportBtn')}
                </Button>
              </Tooltip>
            }
          >
            <ActionList
              actionRole="menuitem"
              sections={[
                {
                  title: t('editor.exportDownload'),
                  items: [
                    { content: t('editor.exportTxt'), onAction: () => doExport('txt') },
                    { content: t('editor.exportDoc'), onAction: () => doExport('doc') },
                  ],
                },
                ...(drive.configured
                  ? [
                      {
                        title: 'Google Drive',
                        items: drive.connected
                          ? [
                              { content: t('editor.driveSaveDoc'), onAction: () => void saveToDrive('doc') },
                              { content: t('editor.driveSaveTxt'), onAction: () => void saveToDrive('txt') },
                            ]
                          : [{ content: t('editor.driveConnect'), url: `/${locale}/settings` }],
                      },
                    ]
                  : []),
              ]}
            />
          </Popover>
          <Tooltip content={t('editor.tipSaveDraft')} dismissOnMouseOut>
            <Button loading={busy === 'save'} disabled={busy !== null} onClick={saveDraft}>
              {t('editor.saveDraft')}
            </Button>
          </Tooltip>
          <Tooltip content={t('editor.tipPublish')} dismissOnMouseOut>
            <Button
              variant="primary"
              icon={ArrowRightIcon}
              loading={busy === 'publish'}
              disabled={busy !== null}
              onClick={publishHandoff}
            >
              {t('editor.publish')}
            </Button>
          </Tooltip>
        </InlineStack>

        {/* Modal kết quả kiểm chứng: dấu hiệu giọng AI + link chết + số liệu thiếu nguồn. */}
        <Modal
          open={factOpen}
          onClose={() => setFactOpen(false)}
          title={t('editor.factTitle')}
          secondaryActions={[{ content: t('editor.close'), onAction: () => setFactOpen(false) }]}
        >
          <Modal.Section>
            {factResult ? (
              <BlockStack gap="400">
                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">
                    {t('editor.aiNessTitle')}: {factResult.aiNess.score}/100
                  </Text>
                  {factResult.aiNess.flags.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('editor.aiNessClean')}
                    </Text>
                  ) : (
                    <BlockStack gap="050">
                      {factResult.aiNess.flags.map((f, i) => (
                        <Text as="span" variant="bodySm" key={`f-${i}`}>
                          • {t(`editor.aiNess_${f.key}`)}
                          {f.count ? ` (${f.count})` : ''}
                          {f.sample ? `: "${f.sample}"` : ''}
                        </Text>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>

                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">
                    {t('editor.linksTitle')}
                  </Text>
                  {factResult.links.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('editor.noLinks')}
                    </Text>
                  ) : factResult.deadLinks === 0 ? (
                    <Text as="p" tone="success" variant="bodySm">
                      {t('editor.allLinksOk', { n: factResult.links.length })}
                    </Text>
                  ) : (
                    <BlockStack gap="050">
                      {factResult.links
                        .filter((l) => !l.ok)
                        .map((l, i) => (
                          <Text as="span" tone="critical" variant="bodySm" key={`l-${i}`}>
                            ✗ {l.url} {l.status ? `(${l.status})` : l.error ? `(${l.error})` : ''}
                          </Text>
                        ))}
                    </BlockStack>
                  )}
                </BlockStack>

                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">
                    {t('editor.claimsTitle')}
                  </Text>
                  {factResult.claimsError ? (
                    <Text as="p" tone="critical" variant="bodySm">
                      {factResult.claimsError}
                    </Text>
                  ) : factResult.claims.length === 0 ? (
                    <Text as="p" tone="success" variant="bodySm">
                      {t('editor.claimsClean')}
                    </Text>
                  ) : (
                    <BlockStack gap="100">
                      {factResult.claims.map((c, i) => (
                        <BlockStack gap="050" key={`c-${i}`}>
                          <Text as="span" variant="bodySm" fontWeight="medium">
                            • {c.claim}
                          </Text>
                          {c.note ? (
                            <Text as="span" tone="subdued" variant="bodySm">
                              {c.note}
                            </Text>
                          ) : null}
                        </BlockStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </BlockStack>
            ) : null}
          </Modal.Section>
        </Modal>

        {/* Animation cho nút AI ở THANH CÔNG CỤ (Viết/Tối ưu). Các nút AI khác có animation
            ngay tại card của chúng (tab cơ bản/nguồn, ảnh, quy trình, panel/popup sửa bài). */}
        {(busy === 'write' && writeAt === 'toolbar') || busy === 'optimize' ? (
          <AiWorking
            text={busy === 'optimize' ? t('editor.aiOptimizing') : t('editor.aiWriting')}
            progress="indeterminate"
          />
        ) : null}

        {aiReady === false ? (
          <Banner
            tone="warning"
            title={t('editor.noKeyTitle')}
            action={{ content: t('editor.goToSettings'), url: `/${locale}/settings` }}
          >
            {t('editor.noKeyBody')}
          </Banner>
        ) : null}

        {notice ? (
          <Banner tone={notice.tone}>
            {notice.text}
            {notice.url ? (
              <>
                {' '}
                <ExtLink href={notice.url}>{notice.urlLabel ?? notice.url}</ExtLink>
              </>
            ) : null}
          </Banner>
        ) : null}

        {changes.length ? (
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">
                {t('editor.changesTitle')} ({changes.length})
              </Text>
              <List type="bullet">
                {changes.map((c, i) => (
                  <List.Item key={i}>
                    <Text as="span" fontWeight="semibold">
                      {c.field}:
                    </Text>{' '}
                    {c.note}
                  </List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
            {/* Khi TẠO BÀI MỚI: 2 cách viết - (0) nhập thông tin cơ bản, (1) tải file/link. */}
            {!draftParam && genOpen ? (
              <Box paddingBlockEnd="100">
                <Tabs
                  selected={genTab}
                  onSelect={(i) => setGenTab(i)}
                  fitted
                  tabs={[
                    { id: 'gen-basic', content: t('editor.tabBasic') },
                    { id: 'gen-file', content: t('editor.tabFile') },
                  ]}
                />
              </Box>
            ) : null}

            {/* Sau khi tạo xong → thu gọn phần nhập liệu; bấm để mở lại tạo bài khác. */}
            {!draftParam && !genOpen ? (
              <Card>
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('editor.genDoneNote')}
                  </Text>
                  <Button icon={MagicIcon} onClick={() => setGenOpen(true)}>
                    {t('editor.genReopen')}
                  </Button>
                </InlineStack>
              </Card>
            ) : null}

            {/* Tab "Viết bằng file/link/text": viết THẲNG từ nguồn. */}
            {!draftParam && genTab === 1 && genOpen ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('editor.srcTitle')}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {t('editor.srcHint')}
                  </Text>
                  <Tabs
                    selected={srcTab}
                    onSelect={(i) => setSrcTab(i)}
                    tabs={[
                      { id: 'src-file', content: t('editor.srcFile') },
                      { id: 'src-link', content: t('editor.srcLink') },
                      { id: 'src-paste', content: t('editor.srcPaste') },
                    ]}
                  />
                  {srcTab === 0 ? (
                    <DropZone
                      accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.docx"
                      allowMultiple={false}
                      onDrop={(files) => setSrcFile(files[0] ?? null)}
                    >
                      {srcFile ? (
                        <Box padding="400">
                          <Text as="p" fontWeight="medium">
                            {srcFile.name}
                          </Text>
                        </Box>
                      ) : (
                        <DropZone.FileUpload
                          actionTitle={t('editor.srcChooseFile')}
                          actionHint={t('editor.srcFileHint')}
                        />
                      )}
                    </DropZone>
                  ) : srcTab === 1 ? (
                    <TextField
                      label={t('editor.srcLink')}
                      labelHidden
                      type="url"
                      value={srcUrl}
                      onChange={setSrcUrl}
                      autoComplete="off"
                      placeholder="https://…"
                    />
                  ) : (
                    <TextField
                      label={t('editor.srcPaste')}
                      labelHidden
                      value={srcPaste}
                      onChange={setSrcPaste}
                      multiline={8}
                      autoComplete="off"
                      placeholder={t('editor.srcPastePlaceholder')}
                    />
                  )}
                  <TextField
                    label={t('editor.srcRequirement')}
                    value={srcRequirement}
                    onChange={setSrcRequirement}
                    multiline={2}
                    autoComplete="off"
                    helpText={t('editor.srcRequirementHint')}
                  />
                  {srcBusy || (busy === 'write' && writeAt === 'source') ? (
                    <AiWorking text={t('editor.aiWriting')} progress="indeterminate" />
                  ) : (
                    <InlineStack gap="300" blockAlign="center">
                      <Button
                        variant="primary"
                        icon={MagicIcon}
                        disabled={
                          busy !== null ||
                          aiReady === false ||
                          (srcTab === 0 ? !srcFile : srcTab === 1 ? !srcUrl.trim() : !srcPaste.trim())
                        }
                        onClick={writeFromSource}
                      >
                        {srcTab === 2 ? t('editor.rewriteWithAi') : t('editor.aiWrite')}
                      </Button>
                      {sourceInfo ? (
                        <Text as="span" tone="subdued" variant="bodySm">
                          {sourceInfo}
                        </Text>
                      ) : null}
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>
            ) : null}

            {/* Tab "Cơ bản": điền tiêu đề/từ khóa ở dưới + yêu cầu rồi VIẾT THẲNG bằng AI. */}
            {!draftParam && genTab === 0 && genOpen ? (
              <Card>
                {busy === 'write' && writeAt === 'basic' ? (
                  <AiWorking text={t('editor.aiWriting')} progress="indeterminate" />
                ) : (
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('editor.basicHint')}
                    </Text>
                    <TextField
                      label={t('editor.srcRequirement')}
                      value={basicReq}
                      onChange={setBasicReq}
                      multiline={2}
                      autoComplete="off"
                      helpText={t('editor.srcRequirementHint')}
                      disabled={busy !== null}
                    />
                    <InlineStack>
                      <Button
                        variant="primary"
                        icon={MagicIcon}
                        disabled={busy !== null || aiReady === false}
                        onClick={() => void aiWrite('basic')}
                      >
                        {t('editor.aiWrite')}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </Card>
            ) : null}

            {/* Quy trình AI 2 bước (lập khung → viết): CHỈ khi đang sửa nháp + bật ở Cài đặt bài viết. */}
            {draftParam && pipelineEnabled ? (
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('editor.pipelineTitle')}
                  </Text>
                  <Box minWidth="180px">
                    <Select
                      label={t('editor.pipelineMode')}
                      labelHidden
                      options={[
                        { label: t('editor.modeManual'), value: 'manual' },
                        { label: t('editor.modeAuto'), value: 'auto' },
                      ]}
                      value={pipelineMode}
                      onChange={(v) => setPipelineMode(v as 'auto' | 'manual')}
                    />
                  </Box>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('editor.pipelineDesc')}
                </Text>

                {bpBusy || (busy === 'write' && writeAt === 'pipeline') ? (
                  <AiWorking
                    text={bpBusy ? t('editor.bpGenerating') : t('editor.aiWriting')}
                    progress="indeterminate"
                  />
                ) : null}

                {pipelineMode === 'auto' ? (
                  <InlineStack>
                    <Button
                      variant="primary"
                      icon={MagicIcon}
                      loading={bpBusy || busy === 'write'}
                      disabled={bpBusy || busy !== null}
                      onClick={runAuto}
                    >
                      {bpBusy
                        ? t('editor.bpGenerating')
                        : busy === 'write'
                          ? t('editor.writing')
                          : t('editor.runAuto')}
                    </Button>
                  </InlineStack>
                ) : (
                  <BlockStack gap="300">
                    <InlineStack>
                      <Button
                        icon={MagicIcon}
                        loading={bpBusy}
                        disabled={bpBusy || busy !== null}
                        onClick={() => void fetchBlueprint()}
                      >
                        {bpBusy ? t('editor.bpGenerating') : t('editor.genBlueprint')}
                      </Button>
                    </InlineStack>

                    {blueprint && !sourceText ? (
                      <BlueprintForm
                        bp={blueprint}
                        onChange={(patch) => setBlueprint((b) => (b ? { ...b, ...patch } : b))}
                        onWrite={writeFromBlueprint}
                        writing={busy === 'write'}
                      />
                    ) : null}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
            ) : null}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {t('editor.aiPickTitle')}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('editor.aiPickHint')}
                </Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select
                    label={<HelpLabel label={t('editor.aiProvider')} help={t('editor.aiProviderHelp')} />}
                    options={[
                      { label: t('editor.aiAuto'), value: '' },
                      ...providers
                        .filter((p) => p.hasKey)
                        .map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={aiProvider}
                    onChange={selectProvider}
                  />
                  <Select
                    label={<HelpLabel label={t('editor.aiModel')} help={t('editor.aiModelHelp')} />}
                    disabled={!aiProvider || modelsBusy}
                    options={[
                      {
                        label: modelsBusy ? t('editor.aiModelLoading') : t('editor.aiModelDefault'),
                        value: '',
                      },
                      ...aiModels.map((m) => ({ label: m, value: m })),
                    ]}
                    value={aiModel}
                    onChange={setAiModel}
                  />
                </InlineGrid>

                {canManageKeys ? (
                  <>
                    <Button variant="plain" onClick={() => setShowAddKey((v) => !v)}>
                      {t('editor.addKey')}
                    </Button>
                    {showAddKey ? (
                      <Box
                        background="bg-surface-secondary"
                        padding="300"
                        borderRadius="200"
                      >
                        <BlockStack gap="200">
                          <Text as="p" tone="subdued" variant="bodySm">
                            {t('editor.addKeyHint')}
                          </Text>
                          <Select
                            label={t('editor.aiProvider')}
                            options={providers.map((p) => ({
                              label: p.hasKey ? `${p.label} ✓` : p.label,
                              value: p.id,
                            }))}
                            value={keyProvider}
                            onChange={setKeyProvider}
                          />
                          <TextField
                            label={t('editor.apiKey')}
                            type="password"
                            value={keyValue}
                            onChange={setKeyValue}
                            autoComplete="off"
                            placeholder={
                              providers.find((p) => p.id === keyProvider)?.keyHint ?? ''
                            }
                          />
                          <InlineStack>
                            <Button
                              variant="primary"
                              loading={keyBusy}
                              disabled={!keyValue.trim()}
                              onClick={saveKey}
                            >
                              {t('editor.saveKey')}
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    ) : null}
                  </>
                ) : null}
              </BlockStack>
            </Card>

            {/* Mốc cuộn tới KẾT QUẢ (nội dung bài) sau khi AI viết/sửa xong */}
            <div ref={resultRef} />

            <Card>
              <BlockStack gap="400">
                {/* Bài cũ mở về sửa: link xem bài trực tiếp trên web (mở tab mới). */}
                {publishedUrl ? (
                  <InlineStack gap="150" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {t('editor.publishedAt')}:
                    </Text>
                    <ExtLink href={publishedUrl}>{t('editor.viewArticle')}</ExtLink>
                  </InlineStack>
                ) : null}
                <TextField label={t('publish.fieldTitle')} value={title} onChange={setTitle} autoComplete="off" />
                <TextField
                  label={<HelpLabel label={t('editor.targetKeyword')} help={t('editor.targetKeywordHelp')} />}
                  value={keyword}
                  onChange={setKeyword}
                  autoComplete="off"
                  helpText={t('editor.keywordAutoHint')}
                />
                <TextField
                  label={<HelpLabel label={t('publish.slug')} help={t('publish.slugHelp')} />}
                  value={slug}
                  onChange={setSlug}
                  autoComplete="off"
                />
                <TextField
                  label={<HelpLabel label={t('publish.metaDescription')} help={t('publish.metaDescriptionHelp')} />}
                  value={meta}
                  onChange={setMeta}
                  multiline={2}
                  autoComplete="off"
                  helpText={`${meta.length}/155`}
                />
                <TextField
                  label={<HelpLabel label={t('publish.tags')} help={t('publish.tagsHelp')} />}
                  value={tags}
                  onChange={setTags}
                  autoComplete="off"
                  helpText={t('editor.tagsAutoHint')}
                />
                <Box>
                  {/* Mặc định chỉ hiện ~10 dòng đầu (cuộn trong khung). Bấm "Mở rộng" để giãn hết
                      nội dung (bỏ cuộn dọc). Bôi đen để sửa bằng AI hoạt động trực tiếp trên ô này. */}
                  <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
                    <Text as="span" variant="bodySm" fontWeight="medium">
                      {t('editor.tabWrite')}
                    </Text>
                    <InlineStack gap="200" blockAlign="center">
                      {draftId ? (
                        <Button
                          size="slim"
                          variant={commentsOpen ? 'primary' : 'tertiary'}
                          icon={NoteIcon}
                          onClick={() => setCommentsOpen((o) => !o)}
                        >
                          {`${t('comments.title')} (${commentCount})`}
                        </Button>
                      ) : null}
                      <Button
                        size="slim"
                        variant="tertiary"
                        icon={mdExpanded ? ChevronUpIcon : ChevronDownIcon}
                        accessibilityLabel={mdExpanded ? t('editor.mdCollapse') : t('editor.mdExpand')}
                        onClick={() => setMdExpanded((v) => !v)}
                      />
                      <Button size="slim" icon={SearchIcon} onClick={() => setMdPreviewOpen(true)}>
                        {t('editor.tabPreview')}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                  <Box paddingBlockStart="200">
                    <div className={mdExpanded ? 'md-editor-expanded' : 'md-editor-collapsed'}>
                      <TextField
                        id="editor-markdown"
                        label="Markdown"
                        labelHidden
                        value={markdown}
                        onChange={setMarkdown}
                        multiline={10}
                        autoComplete="off"
                        helpText={t('editor.mdHint')}
                      />
                    </div>
                  </Box>
                  {/* Ghi chú (cộng tác) NGAY trong mục Soạn thảo - bằng chiều ngang cột. Hiện khi
                      bấm bộ đếm ở header, hoặc khi "bôi đen để ghi chú". Cần bài đã lưu (có id). */}
                  {draftId ? (
                    <Box paddingBlockStart="300">
                      <ArticleComments
                        articleId={draftId}
                        open={commentsOpen}
                        quote={commentQuote}
                        onCount={setCommentCount}
                      />
                    </Box>
                  ) : null}
                </Box>
              </BlockStack>
            </Card>

            {/* Nhập yêu cầu chỉnh sửa — AI sửa TOÀN BỘ bài (tiêu đề, từ khóa, slug, meta, thẻ, nội dung) */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="150" blockAlign="center" wrap={false}>
                  <Box>
                    <Icon source={MagicIcon} tone="magic" />
                  </Box>
                  <Text as="h2" variant="headingSm">
                    {t('editor.editReqTitle')}
                  </Text>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('editor.editReqHint')}
                </Text>

                {busy === 'editAll' ? (
                  <AiWorking text={t('editor.chatWorking')} progress="indeterminate" />
                ) : fullProposal ? (
                  /* Xem trước: các trường đã đổi + diff nội dung → duyệt rồi mới áp */
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingXs">
                      {t('editor.editReqReviewTitle')}
                    </Text>
                    {fullProposal.note ? (
                      <Text as="p" tone="subdued" variant="bodySm">
                        {fullProposal.note}
                      </Text>
                    ) : null}
                    {fullProposal.fields.map((f) => (
                      <BlockStack gap="100" key={f.label}>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {f.label}
                        </Text>
                        <Box background="bg-surface-secondary" padding="200" borderRadius="150">
                          {diffView(f.before, f.after)}
                        </Box>
                      </BlockStack>
                    ))}
                    {fullProposal.mdChanged ? (
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {t('editor.fieldContent')}
                        </Text>
                        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                          {diffView(fullProposal.mdBefore, fullProposal.mdAfter)}
                        </Box>
                      </BlockStack>
                    ) : null}
                    <InlineStack gap="200">
                      <Button variant="primary" icon={CheckIcon} onClick={acceptFullEdit}>
                        {t('editor.chatAccept')}
                      </Button>
                      <Button icon={XIcon} onClick={rejectFullEdit}>
                        {t('editor.chatReject')}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <>
                    <TextField
                      label={t('editor.editReqTitle')}
                      labelHidden
                      value={reqInput}
                      onChange={setReqInput}
                      multiline={2}
                      autoComplete="off"
                      placeholder={t('editor.editReqPlaceholder')}
                      disabled={busy !== null}
                    />
                    <InlineStack gap="200">
                      <Button
                        variant="primary"
                        icon={MagicIcon}
                        disabled={busy !== null || !reqInput.trim()}
                        onClick={() => void sendFullEdit(reqInput)}
                      >
                        {t('editor.rewriteWithAi')}
                      </Button>
                    </InlineStack>

                    {/* Gợi ý nhanh — bấm là chỉnh cả bài luôn */}
                    <InlineStack gap="200">
                      {[
                        t('editor.chatQuick1'),
                        t('editor.chatQuick2'),
                        t('editor.chatQuick3'),
                        t('editor.chatQuick4'),
                      ].map((q) => (
                        <Button key={q} size="slim" icon={MagicIcon} disabled={busy !== null} onClick={() => void sendFullEdit(q)}>
                          {q}
                        </Button>
                      ))}
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  {t('editor.imagesTitle')}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t('editor.imagesHint')}
                </Text>
                {imgNotice ? <Banner tone={imgNotice.tone}>{imgNotice.text}</Banner> : null}

                <Text as="p" variant="bodySm">
                  <Link url={`/${locale}/image-settings`}>{t('editor.imgConfigLink')}</Link>
                </Text>

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select
                    label={<HelpLabel label={t('editor.imgProvider')} help={t('editor.imgProviderHelp')} />}
                    options={[
                      { label: t('editor.imgUseSettings'), value: '' },
                      ...imageProviders.map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={imgProvider}
                    onChange={selectImgProvider}
                  />
                  <Select
                    label={<HelpLabel label={t('editor.imgModel')} help={t('editor.imgModelHelp')} />}
                    disabled={!imgProvider || imgModelsBusy}
                    options={[
                      {
                        label: imgModelsBusy ? t('editor.aiModelLoading') : t('editor.aiModelDefault'),
                        value: '',
                      },
                      ...imgModels.map((m) => ({ label: m, value: m })),
                    ]}
                    value={imgModel}
                    onChange={setImgModel}
                  />
                </InlineGrid>

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <Select
                    label={t('editor.imgSize')}
                    options={[
                      { label: t('editor.useDefault'), value: '' },
                      { label: '16:9 ngang (1536×1024)', value: '1536x1024' },
                      { label: '1:1 vuông (1024×1024)', value: '1024x1024' },
                      { label: '9:16 dọc (1024×1536)', value: '1024x1536' },
                    ]}
                    value={imgSize}
                    onChange={(v) => setImgSize(v as '1024x1024' | '1536x1024' | '1024x1536' | '')}
                  />
                </InlineGrid>

                {/* ẢNH BÌA - tạo nhiều lần, tích 1 ảnh để dùng */}
                <TextField
                  label={t('editor.imgBriefLabel')}
                  value={coverBrief}
                  onChange={setCoverBrief}
                  autoComplete="off"
                  multiline={2}
                  placeholder={t('editor.coverBriefPlaceholder')}
                  disabled={imgBusy !== null}
                />
                <InlineStack gap="200">
                  <Button variant="primary" icon={MagicIcon} loading={imgBusy === 'cover'} disabled={imgBusy !== null} onClick={genCover}>
                    {t('editor.genCover')}
                  </Button>
                </InlineStack>
                {imgBusy === 'cover' ? (
                  <AiWorking text={t('editor.aiCover')} progress="indeterminate" />
                ) : null}
                {coverGallery.length ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t('editor.coverGalleryTitle')}
                    </Text>
                    <div className="thumb-grid">
                      {coverGallery.map((url) => {
                        const active = url === coverImageUrl;
                        return (
                          <div key={url} style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => setCoverImageUrl(url)}
                              style={{
                                padding: 0,
                                border: active ? '3px solid #5b3ce0' : '1px solid #d7d7d7',
                                borderRadius: 8,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                background: 'none',
                                width: '100%',
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="cover option" style={{ width: '100%', display: 'block' }} />
                              <div style={{ fontSize: 11, padding: '2px 4px', color: active ? '#5b3ce0' : '#8a8a8a' }}>
                                {active ? t('editor.selectedCover') : t('editor.useThisCover')}
                              </div>
                            </button>
                            <ZoomButton onClick={() => setLightboxUrl(url)} label={t('editor.viewLarge')} />
                          </div>
                        );
                      })}
                    </div>
                  </BlockStack>
                ) : null}

                {/* ẢNH TRONG BÀI - tạo nhiều lần, tích ảnh phù hợp từng mục rồi Chèn */}
                <TextField
                  label={t('editor.imgBriefLabel')}
                  value={illusBrief}
                  onChange={setIllusBrief}
                  autoComplete="off"
                  multiline={2}
                  placeholder={t('editor.illusBriefPlaceholder')}
                  disabled={imgBusy !== null}
                />
                <InlineStack gap="200">
                  <Button icon={MagicIcon} loading={imgBusy === 'illustrate'} disabled={imgBusy !== null} onClick={genIllustrations}>
                    {t('editor.genIllustrations')}
                  </Button>
                  {illusGallery.length ? (
                    <Button
                      variant="primary"
                      disabled={selectedIllus.size === 0}
                      onClick={applyIllustrations}
                    >
                      {t('editor.insertSelected')}
                    </Button>
                  ) : null}
                </InlineStack>
                {imgBusy === 'illustrate' ? (
                  <AiWorking text={t('editor.aiIllustrate')} progress="indeterminate" />
                ) : null}
                {illusGallery.length ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t('editor.illusGalleryTitle')}
                    </Text>
                    <div className="thumb-grid">
                      {illusGallery.map((it) => {
                        const checked = selectedIllus.has(it.url);
                        return (
                          <div
                            key={it.url}
                            style={{
                              position: 'relative',
                              border: checked ? '3px solid #29845a' : '1px solid #d7d7d7',
                              borderRadius: 8,
                              overflow: 'hidden',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={it.url}
                              alt={it.alt}
                              onClick={() => setLightboxUrl(it.url)}
                              style={{ width: '100%', display: 'block', cursor: 'zoom-in' }}
                            />
                            <ZoomButton onClick={() => setLightboxUrl(it.url)} label={t('editor.viewLarge')} />
                            <div style={{ padding: '4px 6px' }}>
                              <Checkbox label={it.alt} checked={checked} onChange={() => toggleIllus(it.url)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {markdown.trim().length === 0 ? (
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingSm">
                      {t('editor.scoreSeo')} · {t('editor.scoreAeo')} · {t('editor.scoreGeo')}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('editor.noContentScore')}
                    </Text>
                  </BlockStack>
                </Card>
              ) : (
                <>
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack gap="400" blockAlign="center">
                        <ScoreRing value={seo.score} />
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t('editor.scoreSeo')}
                        </Text>
                        <ScoreDelta current={seo.score} prev={prevScores?.seo} />
                      </InlineStack>
                      <InlineStack gap="400" blockAlign="center">
                        <ScoreRing value={aeo.score} />
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t('editor.scoreAeo')}
                        </Text>
                        <ScoreDelta current={aeo.score} prev={prevScores?.aeo} />
                      </InlineStack>
                      <InlineStack gap="400" blockAlign="center">
                        <ScoreRing value={geo.score} />
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t('editor.scoreGeo')}
                        </Text>
                        <ScoreDelta current={geo.score} prev={prevScores?.geo} />
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingSm">
                        {t('editor.checklist')}
                      </Text>
                      {[...seo.checks, ...aeo.checks, ...geo.checks].map((c) => (
                        <CheckRow key={c.id} check={c} />
                      ))}
                    </BlockStack>
                  </Card>
                </>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Nút AI NỔI cạnh con trỏ khi bôi đen — bấm để mở popup sửa (khỏi kéo xuống panel dưới) */}
      {selBtn && !modalOpen && busy === null
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                left: selBtn.x,
                top: selBtn.y,
                transform: 'translate(-50%, -130%)',
                zIndex: 10000, // trên cả Polaris Modal (popup Xem chi tiết)
                boxShadow: '0 2px 10px rgba(0,0,0,0.22)',
                borderRadius: 8,
              }}
              onMouseDown={(e) => e.preventDefault() /* giữ vùng chọn khi bấm nút */}
            >
              <InlineStack gap="100" blockAlign="center" wrap={false}>
                <Button variant="primary" icon={MagicIcon} onClick={openSelEditor}>
                  {t('editor.chatEditSel')}
                </Button>
                {draftId ? (
                  <Button icon={NoteIcon} onClick={openSelComment}>
                    {t('editor.commentSel')}
                  </Button>
                ) : null}
              </InlineStack>
            </div>,
            document.body,
          )
        : null}

      {/* Popup sửa đoạn đã chọn: nhập yêu cầu → xem diff → Chấp nhận/Bỏ, ngay tại đây */}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (busy) return; // đang chạy AI → không cho đóng
          setModalOpen(false);
          setProposal(null);
          setActiveSel(null);
        }}
        title={t('editor.chatEditSelTitle')}
        primaryAction={
          proposal
            ? { content: t('editor.chatAccept'), onAction: acceptEdit }
            : {
                content: busy === 'edit' ? t('editor.chatSending') : t('editor.chatSend'),
                icon: MagicIcon,
                onAction: () => activeSel && void sendEdit(chatInput, activeSel),
                loading: busy === 'edit',
                disabled: busy !== null || !chatInput.trim(),
              }
        }
        secondaryActions={[
          proposal
            ? { content: t('editor.chatReject'), onAction: rejectEdit, disabled: busy !== null }
            : { content: t('editor.chatCancel'), onAction: () => setModalOpen(false), disabled: busy !== null },
        ]}
      >
        <Modal.Section>
          {busy === 'edit' ? (
            <AiWorking text={t('editor.chatWorking')} progress="indeterminate" />
          ) : proposal ? (
            <BlockStack gap="200">
              {proposal.note ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  {proposal.note}
                </Text>
              ) : null}
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                {diffView(proposal.before, proposal.after)}
              </Box>
            </BlockStack>
          ) : (
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {t('editor.chatSelectedLabel')}
                </Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12,
                      lineHeight: 1.6,
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    {activeSel?.text}
                  </div>
                </Box>
              </BlockStack>
              <TextField
                label={t('editor.chatEditSelTitle')}
                labelHidden
                value={chatInput}
                onChange={setChatInput}
                multiline={2}
                autoComplete="off"
                placeholder={t('editor.chatPlaceholder')}
                disabled={busy !== null}
              />
              <InlineStack gap="200">
                {[t('editor.chatQuick1'), t('editor.chatQuick2'), t('editor.chatQuick3'), t('editor.chatQuick4')].map(
                  (q) => (
                    <Button
                      key={q}
                      size="slim"
                      icon={MagicIcon}
                      disabled={busy !== null}
                      onClick={() => activeSel && void sendEdit(q, activeSel)}
                    >
                      {q}
                    </Button>
                  ),
                )}
              </InlineStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      {/* Popup XEM TRƯỚC — render HTML từ markdown. Click ra ngoài để đóng. */}
      <Modal
        open={mdPreviewOpen}
        onClose={() => setMdPreviewOpen(false)}
        title={t('editor.tabPreview')}
        size="large"
      >
        <Modal.Section>
          <div
            className="article-preview"
            onClick={(e) => {
              const el = e.target as HTMLElement;
              if (el.tagName === 'IMG') setLightboxUrl((el as HTMLImageElement).src);
            }}
            dangerouslySetInnerHTML={{ __html: coverImageHtml(coverImageUrl) + previewHtml }}
          />
        </Modal.Section>
      </Modal>

      {/* Lightbox: xem ảnh AI phóng to. Click nền hoặc Esc để đóng. */}
      {lightboxUrl ? (
        <div
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t('editor.viewLarge')}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            style={{
              maxWidth: '92vw',
              maxHeight: '92vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 10px 50px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      ) : null}
    </Page>
  );
}

// Delta điểm sau khi AI sửa: tăng → mũi tên xanh lên, giảm → mũi tên đỏ xuống, không đổi (hoặc
// chưa có mốc "trước") → KHÔNG hiện gì.
function ScoreDelta({ current, prev }: { current: number; prev?: number }) {
  if (prev === undefined) return null;
  const d = current - prev;
  if (d === 0) return null;
  const up = d > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <svg
        width="13"
        height="13"
        viewBox="0 0 20 20"
        fill="none"
        stroke={up ? '#29845a' : '#d12e2e'}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={up ? undefined : { transform: 'rotate(180deg)' }}
        aria-hidden="true"
      >
        <path d="m5 13 5-5 5 5" />
      </svg>
      <Text as="span" variant="bodySm" fontWeight="semibold" tone={up ? 'success' : 'critical'}>
        {up ? `+${d}` : d}
      </Text>
    </span>
  );
}

// Nút phóng to (kính lúp) đặt góc trên-phải mỗi ảnh AI. stopPropagation để không kích hoạt
// hành vi của phần tử bên dưới (chọn ảnh bìa / toggle checkbox).
function ZoomButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 2,
        width: 26,
        height: 26,
        borderRadius: 6,
        border: '1px solid rgba(0,0,0,0.15)',
        background: 'rgba(255,255,255,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-in',
        padding: 0,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#404040" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 4 4" />
      </svg>
    </button>
  );
}

// Trích plain-text từ markdown (bỏ cú pháp) làm ngữ cảnh chủ đề cho ảnh AI.
function plainExcerpt(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // ảnh
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link → giữ chữ
    .replace(/[#>*_`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function CheckRow({ check }: { check: ScoreCheck }) {
  const icon = check.state === 'pass' ? CheckIcon : check.state === 'warn' ? AlertIcon : XIcon;
  const tone = check.state === 'pass' ? 'success' : check.state === 'warn' ? 'caution' : 'critical';
  return (
    <InlineStack gap="200" blockAlign="start" wrap={false}>
      <div style={{ width: 16, flex: 'none' }}>
        <Icon source={icon} tone={tone} />
      </div>
      <Text as="span" variant="bodySm">
        {check.label}
      </Text>
    </InlineStack>
  );
}

interface BlueprintShape {
  title: string;
  targetKeyword: string;
  secondaryKeywords: string;
  outline: string;
  questions: string;
  brief: string;
}

// Khung nội dung CÓ THỂ SỬA + nút Viết - dùng chung cho quy trình 2 bước và "viết từ nguồn".
function BlueprintForm({
  bp,
  onChange,
  onWrite,
  writing,
}: {
  bp: BlueprintShape;
  onChange: (patch: Partial<BlueprintShape>) => void;
  onWrite: () => void;
  writing: boolean;
}) {
  const t = useTranslations();
  return (
    <BlockStack gap="300">
      <TextField
        label={t('publish.fieldTitle')}
        value={bp.title}
        onChange={(v) => onChange({ title: v })}
        autoComplete="off"
      />
      <TextField
        label={t('editor.targetKeyword')}
        value={bp.targetKeyword}
        onChange={(v) => onChange({ targetKeyword: v })}
        autoComplete="off"
      />
      <TextField
        label={t('editor.bpSecondary')}
        value={bp.secondaryKeywords}
        onChange={(v) => onChange({ secondaryKeywords: v })}
        autoComplete="off"
        helpText={t('editor.bpSecondaryHint')}
      />
      <TextField
        label={t('editor.bpOutline')}
        value={bp.outline}
        onChange={(v) => onChange({ outline: v })}
        multiline={5}
        autoComplete="off"
        helpText={t('editor.bpLineHint')}
      />
      <TextField
        label={t('editor.bpQuestions')}
        value={bp.questions}
        onChange={(v) => onChange({ questions: v })}
        multiline={3}
        autoComplete="off"
        helpText={t('editor.bpLineHint')}
      />
      <TextField
        label={t('editor.bpBrief')}
        value={bp.brief}
        onChange={(v) => onChange({ brief: v })}
        multiline={3}
        autoComplete="off"
      />
      <InlineStack>
        <Button variant="primary" icon={MagicIcon} loading={writing} disabled={writing} onClick={onWrite}>
          {writing ? t('editor.writing') : t('editor.writeFromBp')}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
