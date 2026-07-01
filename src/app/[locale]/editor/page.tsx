'use client';

import {
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
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertIcon, ArrowRightIcon, CheckIcon, EditIcon, TargetIcon, XIcon } from '@/components/icons';
import { AiWorking, ScoreRing } from '@/components/ui';
import { can, type Role } from '@/lib/auth/permissions';
import { coverImageHtml, markdownToHtml } from '@/lib/content/markdown';
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
  const [busy, setBusy] = useState<'write' | 'optimize' | 'save' | 'publish' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'warning' | 'critical'; text: string } | null>(null);
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
  const [srcTab, setSrcTab] = useState(0); // 0 = file, 1 = link
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState('');
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

  // Lưu lựa chọn (sau khi đã khôi phục) để dùng cho lần sau.
  useEffect(() => {
    if (!prefRestored.current) return;
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
  const [tab, setTab] = useState(0);

  // Ảnh AI - style lấy từ Cài đặt ảnh AI; ở đây chỉnh nhanh tỉ lệ + chọn AI/model ảnh.
  const [imgBusy, setImgBusy] = useState<'cover' | 'illustrate' | null>(null);
  const [imgNotice, setImgNotice] = useState<{ tone: 'success' | 'warning' | 'critical'; text: string } | null>(null);
  const [imgSize, setImgSize] = useState<'1024x1024' | '1536x1024' | '1024x1536' | ''>('');
  const [imgProvider, setImgProvider] = useState(''); // '' = theo Cài đặt ảnh AI
  const [imgModel, setImgModel] = useState('');
  const [imgModels, setImgModels] = useState<string[]>([]);
  const [imgModelsBusy, setImgModelsBusy] = useState(false);
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
        body: JSON.stringify({ markdown, ...imgOverride() }),
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
  async function writeWith(bp: BpApi) {
    setBusy('write');
    setChanges([]);
    setNotice(null);
    try {
      const research = [
        bp.brief,
        bp.questions?.length ? `${t('editor.bpQuestions')}:\n- ${bp.questions.join('\n- ')}` : '',
        // Bám sát nội dung NGUỒN (file/URL) nếu có - cây viết dùng làm dữ liệu nền.
        sourceText.trim()
          ? `${t('editor.srcContextLabel')}:\n${sourceText.trim().slice(0, 6000)}`
          : '',
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
        if (Array.isArray(data.article.tags)) setTags(data.article.tags.join(', '));
        if (data.targetKeyword) setKeyword(data.targetKeyword);
        setNotice(
          data.needsKey
            ? { tone: 'warning', text: t('editor.usingMock') }
            : { tone: 'success', text: t('editor.bpWritten') },
        );
      }
    } finally {
      setBusy(null);
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

  // Tự động: lập khung rồi viết luôn, không cần duyệt.
  async function runAuto() {
    const bp = await fetchBlueprint();
    if (bp) await writeWith(bp);
  }

  // Viết từ NGUỒN: trích text (file/URL) → AI phân tích → lập khung (chờ duyệt rồi viết).
  async function analyzeSource() {
    setSrcBusy(true);
    setNotice(null);
    setSourceInfo(null);
    try {
      // 1) Trích văn bản từ file hoặc URL.
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
      const ex = await exRes.json();
      if (!exRes.ok || !ex.text) {
        setNotice({ tone: 'critical', text: ex.error ?? t('editor.aiError') });
        return;
      }
      setSourceText(ex.text);
      setSourceInfo(t('editor.srcExtracted', { n: ex.chars ?? ex.text.length }));

      // 2) AI phân tích nguồn → lập khung.
      const topic = (srcRequirement.trim() || ex.title || title || keyword).slice(0, 300);
      if (!topic) {
        setNotice({ tone: 'warning', text: t('editor.bpNeedTopic') });
        return;
      }
      const bpRes = await fetch('/api/articles/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, targetKeyword: keyword || undefined, locale, source: ex.text }),
      });
      const data = await bpRes.json();
      if (data.needsKey) {
        setNotice({ tone: 'warning', text: t('editor.noKeyBody') });
        return;
      }
      if (!data.ok || !data.blueprint) {
        setNotice({ tone: 'critical', text: data.error ?? t('editor.aiError') });
        return;
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
      setNotice({ tone: 'success', text: t('editor.srcReady') });
    } finally {
      setSrcBusy(false);
    }
  }

  async function aiWrite() {
    setBusy('write');
    setChanges([]);
    setNotice(null);
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, targetKeyword: keyword, locale, ...aiOverride() }),
      });
      const data = await res.json();
      if (data.aiError) {
        setNotice({ tone: 'critical', text: data.aiError });
      } else if (data.article) {
        setTitle(data.article.title);
        setMeta(data.article.metaDescription);
        setMarkdown(data.article.markdown);
        if (Array.isArray(data.article.tags)) setTags(data.article.tags.join(', '));
        // Target keyword bám nội dung (server chọn cụm cho điểm cao nhất).
        if (data.targetKeyword) setKeyword(data.targetKeyword);
        setNotice(data.needsKey ? { tone: 'warning', text: t('editor.usingMock') } : null);
      }
    } finally {
      setBusy(null);
    }
  }

  async function aiOptimize() {
    setBusy('optimize');
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
    } finally {
      setBusy(null);
    }
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

  // Back về đúng trang nguồn (mở từ Optimize/Drafts/Plan).
  const from = params.get('from');
  const backTarget =
    from === 'optimize'
      ? { content: t('nav.optimize'), url: `/${locale}/optimize` }
      : from === 'articles'
        ? { content: t('nav.articles'), url: `/${locale}/articles` }
        : { content: t('nav.plan'), url: `/${locale}/plan` };

  return (
    <Page
      title={title || t('editor.newTitle')}
      backAction={backTarget}
      primaryAction={{
        content: t('editor.publish'),
        icon: ArrowRightIcon,
        loading: busy === 'publish',
        disabled: busy !== null,
        onAction: publishHandoff,
      }}
      secondaryActions={[
        {
          content: busy === 'write' ? t('editor.writing') : t('editor.aiWrite'),
          icon: EditIcon,
          loading: busy === 'write',
          disabled: busy !== null || aiReady === false,
          onAction: aiWrite,
        },
        {
          content: busy === 'optimize' ? t('editor.optimizing') : t('editor.aiOptimize'),
          icon: TargetIcon,
          loading: busy === 'optimize',
          disabled: busy !== null || aiReady === false,
          onAction: aiOptimize,
        },
        { content: t('editor.saveDraft'), loading: busy === 'save', disabled: busy !== null, onAction: saveDraft },
      ]}
    >
      <BlockStack gap="400">
        {busy === 'write' || busy === 'optimize' || imgBusy ? (
          <AiWorking
            text={
              busy === 'write'
                ? t('editor.aiWriting')
                : busy === 'optimize'
                  ? t('editor.aiOptimizing')
                  : imgBusy === 'cover'
                    ? t('editor.aiCover')
                    : t('editor.aiIllustrate')
            }
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

        {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}

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
            {!draftParam ? (
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

            {/* Tab "Tải file": viết từ NGUỒN (file/URL) → phân tích → khung → duyệt → viết. */}
            {!draftParam && genTab === 1 ? (
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
                  ) : (
                    <TextField
                      label={t('editor.srcLink')}
                      labelHidden
                      type="url"
                      value={srcUrl}
                      onChange={setSrcUrl}
                      autoComplete="off"
                      placeholder="https://…"
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
                  <InlineStack gap="300" blockAlign="center">
                    <Button
                      variant="primary"
                      loading={srcBusy}
                      disabled={
                        srcBusy ||
                        busy !== null ||
                        aiReady === false ||
                        (srcTab === 0 ? !srcFile : !srcUrl.trim())
                      }
                      onClick={analyzeSource}
                    >
                      {srcBusy ? t('editor.srcAnalyzing') : t('editor.srcAnalyze')}
                    </Button>
                    {sourceInfo ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {sourceInfo}
                      </Text>
                    ) : null}
                  </InlineStack>
                  {blueprint && sourceText ? (
                    <Box paddingBlockStart="200" borderColor="border" borderBlockStartWidth="025">
                      <Box paddingBlockStart="300">
                        <BlueprintForm
                          bp={blueprint}
                          onChange={(patch) => setBlueprint((b) => (b ? { ...b, ...patch } : b))}
                          onWrite={writeFromBlueprint}
                          writing={busy === 'write'}
                        />
                      </Box>
                    </Box>
                  ) : null}
                </BlockStack>
              </Card>
            ) : null}
            {/* Tab "Cơ bản": gợi ý nhập thông tin rồi viết (khi tắt quy trình 2 bước). */}
            {!draftParam && genTab === 0 && !pipelineEnabled ? (
              <Banner tone="info">{t('editor.basicHint')}</Banner>
            ) : null}

            {/* Quy trình AI 2 bước: lập khung → viết (bật/tắt ở Cài đặt bài viết).
                Hiện ở tab "Cơ bản" (tạo mới) hoặc khi đang sửa nháp. */}
            {(draftParam ? pipelineEnabled : genTab === 0 && pipelineEnabled) ? (
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

                {pipelineMode === 'auto' ? (
                  <InlineStack>
                    <Button
                      variant="primary"
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
                    label={t('editor.aiProvider')}
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
                    label={t('editor.aiModel')}
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

            <Card>
              <BlockStack gap="400">
                <TextField label={t('publish.fieldTitle')} value={title} onChange={setTitle} autoComplete="off" />
                <TextField
                  label={t('editor.targetKeyword')}
                  value={keyword}
                  onChange={setKeyword}
                  autoComplete="off"
                  helpText={t('editor.keywordAutoHint')}
                />
                <TextField label={t('publish.slug')} value={slug} onChange={setSlug} autoComplete="off" />
                <TextField
                  label={t('publish.metaDescription')}
                  value={meta}
                  onChange={setMeta}
                  multiline={2}
                  autoComplete="off"
                  helpText={`${meta.length}/155`}
                />
                <TextField
                  label={t('publish.tags')}
                  value={tags}
                  onChange={setTags}
                  autoComplete="off"
                  helpText={t('editor.tagsAutoHint')}
                />
                <Box>
                  <Tabs
                    selected={tab}
                    onSelect={setTab}
                    tabs={[
                      { id: 'md', content: t('editor.tabWrite') },
                      { id: 'preview', content: t('editor.tabPreview') },
                    ]}
                  >
                    <Box paddingBlockStart="300">
                      {tab === 0 ? (
                        <TextField
                          label="Markdown"
                          labelHidden
                          value={markdown}
                          onChange={setMarkdown}
                          multiline={18}
                          autoComplete="off"
                          helpText={t('editor.mdHint')}
                        />
                      ) : (
                        <div
                          className="article-preview"
                          dangerouslySetInnerHTML={{
                            __html: coverImageHtml(coverImageUrl) + previewHtml,
                          }}
                        />
                      )}
                    </Box>
                  </Tabs>
                </Box>
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
                    label={t('editor.imgProvider')}
                    options={[
                      { label: t('editor.imgUseSettings'), value: '' },
                      ...imageProviders.map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={imgProvider}
                    onChange={selectImgProvider}
                  />
                  <Select
                    label={t('editor.imgModel')}
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
                <InlineStack gap="200">
                  <Button variant="primary" loading={imgBusy === 'cover'} disabled={imgBusy !== null} onClick={genCover}>
                    {t('editor.genCover')}
                  </Button>
                </InlineStack>
                {coverGallery.length ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t('editor.coverGalleryTitle')}
                    </Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {coverGallery.map((url) => {
                        const active = url === coverImageUrl;
                        return (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setCoverImageUrl(url)}
                            style={{
                              padding: 0,
                              border: active ? '3px solid #5b3ce0' : '1px solid #d7d7d7',
                              borderRadius: 8,
                              overflow: 'hidden',
                              cursor: 'pointer',
                              background: 'none',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="cover option" style={{ width: '100%', display: 'block' }} />
                            <div style={{ fontSize: 11, padding: '2px 4px', color: active ? '#5b3ce0' : '#8a8a8a' }}>
                              {active ? t('editor.selectedCover') : t('editor.useThisCover')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </BlockStack>
                ) : null}

                {/* ẢNH TRONG BÀI - tạo nhiều lần, tích ảnh phù hợp từng mục rồi Chèn */}
                <InlineStack gap="200">
                  <Button loading={imgBusy === 'illustrate'} disabled={imgBusy !== null} onClick={genIllustrations}>
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
                {illusGallery.length ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t('editor.illusGalleryTitle')}
                    </Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {illusGallery.map((it) => {
                        const checked = selectedIllus.has(it.url);
                        return (
                          <div
                            key={it.url}
                            style={{
                              border: checked ? '3px solid #29845a' : '1px solid #d7d7d7',
                              borderRadius: 8,
                              overflow: 'hidden',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={it.url} alt={it.alt} style={{ width: '100%', display: 'block' }} />
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
                      </InlineStack>
                      <InlineStack gap="400" blockAlign="center">
                        <ScoreRing value={aeo.score} />
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t('editor.scoreAeo')}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="400" blockAlign="center">
                        <ScoreRing value={geo.score} />
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t('editor.scoreGeo')}
                        </Text>
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
    </Page>
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
        <Button variant="primary" loading={writing} disabled={writing} onClick={onWrite}>
          {writing ? t('editor.writing') : t('editor.writeFromBp')}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
