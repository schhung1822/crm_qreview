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
  Link,
  List,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AiWorking } from '@/components/ui';

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-+$/g, '');
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  // Map "locale|targetKeyword" → bài đã có (để hiện trạng thái viết/đăng).
  const [articleByKey, setArticleByKey] = useState<Map<string, { id: string; status: string }>>(new Map());

  const planId = params.get('id');

  const loadArticles = useCallback(() => {
    fetch('/api/articles/draft')
      .then((r) => r.json())
      .then((d: { articles?: Array<{ id: string; locale: string; status: string; targetKeyword?: string }> }) => {
        const m = new Map<string, { id: string; status: string }>();
        for (const a of d.articles ?? []) {
          if (!a.targetKeyword) continue;
          const key = `${a.locale}|${a.targetKeyword.trim().toLowerCase()}`;
          if (!m.has(key)) m.set(key, { id: a.id, status: a.status }); // bài mới nhất (list sort desc)
        }
        setArticleByKey(m);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadArticles();
  }, [loadArticles, plan]);

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

  // Internal link theo mô hình Pillar–Cluster (kèm utm_source thay khi đăng).
  function linksFor(item: PlanItem): Array<{ anchor: string; url: string }> {
    if (!plan) return [];
    const loc = plan.locale || locale;
    const fmt = (it: PlanItem) => ({
      anchor: it.title,
      url: `/${loc}/${it.slug || slugify(it.target)}?utm_source={{website}}`,
    });
    const pillar = plan.items.find((i) => i.isPillar);
    if (item.isPillar) {
      // Bài trụ → liên kết XUỐNG các bài vệ tinh.
      return plan.items.filter((i) => !i.isPillar).slice(0, 6).map(fmt);
    }
    // Vệ tinh → link LÊN bài trụ + các vệ tinh CÙNG cụm.
    const sibs = plan.items
      .filter((i) => !i.isPillar && i.cluster === item.cluster && i.target !== item.target)
      .slice(0, 3);
    return [...(pillar ? [fmt(pillar)] : []), ...sibs.map(fmt)];
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

  async function writeAll() {
    if (aiReady === false || !plan) return;
    setBusy('all');
    setCreated([]);
    setProgress({ done: 0, total: plan.items.length });
    const results: Created[] = [];
    for (let i = 0; i < plan.items.length; i++) {
      const c = await autoWrite(plan.items[i]);
      if (c) results.push(c);
      setProgress({ done: i + 1, total: plan.items.length });
      setCreated([...results]);
    }
    setBusy(null);
    setProgress(null);
    loadArticles(); // cập nhật trạng thái sau khi viết hàng loạt
  }

  // Trạng thái bài cho 1 item plan (theo target keyword + locale).
  function statusFor(item: PlanItem): { id: string; status: string } | null {
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
          loading={busy === `i${i}`}
          disabled={busy !== null || aiReady === false}
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
      primaryAction={{
        content: progress ? t('plan.batchProgress', progress) : t('plan.generateAll'),
        loading: busy === 'all',
        disabled: busy !== null || aiReady === false,
        onAction: writeAll,
      }}
      secondaryActions={[
        { content: t('plan.exportCsv'), onAction: () => exportCsv(plan.items) },
        { content: t('plan.deletePlan'), destructive: true, onAction: removePlan },
      ]}
    >
      <BlockStack gap="400">
        {busy ? (
          <AiWorking
            text={busy === 'all' && progress ? t('plan.batchProgress', progress) : t('plan.writingAI')}
            progress={
              busy === 'all' && progress
                ? (progress.done / Math.max(1, progress.total)) * 100
                : undefined
            }
          />
        ) : null}
        {allPlans.length > 1 ? (
          <Select
            label={t('plan.switchPlan')}
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

        {created.length ? (
          <Banner tone="success" title={t('plan.batchDone', { n: created.length })}>
            <List type="bullet">
              {created.map((c) => (
                <List.Item key={c.id}>
                  <Link url={`/${locale}/editor?draft=${c.id}`}>{c.title}</Link>
                </List.Item>
              ))}
            </List>
          </Banner>
        ) : null}

        <Banner tone="info">{t('plan.linkInfo')}</Banner>

        {pillar ? (
          <div style={{ background: '#eaf4ff', borderRadius: 12, padding: 16 }}>
            <InlineStack gap="400" blockAlign="center" wrap={false}>
              <Badge tone="info">{t('plan.pillar')}</Badge>
              <div style={{ flex: 1 }}>
                <Text as="p" variant="headingSm">
                  {pillar.title}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  target: {pillar.target}
                </Text>
              </div>
              <StatusCell st={statusFor(pillar)} t={t} />
              {statusFor(pillar) ? (
                <Button size="slim" url={`/${locale}/editor?draft=${statusFor(pillar)!.id}`}>
                  {t('plan.openDraft')}
                </Button>
              ) : (
                <Button
                  size="slim"
                  variant="primary"
                  loading={busy === 'pillar'}
                  disabled={busy !== null || aiReady === false}
                  onClick={() => writeOne(pillar, 'pillar')}
                >
                  {t('plan.aiWrite')}
                </Button>
              )}
            </InlineStack>
          </div>
        ) : null}

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
