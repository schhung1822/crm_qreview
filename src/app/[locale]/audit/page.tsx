'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AiWorking, ScoreRing } from '@/components/ui';
import { markdownToHtml } from '@/lib/content/markdown';

// Một mục cần hướng dẫn khắc phục (check lỗi/cảnh báo, hoặc tip tốc độ).
interface FixItem {
  key: string; // khóa cache duy nhất
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

type CheckState = 'pass' | 'warn' | 'fail' | 'info';
type CheckGroup = 'ai' | 'seo' | 'onpage' | 'aeo' | 'perf';
interface AuditCheck {
  id: string;
  group: CheckGroup;
  state: CheckState;
  value?: string;
}
interface AuditPatch {
  id: string;
  lang: string;
  content: string;
}
interface Report {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  checks: AuditCheck[];
  scores: { seo: number; aeo: number; geo: number };
  pages: Array<{ url: string; seo: number; aeo: number; geo: number; desc?: string }>;
  pagesScanned: number;
  notes: string[];
  fixes: AuditPatch[];
  connection?: { id: string; label: string; provider: string };
  performance?: { mobile?: Strat; desktop?: Strat };
}
interface PsMetric {
  value: string;
  score?: number;
}
interface Strat {
  scores: { performance?: number; accessibility?: number; bestPractices?: number; seo?: number };
  metrics: { fcp?: PsMetric; lcp?: PsMetric; tbt?: PsMetric; cls?: PsMetric; si?: PsMetric; tti?: PsMetric };
  field?: { category?: 'FAST' | 'AVERAGE' | 'SLOW'; lcp?: number; inp?: number; cls?: number };
}

const GROUPS: CheckGroup[] = ['ai', 'seo', 'aeo', 'onpage', 'perf'];
const TONE: Record<CheckState, 'success' | 'warning' | 'critical' | 'info'> = {
  pass: 'success',
  warn: 'warning',
  fail: 'critical',
  info: 'info',
};

export default function AuditPage() {
  const t = useTranslations('audit');
  const locale = useLocale();
  const [url, setUrl] = useState('');
  const [pages, setPages] = useState('12');
  const [quality, setQuality] = useState('55');
  const [perf, setPerf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  // AI + model để phân tích (mô tả cho llms.txt + trang đã chấm điểm).
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);

  // Popup hướng dẫn khắc phục chi tiết (sinh bằng AI đã chọn ở form).
  const [fixModal, setFixModal] = useState<FixItem | null>(null);
  const [guides, setGuides] = useState<Record<string, GuideState>>({});
  // Popup khi bấm "Sửa bằng AI" mà website chưa kết nối CMS.
  const [notConnOpen, setNotConnOpen] = useState(false);

  async function loadGuide(item: FixItem, force = false) {
    if (aiProvider === 'none') return; // người dùng tắt AI → chỉ hiện gợi ý ngắn
    if (!force && guides[item.key]?.text) return; // đã có
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
          url: report?.finalUrl ?? url,
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

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean }> }) => setProviders(d.providers))
      .catch(() => {});
  }, []);

  // Khôi phục kết quả kiểm tra + thiết lập lần trước khi QUAY LẠI trang (back từ trình sửa)
  // → không mất dữ liệu đã quét. Lưu ở sessionStorage (chỉ trong tab hiện tại).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('audit_state');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.url) setUrl(s.url);
      if (s.pages) setPages(s.pages);
      if (s.quality) setQuality(s.quality);
      if (typeof s.perf === 'boolean') setPerf(s.perf);
      if (typeof s.aiProvider === 'string') {
        setAiProvider(s.aiProvider);
        if (s.aiProvider && s.aiProvider !== 'none') void loadModels(s.aiProvider);
      }
      if (s.aiModel) setAiModel(s.aiModel);
      if (s.report) setReport(s.report);
    } catch {
      /* dữ liệu hỏng/không đọc được → bỏ qua, coi như chưa quét */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lưu lại mỗi khi có báo cáo (và khi đổi thiết lập) để back là còn nguyên.
  useEffect(() => {
    if (!report) return;
    try {
      sessionStorage.setItem(
        'audit_state',
        JSON.stringify({ url, pages, quality, perf, aiProvider, aiModel, report }),
      );
    } catch {
      /* vượt quota / không serialize được → bỏ qua, chỉ mất khả năng khôi phục */
    }
  }, [report, url, pages, quality, perf, aiProvider, aiModel]);

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

  async function run() {
    if (!url.trim()) {
      setError(t('needUrl'));
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          maxPages: Number(pages),
          performance: perf,
          llmsMinScore: Number(quality),
          aiProvider,
          ...(aiProvider && aiProvider !== 'none' && aiModel ? { aiModel } : {}),
        }),
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

  const tone = (v: number): 'success' | 'attention' | 'warning' => (v >= 80 ? 'success' : v >= 60 ? 'attention' : 'warning');

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <TextField
              label={t('urlLabel')}
              value={url}
              onChange={setUrl}
              autoComplete="off"
              placeholder="https://example.com"
              type="url"
            />
            <InlineGrid columns={{ xs: 2, md: '1fr 1fr 1fr auto' }} gap="300" alignItems="end">
              <Select
                label={t('pagesLabel')}
                options={['5', '12', '20', '25'].map((n) => ({ label: t('pagesN', { n }), value: n }))}
                value={pages}
                onChange={setPages}
              />
              <Select
                label={t('qualityLabel')}
                options={[
                  { label: t('qHigh'), value: '70' },
                  { label: t('qMedium'), value: '55' },
                  { label: t('qLow'), value: '40' },
                  { label: t('qAll'), value: '0' },
                ]}
                value={quality}
                onChange={setQuality}
              />
              <Checkbox label={t('perfLabel')} checked={perf} onChange={setPerf} helpText={t('perfHint')} />
            </InlineGrid>

            <BlockStack gap="100">
              <InlineGrid columns={{ xs: 2, md: '1fr 1fr auto' }} gap="300" alignItems="end">
                <Select
                  label={t('aiLabel')}
                  options={[
                    { label: t('aiAuto'), value: '' },
                    { label: t('aiNone'), value: 'none' },
                    ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                  ]}
                  value={aiProvider}
                  onChange={selectAiProvider}
                />
                <Select
                  label={t('aiModel')}
                  disabled={!aiProvider || aiProvider === 'none' || modelsBusy}
                  options={[
                    { label: modelsBusy ? t('aiModelLoading') : t('aiModelDefault'), value: '' },
                    ...aiModels.map((m) => ({ label: m, value: m })),
                  ]}
                  value={aiModel}
                  onChange={setAiModel}
                />
                <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
                  {busy ? t('running') : t('run')}
                </Button>
              </InlineGrid>
              <Text as="span" variant="bodySm" tone="subdued">
                {t('aiHint')}
              </Text>
            </BlockStack>
            {error ? <Banner tone="critical">{error}</Banner> : null}
          </BlockStack>
        </Card>

        {busy ? <AiWorking text={t('running')} progress="indeterminate" /> : null}

        {report ? (
          <>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingSm">
                      {t('reportFor')}
                    </Text>
                    <a
                      href={report.finalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--p-color-text-link)' }}
                    >
                      {report.finalUrl}
                    </a>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {t('pagesScanned', { n: report.pagesScanned })}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="400" blockAlign="center">
                    <ScoreCol label={t('scoreSeo')} value={report.scores.seo} tone={tone} />
                    <ScoreCol label={t('scoreAeo')} value={report.scores.aeo} tone={tone} />
                    <ScoreCol label={t('scoreGeo')} value={report.scores.geo} tone={tone} />
                  </InlineStack>
                </InlineStack>
                {report.notes.map((n) => (
                  <Banner key={n} tone="info">
                    {t(`note.${n}`)}
                  </Banner>
                ))}
              </BlockStack>
            </Card>

            {report.connection ? (
              <Banner tone="success" title={t('connectedTitle', { label: report.connection.label })}>
                {t('connectedBody')}
              </Banner>
            ) : null}

            {report.performance && (report.performance.mobile || report.performance.desktop) ? (
              <PerfReport perf={report.performance} onDetail={openGuide} />
            ) : null}

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
                      <Badge tone={fails === 0 ? 'success' : 'attention'}>
                        {t('issuesN', { n: fails })}
                      </Badge>
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
                    {t('fixesTitle')}
                  </Text>
                  {report.fixes.map((p) => (
                    <PatchBlock key={p.id} patch={p} />
                  ))}
                </BlockStack>
              </Card>
            ) : null}

            {report.pages.length ? (
              <Card padding="0">
                <Box padding="400" paddingBlockEnd="200">
                  <Text as="h2" variant="headingSm">
                    {t('sampledPages')}
                  </Text>
                </Box>
                <PagesTable
                  pages={report.pages}
                  connection={report.connection}
                  locale={locale}
                  onNotConnected={() => setNotConnOpen(true)}
                />
              </Card>
            ) : null}
          </>
        ) : null}
      </BlockStack>

      <Modal
        open={!!fixModal}
        onClose={() => setFixModal(null)}
        title={fixModal ? `${t('fixDetailTitle')}: ${fixModal.label}` : ''}
        secondaryActions={[{ content: t('close'), onAction: () => setFixModal(null) }]}
      >
        <Modal.Section>
          {fixModal
            ? (() => {
                const g = guides[fixModal.key];
                return (
                  <BlockStack gap="300">
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <Text as="p" variant="bodySm">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {t('fixLabel')}:{' '}
                        </Text>
                        {fixModal.shortFix}
                      </Text>
                    </Box>
                    {aiProvider === 'none' ? (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t('guideAiOff')}
                      </Text>
                    ) : g?.loading ? (
                      <AiWorking text={t('guideLoading')} />
                    ) : g?.text ? (
                      <div
                        className="md-guide"
                        style={{ fontSize: 14, lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(g.text) }}
                      />
                    ) : g?.error ? (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodySm" tone="critical">
                          {t('guideError')}
                        </Text>
                        <Button variant="plain" onClick={() => void loadGuide(fixModal, true)}>
                          {t('retry')}
                        </Button>
                      </InlineStack>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {t('guideNone')}
                      </Text>
                    )}
                  </BlockStack>
                );
              })()
            : null}
        </Modal.Section>
      </Modal>

      <Modal
        open={notConnOpen}
        onClose={() => setNotConnOpen(false)}
        title={t('notConnectedTitle')}
        primaryAction={{ content: t('goConnect'), url: `/${locale}/connections` }}
        secondaryActions={[{ content: t('close'), onAction: () => setNotConnOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            {t('notConnectedBody')}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function ScoreCol({ label, value, tone }: { label: string; value: number; tone: (v: number) => 'success' | 'attention' | 'warning' }) {
  return (
    <BlockStack gap="100" inlineAlign="center">
      <ScoreRing value={value} />
      <Badge tone={tone(value)}>{label}</Badge>
    </BlockStack>
  );
}

function PatchBlock({ patch }: { patch: AuditPatch }) {
  const t = useTranslations('audit');
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
              {copied ? t('copied') : t('copy')}
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

function ScoreCell({ value }: { value: number }) {
  const tone: 'success' | 'critical' | undefined =
    value >= 80 ? 'success' : value >= 50 ? undefined : 'critical';
  return (
    <Text as="span" variant="bodySm" fontWeight="medium" tone={tone}>
      {value}
    </Text>
  );
}

function PagesTable({
  pages,
  connection,
  locale,
  onNotConnected,
}: {
  pages: Report['pages'];
  connection?: Report['connection'];
  locale: string;
  onNotConnected: () => void;
}) {
  const t = useTranslations('audit');
  const hasDesc = pages.some((p) => p.desc);

  // Cột hành động LUÔN hiển thị (dạng 'numeric' → canh phải, cân đối với SEO/AEO/GEO).
  const columnContentTypes: ('text' | 'numeric')[] = [
    'text',
    'numeric',
    'numeric',
    'numeric',
    ...(hasDesc ? (['text'] as const) : []),
    'numeric',
  ];
  const headings = [
    t('thPage'),
    'SEO',
    'AEO',
    'GEO',
    ...(hasDesc ? [t('thDesc')] : []),
    t('thAction'),
  ];
  const rows = pages.map((p) => {
    let path = p.url;
    try {
      path = new URL(p.url).pathname || '/';
    } catch {
      /* giữ nguyên url nếu không phân tích được */
    }
    const cells: React.ReactNode[] = [
      // Bọc link để cắt gọn URL dài (ellipsis) → cột Trang không đẩy bảng quá rộng.
      <div
        key="link"
        style={{ maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--p-color-text-link)', textDecoration: 'none' }}
        >
          {path}
        </a>
      </div>,
      <ScoreCell key="seo" value={p.seo} />,
      <ScoreCell key="aeo" value={p.aeo} />,
      <ScoreCell key="geo" value={p.geo} />,
    ];
    if (hasDesc) {
      cells.push(
        <Text key="desc" as="span" variant="bodySm" tone="subdued">
          {p.desc || '-'}
        </Text>,
      );
    }
    // Đã kết nối CMS → mở đúng bài trong trình soạn thảo (tối ưu bài cũ: AI sửa → diff → cập nhật).
    // Chưa kết nối → popup báo website chưa kết nối, kèm lối tắt sang Kết nối CMS.
    cells.push(
      connection ? (
        <Button
          key="fix"
          size="slim"
          url={`/${locale}/optimize?conn=${connection.id}&url=${encodeURIComponent(p.url)}`}
        >
          {t('fixWithAi')}
        </Button>
      ) : (
        <Button key="fix" size="slim" onClick={onNotConnected}>
          {t('fixWithAi')}
        </Button>
      ),
    );
    return cells;
  });

  return (
    <DataTable columnContentTypes={columnContentTypes} headings={headings} rows={rows} truncate />
  );
}

function CheckRow({ check, onDetail }: { check: AuditCheck; onDetail: (item: FixItem) => void }) {
  const t = useTranslations('audit');
  const showFix = check.state === 'fail' || check.state === 'warn';
  const label = t(`c.${check.id}`);
  const shortFix = t(`fix.${check.id}`);
  return (
    <Box paddingBlockStart="100" paddingBlockEnd="100" borderBlockEndWidth="025" borderColor="border">
      <BlockStack gap="050">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <div style={{ width: 96, flex: 'none', whiteSpace: 'nowrap' }}>
            <Badge tone={TONE[check.state]}>{t(`state.${check.state}`)}</Badge>
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
                {t('fixDetail')}
              </Button>
            </div>
          ) : null}
        </InlineStack>
        {showFix ? (
          <Box paddingInlineStart="600" paddingBlockStart="050">
            <Box background="bg-surface-secondary" padding="200" borderRadius="200">
              <Text as="p" variant="bodySm">
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {t('fixLabel')}:{' '}
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

function PerfRing({ label, value }: { label: string; value?: number }) {
  const tone: 'success' | 'attention' | 'critical' =
    value == null ? 'critical' : value >= 90 ? 'success' : value >= 50 ? 'attention' : 'critical';
  return (
    <BlockStack gap="100" inlineAlign="center">
      <ScoreRing value={value ?? 0} />
      <Badge tone={tone}>{label}</Badge>
    </BlockStack>
  );
}

const PERF_METRICS: Array<[keyof Strat['metrics'], string]> = [
  ['fcp', 'First Contentful Paint'],
  ['lcp', 'Largest Contentful Paint'],
  ['tbt', 'Total Blocking Time'],
  ['cls', 'Cumulative Layout Shift'],
  ['si', 'Speed Index'],
  ['tti', 'Time to Interactive'],
];

// Báo cáo tốc độ đầy đủ kiểu PageSpeed: 4 điểm Lighthouse + chỉ số lab + CrUX, tab DĐ/MT.
function PerfReport({
  perf,
  onDetail,
}: {
  perf: { mobile?: Strat; desktop?: Strat };
  onDetail: (item: FixItem) => void;
}) {
  const t = useTranslations('audit');
  const [tab, setTab] = useState(perf.mobile ? 0 : 1);
  const cur = tab === 0 ? perf.mobile : perf.desktop;
  const catLabel: Record<string, string> = {
    performance: t('catPerformance'),
    accessibility: t('catAccessibility'),
    bestPractices: t('catBestPractices'),
    seo: t('catSeo'),
  };
  const dot = (s?: number) => (s == null ? '#9aa5b1' : s >= 0.9 ? '#0a7c3f' : s >= 0.5 ? '#b98900' : '#d12e2e');
  const fieldTone = (c?: string): 'success' | 'warning' | 'critical' =>
    c === 'FAST' ? 'success' : c === 'AVERAGE' ? 'warning' : 'critical';
  const fieldLabel = (c?: string) => (c === 'FAST' ? t('fieldFast') : c === 'AVERAGE' ? t('fieldAvg') : t('fieldSlow'));
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h2" variant="headingSm">
            {t('perfTitle')}
          </Text>
          <Box minWidth="220px">
            <Tabs
              selected={tab}
              onSelect={setTab}
              fitted
              tabs={[
                { id: 'ps-m', content: t('perfTabMobile') },
                { id: 'ps-d', content: t('perfTabDesktop') },
              ]}
            />
          </Box>
        </InlineStack>

        {cur ? (
          <BlockStack gap="400">
            <InlineStack gap="500" wrap align="center">
              <PerfRing label={t('catPerformance')} value={cur.scores.performance} />
              <PerfRing label={t('catAccessibility')} value={cur.scores.accessibility} />
              <PerfRing label={t('catBestPractices')} value={cur.scores.bestPractices} />
              <PerfRing label={t('catSeo')} value={cur.scores.seo} />
            </InlineStack>

            {(() => {
              const tips: Array<[string, string]> = [];
              if ((cur.scores.performance ?? 100) < 90) tips.push(['performance', t('perfFix.performance')]);
              if ((cur.scores.accessibility ?? 100) < 90) tips.push(['accessibility', t('perfFix.accessibility')]);
              if ((cur.scores.bestPractices ?? 100) < 90) tips.push(['bestPractices', t('perfFix.bestPractices')]);
              if ((cur.scores.seo ?? 100) < 90) tips.push(['seo', t('perfFix.seo')]);
              return tips.length ? (
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="span" fontWeight="semibold" variant="bodySm">
                      {t('perfFixTitle')}
                    </Text>
                    {tips.map(([k, tip]) => (
                      <InlineStack key={k} gap="200" blockAlign="start" wrap={false}>
                        <div style={{ flex: 1 }}>
                          <Text as="span" variant="bodySm" tone="subdued">
                            • {tip}
                          </Text>
                        </div>
                        <Button
                          variant="plain"
                          onClick={() =>
                            onDetail({
                              key: `perf:${tab === 0 ? 'm' : 'd'}:${k}`,
                              label: catLabel[k] ?? k,
                              shortFix: tip,
                              group: 'perf',
                              value:
                                cur.scores[k as keyof Strat['scores']] != null
                                  ? `${cur.scores[k as keyof Strat['scores']]}/100`
                                  : undefined,
                            })
                          }
                        >
                          {t('fixDetail')}
                        </Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </Box>
              ) : null;
            })()}

            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="span" fontWeight="semibold" variant="bodySm">
                  {t('fieldTitle')}:
                </Text>
                {cur.field?.category ? (
                  <>
                    <Badge tone={fieldTone(cur.field.category)}>{fieldLabel(cur.field.category)}</Badge>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {[
                        cur.field.lcp ? `LCP ${(cur.field.lcp / 1000).toFixed(1)}s` : '',
                        cur.field.inp != null ? `INP ${cur.field.inp}ms` : '',
                        cur.field.cls != null ? `CLS ${cur.field.cls.toFixed(2)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </>
                ) : (
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('fieldNone')}
                  </Text>
                )}
              </InlineStack>
            </Box>

            <BlockStack gap="200">
              <Text as="span" fontWeight="semibold" variant="bodySm" tone="subdued">
                {t('labMetrics')}
              </Text>
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="200">
                {PERF_METRICS.map(([k, name]) => {
                  const mm = cur.metrics[k];
                  return (
                    <InlineStack key={k} gap="200" blockAlign="center" wrap={false}>
                      <span
                        style={{ width: 9, height: 9, borderRadius: 9, background: dot(mm?.score), flex: 'none' }}
                      />
                      <Text as="span" variant="bodySm">
                        {name}:{' '}
                        <Text as="span" fontWeight="semibold">
                          {mm?.value ?? '-'}
                        </Text>
                      </Text>
                    </InlineStack>
                  );
                })}
              </InlineGrid>
            </BlockStack>
          </BlockStack>
        ) : (
          <Text as="p" tone="subdued">
            -
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
