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
  InlineStack,
  Page,
  ProgressBar,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AiWorking } from '@/components/ui';
import { MagicIcon } from '@/components/icons';
import { HelpLabel, InfoHint } from '@/components/InfoHint';

const PRIORITY_TONE = { high: 'critical', medium: 'warning', low: undefined } as const;

interface PlanItem {
  title: string;
  target: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  isPillar?: boolean;
  slug?: string;
  cluster?: string;
}

interface Plan {
  id: string;
  seed: string;
  locale: string;
  title: string;
  items: PlanItem[];
}
interface Created {
  id: string;
  title: string;
}
interface GenCounts {
  total: number;
  queued: number;
  running: number;
  done: number;
  error: number;
}

export default function PlanPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [allPlans, setAllPlans] = useState<
    Array<{ id: string; seed: string; title: string; locale: string; createdAt: string; items: PlanItem[] }>
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false); // vòng lặp tạo bài hàng loạt đang chạy
  const [genCounts, setGenCounts] = useState<GenCounts | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  // Map "locale|targetKeyword" → bài đã có (để hiện trạng thái viết/đăng).
  const [articleByKey, setArticleByKey] = useState<
    Map<string, { id: string; status: string; publishedUrl?: string }>
  >(new Map());

  const planId = params.get('id');

  const loadArticles = useCallback(() => {
    fetch('/api/articles/draft')
      .then((r) => r.json())
      .then(
        (d: {
          articles?: Array<{
            id: string;
            locale: string;
            status: string;
            targetKeyword?: string;
            publishedUrl?: string;
          }>;
        }) => {
          const m = new Map<string, { id: string; status: string; publishedUrl?: string }>();
          for (const a of d.articles ?? []) {
            if (!a.targetKeyword) continue;
            const key = `${a.locale}|${a.targetKeyword.trim().toLowerCase()}`;
            // bài mới nhất (list sort desc)
            if (!m.has(key)) m.set(key, { id: a.id, status: a.status, publishedUrl: a.publishedUrl });
          }
          setArticleByKey(m);
        },
      )
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadArticles();
  }, [loadArticles, plan]);

  // Hàng đợi tạo bài hàng loạt (bền - khôi phục sau reload).
  const loadGenJobs = useCallback(() => {
    fetch('/api/gen-jobs')
      .then((r) => r.json())
      .then((d: { counts?: GenCounts }) => setGenCounts(d.counts ?? null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadGenJobs();
  }, [loadGenJobs]);

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    // Không có id → ở chế độ DANH SÁCH project (không tự mở plan mới nhất).
    if (!planId) {
      setPlan(null);
      setLoadingPlan(false);
      return;
    }
    try {
      const res = await fetch(`/api/plans?id=${planId}`);
      const data = await res.json();
      setPlan(data.plan ?? null);
    } catch {
      setPlan(null);
    } finally {
      setLoadingPlan(false);
    }
  }, [planId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const loadAllPlans = useCallback(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then((d: { plans?: typeof allPlans }) => {
        const list = d.plans ?? [];
        setAllPlans(list);
        setSelected((prev) => new Set([...prev].filter((id) => list.some((x) => x.id === id))));
      })
      .catch(() => setAllPlans([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadAllPlans();
  }, [loadAllPlans, plan]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0 || !window.confirm(t('plan.deleteConfirmN', { n: selected.size }))) return;
    setDeleting(true);
    try {
      for (const id of selected) {
        await fetch(`/api/plans?id=${id}`, { method: 'DELETE' });
      }
      setSelected(new Set());
      loadAllPlans();
    } finally {
      setDeleting(false);
    }
  }

  async function removePlan() {
    if (!plan || !window.confirm(t('plan.confirmDelete'))) return;
    await fetch(`/api/plans?id=${plan.id}`, { method: 'DELETE' });
    router.push(`/${locale}/plan`);
    router.refresh();
  }

  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ hasKey: boolean; enabled: boolean }> }) =>
        setAiReady(d.providers.some((p) => p.hasKey && p.enabled)),
      )
      .catch(() => setAiReady(false));
  }, []);

  // Internal link theo mô hình Pillar–Cluster — CHỈ liên kết tới bài ĐÃ ĐĂNG và CÓ URL thật.
  // Bài chưa viết / mới lưu nháp (chưa lên web) → KHÔNG chèn link (tránh internal link chết).
  // Dùng chính publishedUrl (URL thật trên site) thay vì đoán slug; kèm utm_source thay khi đăng.
  function linksFor(item: PlanItem): Array<{ anchor: string; url: string }> {
    if (!plan) return [];
    const withUtm = (u: string) => u + (u.includes('?') ? '&' : '?') + 'utm_source={{website}}';
    // Trả link nếu bài đã ĐĂNG và có publishedUrl; ngược lại null (bỏ qua).
    const linkTo = (it: PlanItem): { anchor: string; url: string } | null => {
      const st = statusFor(it);
      if (!st || st.status !== 'published' || !st.publishedUrl) return null;
      return { anchor: it.title, url: withUtm(st.publishedUrl) };
    };
    const notNull = (x: { anchor: string; url: string } | null): x is { anchor: string; url: string } =>
      x !== null;
    const pillar = plan.items.find((i) => i.isPillar);
    if (item.isPillar) {
      // Bài trụ → liên kết XUỐNG các bài vệ tinh (đã đăng).
      return plan.items.filter((i) => !i.isPillar).map(linkTo).filter(notNull).slice(0, 6);
    }
    // Vệ tinh → link LÊN bài trụ + các vệ tinh CÙNG cụm (đã đăng).
    const sibs = plan.items
      .filter((i) => !i.isPillar && i.cluster === item.cluster && i.target !== item.target)
      .map(linkTo)
      .filter(notNull)
      .slice(0, 3);
    const pillarLink = pillar ? linkTo(pillar) : null;
    return [...(pillarLink ? [pillarLink] : []), ...sibs];
  }

  async function autoWrite(item: PlanItem): Promise<Created | null> {
    const res = await fetch('/api/articles/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        targetKeyword: item.target,
        locale: plan?.locale ?? locale,
        internalLinks: linksFor(item),
      }),
    });
    const data = await res.json();
    return data.ok && data.draft ? { id: data.draft.id, title: data.draft.title } : null;
  }

  async function writeOne(item: PlanItem, tag: string) {
    if (aiReady === false) return;
    setBusy(tag);
    try {
      const c = await autoWrite(item);
      if (c) router.push(`/${locale}/editor?draft=${c.id}`);
    } finally {
      setBusy(null);
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Lặp gọi worker (1 bài/lần) tới khi hết hàng đợi. Chạy được KHÔNG cần cron ngoài.
  async function drainLoop() {
    for (;;) {
      const res = await fetch('/api/gen-jobs/run', { method: 'POST' });
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
      const d = (await res.json().catch(() => null)) as { processed?: boolean; counts?: GenCounts } | null;
      if (!d) break;
      if (d.counts) setGenCounts(d.counts);
      if (!d.processed) break; // hết việc
    }
  }

  async function runQueue(before?: () => Promise<boolean>) {
    if (genBusy) return;
    setGenBusy(true);
    setGenMsg(null);
    try {
      if (before && !(await before())) return;
      await drainLoop();
    } catch {
      setGenMsg(t('plan.queueError'));
    } finally {
      setGenBusy(false);
      loadArticles();
      loadGenJobs();
    }
  }

  // "Tạo hàng loạt": xếp hàng đợi cho cả kế hoạch (bỏ qua bài đã có) rồi rút hàng đợi.
  async function generateAll() {
    if (aiReady === false || !plan) return;
    await runQueue(async () => {
      const res = await fetch('/api/plans/generate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        setGenMsg(d?.error || t('plan.queueError'));
        return false;
      }
      loadGenJobs();
      return true;
    });
  }

  const resumeQueue = () => runQueue();
  const retryFailed = () =>
    runQueue(async () => {
      await fetch('/api/gen-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      loadGenJobs();
      return true;
    });
  async function clearQueue() {
    await fetch('/api/gen-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    loadGenJobs();
  }

  // Trạng thái bài cho 1 item plan (theo target keyword + locale).
  function statusFor(item: PlanItem): { id: string; status: string; publishedUrl?: string } | null {
    const loc = plan?.locale || locale;
    return articleByKey.get(`${loc}|${item.target.trim().toLowerCase()}`) ?? null;
  }

  if (loadingPlan) {
    return (
      <Page title={t('plan.title')}>
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      </Page>
    );
  }

  // Chế độ DANH SÁCH project (không có ?id=).
  if (!plan) {
    const projectRows = allPlans.map((p) => [
      <Checkbox
        key={`${p.id}-c`}
        label=""
        labelHidden
        checked={selected.has(p.id)}
        onChange={() => toggle(p.id)}
      />,
      <Button key={`${p.id}-o`} variant="plain" onClick={() => router.push(`/${locale}/plan?id=${p.id}`)}>
        {p.title || p.seed}
      </Button>,
      p.locale,
      String(p.items?.length ?? 0),
      new Date(p.createdAt).toLocaleDateString(),
    ]);
    return (
      <Page title={t('plan.title')} subtitle={t('plan.subtitle')}>
        <BlockStack gap="400">
          {allPlans.length === 0 ? (
            <Card>
              <BlockStack gap="300" inlineAlign="start">
                <Text as="p" tone="subdued">
                  {t('plan.noProjects')}
                </Text>
                <Button variant="primary" url={`/${locale}/keywords`}>
                  {t('plan.goKeywords')}
                </Button>
              </BlockStack>
            </Card>
          ) : (
            <Card padding="0">
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Checkbox
                      label={t('plan.selectAll')}
                      checked={allPlans.length > 0 && selected.size === allPlans.length}
                      onChange={() =>
                        setSelected((s) =>
                          s.size === allPlans.length ? new Set() : new Set(allPlans.map((p) => p.id)),
                        )
                      }
                    />
                    <Text as="h2" variant="headingSm">
                      {t('plan.projects')}
                    </Text>
                  </InlineStack>
                  <Button
                    tone="critical"
                    variant="primary"
                    disabled={selected.size === 0}
                    loading={deleting}
                    onClick={deleteSelected}
                  >
                    {t('plan.deleteSelected', { n: selected.size })}
                  </Button>
                </InlineStack>
              </Box>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                headings={['', t('plan.colPlan'), t('plan.colMarket'), t('plan.colItems'), t('plan.colDate')]}
                rows={projectRows}
              />
            </Card>
          )}
        </BlockStack>
      </Page>
    );
  }

  const pillar = plan.items.find((i) => i.isPillar);
  const satellites = plan.items.filter((i) => !i.isPillar);

  const rows = satellites.map((it, i) => {
    const st = statusFor(it);
    return [
      <Text as="span" fontWeight="semibold" key={`${it.target}-${i}`}>
        {it.title}
      </Text>,
      it.target,
      it.cluster ?? it.type,
      <Badge key={`${it.target}-p`} tone={PRIORITY_TONE[it.priority]}>
        {t(`common.${it.priority}`)}
      </Badge>,
      <StatusCell key={`${it.target}-st`} st={st} t={t} />,
      st ? (
        <Button key={`${it.target}-b`} size="slim" url={`/${locale}/editor?draft=${st.id}`}>
          {t('plan.openDraft')}
        </Button>
      ) : (
        <Button
          key={`${it.target}-b`}
          size="slim"
          variant="primary"
          icon={MagicIcon}
          loading={busy === `i${i}`}
          disabled={busy !== null || genBusy || aiReady === false}
          onClick={() => writeOne(it, `i${i}`)}
        >
          {t('plan.aiWrite')}
        </Button>
      ),
    ];
  });

  return (
    <Page
      title={t('plan.title')}
      subtitle={`${plan.title} · ${plan.items.length} bài`}
      backAction={{ content: t('plan.backToList'), url: `/${locale}/plan` }}
      secondaryActions={[
        { content: t('plan.exportCsv'), onAction: () => exportCsv(plan.items) },
        { content: t('plan.deletePlan'), destructive: true, onAction: removePlan },
      ]}
    >
      <BlockStack gap="400">
        {busy ? <AiWorking text={t('plan.writingAI')} /> : null}
        {genMsg ? (
          <Banner tone="critical" onDismiss={() => setGenMsg(null)}>
            {genMsg}
          </Banner>
        ) : null}

        {/* CTA nổi bật: tạo hàng loạt cả kế hoạch (bỏ qua bài đã có) - luôn thấy, không giấu ở header. */}
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <BlockStack gap="100">
              <InlineStack gap="100" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  {t('plan.bulkTitle')}
                </Text>
                <InfoHint content={t('plan.bulkHelp')} label={t('plan.bulkTitle')} />
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                {t('plan.bulkDesc')}
              </Text>
            </BlockStack>
            <Button
              variant="primary"
              icon={MagicIcon}
              loading={genBusy}
              disabled={genBusy || busy !== null || aiReady === false}
              onClick={generateAll}
            >
              {genBusy ? t('plan.queueRunning') : t('plan.generateAll')}
            </Button>
          </InlineStack>
        </Card>
        {allPlans.length > 1 ? (
          <Select
            label={<HelpLabel label={t('plan.switchPlan')} help={t('plan.switchPlanHelp')} />}
            labelInline
            options={allPlans.map((p) => ({ label: p.title || p.seed, value: p.id }))}
            value={plan.id}
            onChange={(id) => router.push(`/${locale}/plan?id=${id}`)}
          />
        ) : null}
        {aiReady === false ? (
          <Banner
            tone="warning"
            title={t('plan.noKeyTitle')}
            action={{ content: t('plan.goSettings'), url: `/${locale}/settings` }}
          >
            {t('plan.noKeyBody')}
          </Banner>
        ) : null}

        {genCounts && genCounts.total > 0 ? (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  {t('plan.queueTitle')}
                </Text>
                <Text as="span" tone="subdued" variant="bodySm">
                  {t('plan.queueProgress', { done: genCounts.done, total: genCounts.total })}
                  {genCounts.error ? ` · ${t('plan.queueErrors', { n: genCounts.error })}` : ''}
                </Text>
              </InlineStack>
              <ProgressBar
                progress={((genCounts.done + genCounts.error) / Math.max(1, genCounts.total)) * 100}
                size="small"
              />
              <InlineStack gap="200" wrap blockAlign="center">
                {genBusy ? (
                  <Text as="span" tone="subdued" variant="bodySm">
                    {t('plan.queueRunning')}
                  </Text>
                ) : null}
                {!genBusy && genCounts.queued + genCounts.running > 0 ? (
                  <Button size="slim" variant="primary" onClick={resumeQueue}>
                    {t('plan.queueResume', { n: genCounts.queued + genCounts.running })}
                  </Button>
                ) : null}
                {!genBusy && genCounts.error > 0 ? (
                  <Button size="slim" onClick={retryFailed}>
                    {t('plan.queueRetry', { n: genCounts.error })}
                  </Button>
                ) : null}
                {!genBusy && genCounts.queued + genCounts.running === 0 ? (
                  <Button size="slim" variant="plain" onClick={clearQueue}>
                    {t('plan.queueClear')}
                  </Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        ) : null}

        <Banner tone="info">{t('plan.linkInfo')}</Banner>

        {pillar ? (
          <div style={{ background: '#eaf4ff', borderRadius: 12, padding: 16 }}>
            {/* Tiêu đề FULL-WIDTH (không bị bóp giữa badge & nút → bớt xuống dòng),
                badge + trạng thái + nút nằm hàng dưới. */}
            <BlockStack gap="200">
              <Text as="p" variant="headingSm">
                {pillar.title}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                target: {pillar.target}
              </Text>
              <InlineStack gap="200" align="space-between" blockAlign="center" wrap>
                <Badge tone="info">{t('plan.pillar')}</Badge>
                <InlineStack gap="200" blockAlign="center">
                  <StatusCell st={statusFor(pillar)} t={t} />
                  {statusFor(pillar) ? (
                    <Button size="slim" url={`/${locale}/editor?draft=${statusFor(pillar)!.id}`}>
                      {t('plan.openDraft')}
                    </Button>
                  ) : (
                    <Button
                      size="slim"
                      variant="primary"
                      icon={MagicIcon}
                      loading={busy === 'pillar'}
                      disabled={busy !== null || genBusy || aiReady === false}
                      onClick={() => writeOne(pillar, 'pillar')}
                    >
                      {t('plan.aiWrite')}
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </div>
        ) : null}

        {/* DESKTOP: bảng. Ẩn trên mobile. */}
        <div className="hide-mobile satellite-table">
          <Card padding="0">
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
              headings={[
                t('plan.colSatellite'),
                t('plan.colTarget'),
                t('plan.colCluster'),
                t('common.priority'),
                t('plan.colStatus'),
                '',
              ]}
              rows={rows}
            />
          </Card>
        </div>

        {/* MOBILE: mỗi bài vệ tinh là 1 thẻ — tiêu đề full-width, dễ đọc, không bẹt. */}
        <div className="hide-desktop">
          <BlockStack gap="200">
            {satellites.map((it, i) => {
              const st = statusFor(it);
              return (
                <Box
                  key={`${it.target}-m${i}`}
                  padding="300"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                  background="bg-surface-secondary"
                >
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">
                      {it.title}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      target: {it.target}
                    </Text>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Badge tone={PRIORITY_TONE[it.priority]}>{t(`common.${it.priority}`)}</Badge>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {it.cluster ?? it.type}
                      </Text>
                      <StatusCell st={st} t={t} />
                    </InlineStack>
                    <InlineStack align="end">
                      {st ? (
                        <Button size="slim" url={`/${locale}/editor?draft=${st.id}`}>
                          {t('plan.openDraft')}
                        </Button>
                      ) : (
                        <Button
                          size="slim"
                          variant="primary"
                          icon={MagicIcon}
                          loading={busy === `i${i}`}
                          disabled={busy !== null || genBusy || aiReady === false}
                          onClick={() => writeOne(it, `i${i}`)}
                        >
                          {t('plan.aiWrite')}
                        </Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </Box>
              );
            })}
          </BlockStack>
        </div>
      </BlockStack>
    </Page>
  );
}

function exportCsv(items: PlanItem[]) {
  const header = 'title,target,type,priority\n';
  const body = items
    .map((i) => `"${i.title.replace(/"/g, '""')}","${i.target}","${i.type}","${i.priority}"`)
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'content-plan.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Badge trạng thái bài: chưa viết / đã lưu nháp / đã đăng.
function StatusCell({
  st,
  t,
}: {
  st: { id: string; status: string } | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!st) {
    return (
      <Badge tone="new">{t('plan.stNone')}</Badge>
    );
  }
  if (st.status === 'published') {
    return <Badge tone="success">{t('plan.stPublished')}</Badge>;
  }
  return <Badge tone="attention">{t('plan.stDraft')}</Badge>;
}
