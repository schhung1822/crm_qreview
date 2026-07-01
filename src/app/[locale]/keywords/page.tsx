'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  Icon,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@shopify/polaris-icons';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightIcon } from '@/components/icons';
import { AiWorking } from '@/components/ui';
import { localeNames, locales } from '@/i18n/config';

interface Kw {
  term: string;
  cluster: string;
  volume: number;
  difficulty: number;
  cpc?: number;
  competition?: number;
  trend?: 'up' | 'flat' | 'down';
  opportunity?: number;
  intent: string;
  type: 'seo' | 'geo';
}
interface ProjectSummary {
  id: string;
  seed: string;
  locale: string;
  count: number;
  estimated: boolean;
  createdAt: string;
}

export default function KeywordsPage() {
  const t = useTranslations('keywords');
  const locale = useLocale();
  const router = useRouter();

  const [seed, setSeed] = useState('');
  const [market, setMarket] = useState(locale);
  const [busy, setBusy] = useState(false);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Project đang mở (chi tiết).
  const [openId, setOpenId] = useState<string | null>(null);
  const [rows, setRows] = useState<Kw[]>([]);
  const [estimated, setEstimated] = useState(true);
  const [openSeed, setOpenSeed] = useState('');
  const [openLocale, setOpenLocale] = useState(locale);
  const [tab, setTab] = useState(0);
  const [busyPlan, setBusyPlan] = useState(false);

  // Chọn AI + model để AI phân tích → lập Content Plan.
  const [providers, setProviders] = useState<Array<{ id: string; label: string; hasKey: boolean }>>([]);
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);

  const routedRef = useRef(false);
  useEffect(() => {
    fetch('/api/ai-keys')
      .then((r) => r.json())
      .then((d: { providers: Array<{ id: string; label: string; hasKey: boolean }> }) => {
        setProviders(d.providers);
        // Chọn sẵn AI mặc định cho tác vụ "keywords" (đặt ở Cài đặt) → người dùng dùng/đổi.
        if (routedRef.current) return;
        routedRef.current = true;
        fetch('/api/task-routing')
          .then((r) => r.json())
          .then((tr: { keywords?: { provider?: string; model?: string } }) => {
            const k = tr.keywords;
            if (k?.provider && d.providers.some((p) => p.id === k.provider && p.hasKey)) {
              setAiProvider(k.provider);
              if (k.model) setAiModel(k.model);
              void loadModels(k.provider);
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadProjects = useCallback(async () => {
    const res = await fetch('/api/keywordsets');
    if (res.ok) {
      const d = (await res.json()).keywordSets as ProjectSummary[];
      setProjects(d);
      setSelected((prev) => new Set([...prev].filter((id) => d.some((x) => x.id === id))));
    }
  }, []);
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // Deep-link từ ô tìm kiếm header: /keywords?open=<id> → tự mở project đó.
  const searchParams = useSearchParams();
  const openedRef = useRef('');
  useEffect(() => {
    const id = searchParams.get('open');
    if (id && openedRef.current !== id) {
      openedRef.current = id;
      void openProject(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function openProject(id: string) {
    const res = await fetch(`/api/keywordsets?id=${id}`);
    if (!res.ok) return;
    const set = (await res.json()).keywordSet;
    setOpenId(id);
    setRows(set.keywords as Kw[]);
    setEstimated(Boolean(set.estimated));
    setOpenSeed(set.seed);
    setOpenLocale(set.locale);
    setTab(0);
  }

  async function research() {
    if (!seed.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: seed.trim(),
          locale: market,
          save: true,
          ...(aiProvider ? { provider: aiProvider } : {}),
          ...(aiProvider && aiModel ? { model: aiModel } : {}),
        }),
      });
      if (res.ok) {
        const d = await res.json();
        await loadProjects();
        if (d.setId) {
          setOpenId(d.setId);
          setRows(d.keywords);
          setEstimated(Boolean(d.estimated));
          setOpenSeed(d.seed);
          setOpenLocale(d.locale);
          setTab(0);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(t('deleteConfirm', { n: selected.size }))) return;
    setDeleting(true);
    try {
      for (const id of selected) {
        await fetch(`/api/keywordsets?id=${id}`, { method: 'DELETE' });
        if (id === openId) {
          setOpenId(null);
          setRows([]);
        }
      }
      setSelected(new Set());
      await loadProjects();
    } finally {
      setDeleting(false);
    }
  }

  async function toPlan() {
    if (!openId || rows.length === 0) return;
    setBusyPlan(true);
    try {
      const res = await fetch('/api/plans/from-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: openSeed,
          locale: openLocale,
          estimated,
          keywordSetId: openId,
          clusters: Array.from(new Set(rows.map((r) => r.cluster))),
          keywords: rows,
          ...(aiProvider ? { provider: aiProvider } : {}),
          ...(aiProvider && aiModel ? { model: aiModel } : {}),
        }),
      });
      const d = await res.json();
      if (d.planId) router.push(`/${locale}/plan?id=${d.planId}`);
    } finally {
      setBusyPlan(false);
    }
  }

  const filtered = useMemo(
    () => rows.filter((k) => (tab === 1 ? k.type === 'seo' : tab === 2 ? k.type === 'geo' : true)),
    [rows, tab],
  );

  const marketOptions = locales.map((l) => ({
    label: `${localeNames[l].native} · ${l}`,
    value: l,
  }));

  const projectRows = projects.map((p) => [
    <Checkbox key={`${p.id}-c`} label="" labelHidden checked={selected.has(p.id)} onChange={() => toggle(p.id)} />,
    <Button key={`${p.id}-s`} variant="plain" onClick={() => openProject(p.id)}>
      {p.seed}
    </Button>,
    p.locale,
    String(p.count),
    new Date(p.createdAt).toLocaleDateString(),
  ]);

  const detailRows = filtered.map((k) => [
    <Text as="span" fontWeight="semibold" key={k.term}>
      {k.term}
    </Text>,
    k.cluster,
    k.volume.toLocaleString(),
    <Badge key={`${k.term}-d`} tone={k.difficulty < 30 ? 'success' : k.difficulty < 50 ? 'warning' : 'critical'}>
      {String(k.difficulty)}
    </Badge>,
    k.cpc != null ? `$${k.cpc.toFixed(2)}` : '-',
    k.competition != null ? `${Math.round(k.competition * 100)}%` : '-',
    <TrendCell key={`${k.term}-tr`} trend={k.trend} />,
    <Badge key={`${k.term}-o`} tone={(k.opportunity ?? 0) >= 50 ? 'success' : (k.opportunity ?? 0) >= 30 ? 'warning' : undefined}>
      {String(k.opportunity ?? 0)}
    </Badge>,
    k.intent,
    <Badge key={`${k.term}-t`} tone={k.type === 'geo' ? 'success' : 'info'}>
      {k.type.toUpperCase()}
    </Badge>,
  ]);

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <BlockStack gap="400">
        {/* Nghiên cứu mới - AI sinh danh sách từ khóa */}
        <Card>
          <BlockStack gap="300">
            <InlineGrid columns={{ xs: 1, md: '2fr 1fr auto' }} gap="300" alignItems="end">
              <TextField label={t('seed')} value={seed} onChange={setSeed} autoComplete="off" />
              <Select label={t('market')} options={marketOptions} value={market} onChange={setMarket} />
              <Button variant="primary" loading={busy} disabled={!seed.trim()} onClick={research}>
                {t('research')}
              </Button>
            </InlineGrid>
            <InlineGrid columns={{ xs: 2, sm: 2 }} gap="300">
              <Select
                label={t('researchAi')}
                options={[
                  { label: t('planAiAuto'), value: '' },
                  ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                ]}
                value={aiProvider}
                onChange={selectProvider}
              />
              <Select
                label={t('planModel')}
                disabled={!aiProvider || modelsBusy}
                options={[
                  { label: modelsBusy ? t('planModelLoading') : t('planModelDefault'), value: '' },
                  ...aiModels.map((m) => ({ label: m, value: m })),
                ]}
                value={aiModel}
                onChange={setAiModel}
              />
            </InlineGrid>
          </BlockStack>
        </Card>

        {busy ? <AiWorking text={t('researching')} /> : null}
        {busyPlan ? <AiWorking text={t('planWorking')} /> : null}

        {/* Danh sách project */}
        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Checkbox
                  label={t('selectAll')}
                  checked={projects.length > 0 && selected.size === projects.length}
                  onChange={() =>
                    setSelected((s) =>
                      s.size === projects.length ? new Set() : new Set(projects.map((p) => p.id)),
                    )
                  }
                />
                <Text as="h2" variant="headingSm">
                  {t('projects')}
                </Text>
              </InlineStack>
              <Button tone="critical" variant="primary" disabled={selected.size === 0} loading={deleting} onClick={deleteSelected}>
                {t('deleteSelected', { n: selected.size })}
              </Button>
            </InlineStack>
          </Box>
          {projects.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                {t('noProjects')}
              </Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
              headings={['', t('colSeed'), t('colMarket'), t('colCount'), t('colDate')]}
              rows={projectRows}
            />
          )}
        </Card>

        {/* Chi tiết project đang mở */}
        {openId ? (
          <Card padding="0">
            <Box padding="400" borderBlockEndWidth="025" borderColor="border">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingSm">
                      {openSeed} - {filtered.length}
                    </Text>
                    {estimated ? <Badge tone="attention">{t('estimatedBadge')}</Badge> : null}
                  </BlockStack>
                  <Button variant="primary" icon={ArrowRightIcon} loading={busyPlan} onClick={toPlan}>
                    {t('toPlan')}
                  </Button>
                </InlineStack>
                <InlineGrid columns={{ xs: 2, sm: 2 }} gap="300">
                  <Select
                    label={t('planAi')}
                    options={[
                      { label: t('planAiAuto'), value: '' },
                      ...providers.filter((p) => p.hasKey).map((p) => ({ label: p.label, value: p.id })),
                    ]}
                    value={aiProvider}
                    onChange={selectProvider}
                  />
                  <Select
                    label={t('planModel')}
                    disabled={!aiProvider || modelsBusy}
                    options={[
                      { label: modelsBusy ? t('planModelLoading') : t('planModelDefault'), value: '' },
                      ...aiModels.map((m) => ({ label: m, value: m })),
                    ]}
                    value={aiModel}
                    onChange={setAiModel}
                  />
                </InlineGrid>
              </BlockStack>
            </Box>
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <Text as="p" tone="subdued" variant="bodySm">
                {t('metricsNote')}
              </Text>
            </Box>
            <Tabs
              selected={tab}
              onSelect={setTab}
              tabs={[
                { id: 'all', content: t('tabAll') },
                { id: 'seo', content: t('tabSeo') },
                { id: 'geo', content: t('tabGeo') },
              ]}
            >
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'text', 'numeric', 'text', 'text', 'text', 'text', 'text']}
                headings={[
                  t('colKeyword'),
                  t('colCluster'),
                  t('colVolume'),
                  t('colDifficulty'),
                  t('colCpc'),
                  t('colCompetition'),
                  t('colTrend'),
                  t('colOpportunity'),
                  t('colIntent'),
                  t('colType'),
                ]}
                rows={detailRows}
              />
            </Tabs>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}

function TrendCell({ trend }: { trend?: 'up' | 'flat' | 'down' }) {
  const map = {
    up: { icon: ArrowUpIcon, tone: 'success' as const },
    down: { icon: ArrowDownIcon, tone: 'critical' as const },
    flat: { icon: MinusIcon, tone: 'subdued' as const },
  };
  const m = map[trend ?? 'flat'];
  return (
    <div style={{ width: 16 }}>
      <Icon source={m.icon} tone={m.tone} />
    </div>
  );
}
