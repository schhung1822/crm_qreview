'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MagicIcon, UploadIcon } from '@/components/icons';
import { AiWorking, ScoreRing } from '@/components/ui';
import { markdownToHtml } from '@/lib/content/markdown';

type CheckState = 'pass' | 'warn' | 'fail' | 'info';
type LandingGroup = 'seo' | 'aeo' | 'geo';
interface LandingCheck {
  id: string;
  group: LandingGroup;
  state: CheckState;
  value?: string;
}
interface LandingPatch {
  id: string;
  lang: string;
  content: string;
}
interface Report {
  fetchedAt: string;
  fileName?: string;
  htmlBytes: number;
  checks: LandingCheck[];
  scores: { seo: number; aeo: number; geo: number };
  fixes: LandingPatch[];
  title?: string;
  metaDescription?: string;
}

interface Suggestion {
  area: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  snippet: string;
  snippetLang: string;
}
interface LandingSuggestion {
  summary: string;
  suggestions: Suggestion[];
}

interface FixItem {
  key: string;
  label: string;
  shortFix: string;
  group: string;
  value?: string;
}
interface GuideState {
  loading: boolean;
  text?: string;
  error?: boolean;
}

const GROUPS: LandingGroup[] = ['seo', 'aeo', 'geo'];
const TONE: Record<CheckState, 'success' | 'warning' | 'critical' | 'info'> = {
  pass: 'success',
  warn: 'warning',
  fail: 'critical',
  info: 'info',
};
const MAX_BYTES = 3_000_000;

// Chèn <base href> vào HTML để preview nạp ĐÚNG CSS/JS/ảnh khi đường dẫn là tương đối/gốc-tương đối
// (vd "/style.css", "assets/x.png"). Trình duyệt dùng thẻ <base> ĐẦU TIÊN nên chèn ngay sau <head>.
function withBase(rawHtml: string, base: string): string {
  if (!base) return rawHtml;
  const tag = `<base href="${base.replace(/"/g, '&quot;')}">`;
  if (/<head[^>]*>/i.test(rawHtml)) return rawHtml.replace(/<head[^>]*>/i, (m) => m + tag);
  if (/<html[^>]*>/i.test(rawHtml)) return rawHtml.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `${tag}${rawHtml}`;
}

export default function LandingAuditPage() {
  const t = useTranslations('landingAudit');
  const ta = useTranslations('audit');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [html, setHtml] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState(''); // URL gốc khi lấy từ link → để preview nạp đúng CSS/ảnh
  const [url, setUrl] = useState('');
  const [fetchBusy, setFetchBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  // AI + model để sinh hướng dẫn khắc phục (tái dùng /api/audit/fix-guide).
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);

  const [fixModal, setFixModal] = useState<FixItem | null>(null);
  const [guides, setGuides] = useState<Record<string, GuideState>>({});

  // AI đọc nội dung → đề xuất chỉnh sửa tổng thể (bám sản phẩm/dịch vụ trong trang).
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<LandingSuggestion | null>(null);

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean }> }) => setProviders(d.providers))
      .catch(() => {});
  }, []);

  async function loadModels(provider: string) {
    if (!provider || provider === 'none') {
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
      setAiModels(res.ok && Array.isArray(d.models) ? d.models : []);
    } catch {
      setAiModels([]);
    } finally {
      setModelsBusy(false);
    }
  }
  function selectAiProvider(v: string) {
    setAiProvider(v);
    setAiModel('');
    void loadModels(v);
  }

  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError(t('fileTooLarge'));
      return;
    }
    setError(null);
    const text = await file.text();
    setHtml(text);
    setFileName(file.name);
    setBaseUrl(''); // file cục bộ - không có gốc mạng để nạp CSS/ảnh tương đối
  }

  // Dán link landing → server tải HTML (có chắn SSRF) → đổ vào luồng xem trước + chấm điểm sẵn có.
  async function fetchFromUrl() {
    const u = url.trim();
    if (!u) return;
    setError(null);
    setFetchBusy(true);
    setReport(null);
    setSuggestion(null);
    setSuggestErr(null);
    try {
      const res = await fetch('/api/landing-audit/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const d = await res.json();
      if (res.ok && d.html) {
        setHtml(d.html);
        setFileName(d.fileName || u);
        setBaseUrl(d.finalUrl || u); // gốc để preview nạp CSS/JS/ảnh tương đối từ site thật
      } else setError(d.error ?? t('urlFailed'));
    } catch {
      setError(t('urlFailed'));
    } finally {
      setFetchBusy(false);
    }
  }

  async function loadGuide(item: FixItem, force = false) {
    if (aiProvider === 'none') return;
    if (!force && guides[item.key]?.text) return;
    setGuides((s) => ({ ...s, [item.key]: { loading: true } }));
    try {
      const res = await fetch('/api/audit/fix-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: item.label,
          shortFix: item.shortFix,
          group: item.group,
          value: item.value,
          url: baseUrl || fileName || 'landing page (uploaded HTML file)',
          locale,
          aiProvider,
          ...(aiProvider && aiProvider !== 'none' && aiModel ? { aiModel } : {}),
        }),
      });
      const d = await res.json();
      setGuides((s) => ({
        ...s,
        [item.key]: { loading: false, text: d.guide || undefined, error: res.ok ? !d.guide : true },
      }));
    } catch {
      setGuides((s) => ({ ...s, [item.key]: { loading: false, error: true } }));
    }
  }
  function openGuide(item: FixItem) {
    setFixModal(item);
    void loadGuide(item);
  }

  async function run() {
    if (!html.trim()) {
      setError(t('needFile'));
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    setSuggestion(null);
    setSuggestErr(null);
    try {
      const res = await fetch('/api/landing-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, fileName: fileName || undefined, baseUrl: baseUrl || undefined }),
      });
      const d = await res.json();
      if (res.ok && d.report) setReport(d.report);
      else setError(d.error ?? t('failed'));
    } catch {
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  }

  // AI đọc nội dung landing → hiểu sản phẩm/dịch vụ → đề xuất chỉnh sửa cụ thể.
  async function runSuggest() {
    if (!report) return;
    if (aiProvider === 'none') {
      setSuggestErr(t('suggestNeedAi'));
      return;
    }
    setSuggestBusy(true);
    setSuggestErr(null);
    setSuggestion(null);
    // Điểm yếu = các check fail/warn, dịch sang nhãn dễ hiểu để AI bám vào.
    const weakPoints = report.checks
      .filter((c) => c.state === 'fail' || c.state === 'warn')
      .map((c) => t(`c.${c.id}`));
    try {
      const res = await fetch('/api/landing-audit/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          title: report.title,
          weakPoints,
          locale,
          aiProvider,
          ...(aiProvider && aiProvider !== 'none' && aiModel ? { aiModel } : {}),
        }),
      });
      const d = await res.json();
      if (d.result) setSuggestion(d.result);
      else if (d.needsKey) setSuggestErr(t('suggestNeedAi'));
      else setSuggestErr(d.error ?? t('suggestError'));
    } catch {
      setSuggestErr(t('suggestError'));
    } finally {
      setSuggestBusy(false);
    }
  }

  const tone = (v: number): 'success' | 'attention' | 'warning' => (v >= 80 ? 'success' : v >= 60 ? 'attention' : 'warning');

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            {/* Dán LINK landing → tải nội dung về kiểm tra (nút bên phải ô nhập). */}
            <TextField
              label={t('urlLabel')}
              labelHidden
              value={url}
              onChange={setUrl}
              placeholder={t('urlPlaceholder')}
              autoComplete="off"
              inputMode="url"
              connectedRight={
                <Button
                  onClick={() => void fetchFromUrl()}
                  loading={fetchBusy}
                  disabled={!url.trim()}
                  size="large"
                >
                  {t('urlFetch')}
                </Button>
              }
            />
            <Text as="span" variant="bodySm" tone="subdued" alignment="center">
              {t('urlOr')}
            </Text>

            {/* Input file ẩn — kích hoạt bằng nút "Tải file lên" trên hàng điều khiển. */}
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />

            {/* Nút tải file trên hàng riêng, full-width. Khi có file → tên file căn GIỮA (bỏ icon
                để tên nằm chính giữa ô). */}
            <div
              className="landing-upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              <Button
                icon={fileName ? undefined : UploadIcon}
                onClick={() => fileRef.current?.click()}
                fullWidth
                size="large"
              >
                {fileName || t('dropAction')}
              </Button>
            </div>

            {/* Hàng dưới: AI phân tích · model · chấm điểm. */}
            <InlineGrid columns={{ xs: 1, md: '1fr 1fr auto' }} gap="300" alignItems="end">
              <Select
                label={ta('aiLabel')}
                options={[
                  { label: ta('aiAuto'), value: '' },
                  { label: ta('aiNone'), value: 'none' },
                  ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                ]}
                value={aiProvider}
                onChange={selectAiProvider}
              />
              <Select
                label={ta('aiModel')}
                disabled={!aiProvider || aiProvider === 'none' || modelsBusy}
                options={[
                  { label: modelsBusy ? ta('aiModelLoading') : ta('aiModelDefault'), value: '' },
                  ...aiModels.map((m) => ({ label: m, value: m })),
                ]}
                value={aiModel}
                onChange={setAiModel}
              />
              <Button variant="primary" icon={MagicIcon} loading={busy} disabled={busy} onClick={run} fullWidth>
                {busy ? t('running') : t('run')}
              </Button>
            </InlineGrid>
            <Text as="span" variant="bodySm" tone="subdued">
              {t('aiHint')}
            </Text>

            {/* File đã tải: badge tên + dung lượng + nút Xóa. */}
            {html ? (
              <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="success">{fileName || t('pastedLabel')}</Badge>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('bytesN', { n: Math.max(1, Math.round(html.length / 1024)) })}
                  </Text>
                </InlineStack>
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => {
                    setHtml('');
                    setFileName('');
                    setBaseUrl('');
                    setError(null);
                  }}
                >
                  {tc('delete')}
                </Button>
              </InlineStack>
            ) : null}

            {error ? <Banner tone="critical">{error}</Banner> : null}
          </BlockStack>
        </Card>

        {/* Xem trước NGAY khi tải file (không cần bấm chấm). iframe sandbox="allow-scripts"
            (KHÔNG allow-same-origin) → JS chạy để xem thật nhưng cô lập khỏi phiên đăng nhập. */}
        {html ? (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  {t('previewTitle')}
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('previewHint')}
                </Text>
              </InlineStack>
              <iframe
                title={t('previewTitle')}
                srcDoc={baseUrl ? withBase(html, baseUrl) : html}
                sandbox="allow-scripts"
                style={{
                  width: '100%',
                  height: 520,
                  border: '1px solid var(--p-color-border)',
                  borderRadius: 8,
                  background: '#fff',
                }}
              />
            </BlockStack>
          </Card>
        ) : null}

        {busy ? <AiWorking text={t('running')} progress="indeterminate" /> : null}

        {report ? (
          <>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingSm">
                      {t('resultTitle')}
                    </Text>
                    {report.fileName ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {report.fileName}
                      </Text>
                    ) : null}
                    {report.title ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {report.title}
                      </Text>
                    ) : null}
                  </BlockStack>
                  <InlineStack gap="400" blockAlign="center">
                    <ScoreCol label={t('scoreSeo')} value={report.scores.seo} tone={tone} />
                    <ScoreCol label={t('scoreAeo')} value={report.scores.aeo} tone={tone} />
                    <ScoreCol label={t('scoreGeo')} value={report.scores.geo} tone={tone} />
                  </InlineStack>
                </InlineStack>
                <Banner tone="info">{t('naNote')}</Banner>
              </BlockStack>
            </Card>

            {/* AI đọc nội dung landing → hiểu sản phẩm/dịch vụ → đề xuất chỉnh sửa cụ thể. */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingSm">
                      {t('suggestTitle')}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {t('suggestHint')}
                    </Text>
                  </BlockStack>
                  <Button variant="primary" icon={MagicIcon} loading={suggestBusy} disabled={suggestBusy} onClick={runSuggest}>
                    {t('suggestBtn')}
                  </Button>
                </InlineStack>

                {suggestBusy ? <AiWorking text={t('suggestRunning')} progress="indeterminate" /> : null}
                {suggestErr ? <Banner tone="critical">{suggestErr}</Banner> : null}

                {suggestion ? (
                  <BlockStack gap="300">
                    {suggestion.summary ? (
                      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                        <Text as="p" variant="bodySm">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {t('suggestSummary')}:{' '}
                          </Text>
                          {suggestion.summary}
                        </Text>
                      </Box>
                    ) : null}
                    {suggestion.suggestions.length ? (
                      <BlockStack gap="200">
                        {suggestion.suggestions.map((s, i) => (
                          <SuggestRow key={i} item={s} />
                        ))}
                      </BlockStack>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t('suggestEmpty')}
                      </Text>
                    )}
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Card>

            {GROUPS.map((g) => {
              const list = report.checks.filter((c) => c.group === g);
              if (!list.length) return null;
              const fails = list.filter((c) => c.state === 'fail' || c.state === 'warn').length;
              return (
                <Card key={g}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingSm">
                        {t(`group.${g}`)}
                      </Text>
                      <Badge tone={fails === 0 ? 'success' : 'attention'}>{ta('issuesN', { n: fails })}</Badge>
                    </InlineStack>
                    <BlockStack gap="200">
                      {list.map((c) => (
                        <CheckRow key={c.id} check={c} onDetail={openGuide} />
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              );
            })}

            {report.fixes.length ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {ta('fixesTitle')}
                  </Text>
                  {report.fixes.map((p) => (
                    <PatchBlock key={p.id} patch={p} />
                  ))}
                </BlockStack>
              </Card>
            ) : null}
          </>
        ) : null}
      </BlockStack>

      <Modal
        open={!!fixModal}
        onClose={() => setFixModal(null)}
        title={fixModal ? `${ta('fixDetailTitle')}: ${fixModal.label}` : ''}
        secondaryActions={[{ content: ta('close'), onAction: () => setFixModal(null) }]}
      >
        <Modal.Section>
          {fixModal
            ? (() => {
                const gs = guides[fixModal.key];
                return (
                  <BlockStack gap="300">
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <Text as="p" variant="bodySm">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {ta('fixLabel')}:{' '}
                        </Text>
                        {fixModal.shortFix}
                      </Text>
                    </Box>
                    {aiProvider === 'none' ? (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {ta('guideAiOff')}
                      </Text>
                    ) : gs?.loading ? (
                      <AiWorking text={ta('guideLoading')} progress="indeterminate" />
                    ) : gs?.text ? (
                      <div
                        className="md-guide"
                        style={{ fontSize: 14, lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(gs.text) }}
                      />
                    ) : gs?.error ? (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="critical">
                          {ta('guideError')}
                        </Text>
                        <Button variant="plain" icon={MagicIcon} onClick={() => void loadGuide(fixModal, true)}>
                          {ta('retry')}
                        </Button>
                      </InlineStack>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {ta('guideNone')}
                      </Text>
                    )}
                  </BlockStack>
                );
              })()
            : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function ScoreCol({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: (v: number) => 'success' | 'attention' | 'warning';
}) {
  return (
    <BlockStack gap="100" inlineAlign="center">
      <ScoreRing value={value} />
      <Badge tone={tone(value)}>{label}</Badge>
    </BlockStack>
  );
}

function SuggestRow({ item }: { item: Suggestion }) {
  const tc = useTranslations('common');
  const ta = useTranslations('audit');
  const [copied, setCopied] = useState(false);
  const tone: Record<Suggestion['priority'], 'critical' | 'warning' | 'info'> = {
    high: 'critical',
    medium: 'warning',
    low: 'info',
  };
  const plabel: Record<Suggestion['priority'], string> = {
    high: tc('high'),
    medium: tc('medium'),
    low: tc('low'),
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard có thể bị chặn */
    }
  };
  const snippet = item.snippet?.trim();
  return (
    <Box borderColor="border" borderWidth="025" borderRadius="200" padding="300">
      <BlockStack gap="150">
        <InlineStack gap="200" blockAlign="center" wrap>
          <Badge tone={tone[item.priority]}>{plabel[item.priority]}</Badge>
          <Text as="span" variant="bodySm" fontWeight="semibold">
            {item.area}
          </Text>
        </InlineStack>
        <Text as="p" variant="bodySm">
          {item.recommendation}
        </Text>
        {snippet ? (
          <Box background="bg-surface-secondary" borderRadius="200" padding="200">
            <BlockStack gap="150">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Badge>{item.snippetLang || 'text'}</Badge>
                <Button size="slim" onClick={copy}>
                  {copied ? ta('copied') : ta('copy')}
                </Button>
              </InlineStack>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  background: '#f6f6f7',
                  borderRadius: 8,
                  overflowX: 'auto',
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                <code>{snippet}</code>
              </pre>
            </BlockStack>
          </Box>
        ) : null}
      </BlockStack>
    </Box>
  );
}

function CheckRow({ check, onDetail }: { check: LandingCheck; onDetail: (item: FixItem) => void }) {
  const t = useTranslations('landingAudit');
  const ta = useTranslations('audit');
  const showFix = check.state === 'fail' || check.state === 'warn';
  const label = t(`c.${check.id}`);
  const shortFix = t(`fix.${check.id}`);
  return (
    <Box paddingBlockStart="100" paddingBlockEnd="100" borderBlockEndWidth="025" borderColor="border">
      <BlockStack gap="050">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <div style={{ width: 96, flex: 'none', whiteSpace: 'nowrap' }}>
            <Badge tone={TONE[check.state]}>{ta(`state.${check.state}`)}</Badge>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text as="span" variant="bodySm">
              {label}
              {check.value ? (
                <Text as="span" tone="subdued">
                  {' '}
                  - {check.value}
                </Text>
              ) : null}
            </Text>
          </div>
          {showFix ? (
            <div style={{ flex: 'none' }}>
              <Button
                size="slim"
                icon={MagicIcon}
                onClick={() =>
                  onDetail({
                    key: `check:${check.id}`,
                    label,
                    shortFix,
                    group: check.group,
                    value: check.value,
                  })
                }
              >
                {ta('fixDetail')}
              </Button>
            </div>
          ) : null}
        </InlineStack>
        {showFix ? (
          <Box paddingInlineStart="600" paddingBlockStart="050">
            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
              <Text as="p" variant="bodySm">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {ta('fixLabel')}:{' '}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {shortFix}
                </Text>
              </Text>
            </Box>
          </Box>
        ) : null}
      </BlockStack>
    </Box>
  );
}

function PatchBlock({ patch }: { patch: LandingPatch }) {
  const t = useTranslations('landingAudit');
  const ta = useTranslations('audit');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(patch.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard có thể bị chặn */
    }
  };
  return (
    <Box borderColor="border" borderWidth="025" borderRadius="200" padding="300">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" wrap={false}>
          <Text as="h3" variant="headingSm">
            {t(`patch.${patch.id}`)}
          </Text>
          <InlineStack gap="200" blockAlign="center">
            <Badge>{patch.lang}</Badge>
            <Button size="slim" onClick={copy}>
              {copied ? ta('copied') : ta('copy')}
            </Button>
          </InlineStack>
        </InlineStack>
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: '#f6f6f7',
            borderRadius: 8,
            overflowX: 'auto',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <code>{patch.content}</code>
        </pre>
      </BlockStack>
    </Box>
  );
}
