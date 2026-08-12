'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { ExtLink } from '@/components/ui';

interface Article {
  id: string;
  title: string;
  locale: string;
  status: 'draft' | 'published';
  updatedAt: string;
  publishedUrl?: string;
  source?: 'new' | 'edited';
}

interface Job {
  id: string;
  title: string;
  status: 'scheduled' | 'pending' | 'running' | 'done' | 'error';
  runAt?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  resultUrl?: string;
}

const JOB_TONE: Record<Job['status'], 'info' | 'attention' | 'critical' | 'success'> = {
  scheduled: 'info',
  pending: 'attention',
  running: 'attention',
  error: 'critical',
  done: 'success',
};

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function CalendarPage() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runningDue, setRunningDue] = useState(false);

  const loadArticles = useCallback(async () => {
    const r = await fetch('/api/articles/draft');
    if (r.ok) setArticles((await r.json()).articles ?? []);
    else setArticles([]);
  }, []);
  const loadJobs = useCallback(async () => {
    const r = await fetch('/api/jobs');
    if (r.ok) setJobs((await r.json()).jobs ?? []);
  }, []);

  useEffect(() => {
    void loadArticles();
    void loadJobs();
  }, [loadArticles, loadJobs]);

  async function runDue() {
    setRunningDue(true);
    try {
      await fetch('/api/jobs/run', { method: 'POST' });
      await Promise.all([loadJobs(), loadArticles()]);
    } finally {
      setRunningDue(false);
    }
  }
  async function cancelJob(id: string) {
    await fetch(`/api/jobs?id=${id}`, { method: 'DELETE' });
    await loadJobs();
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const today = now.getDate();

  // Số bài ĐÃ ĐĂNG theo ngày trong tháng hiện tại (theo updatedAt).
  const publishedByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of articles ?? []) {
      if (a.status !== 'published') continue;
      const d = new Date(a.updatedAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + 1);
      }
    }
    return map;
  }, [articles, year, month]);

  // Số job ĐÃ LÊN LỊCH theo ngày trong tháng (theo runAt).
  const scheduledByDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const j of jobs) {
      if (j.status !== 'scheduled' || !j.runAt) continue;
      const d = new Date(j.runAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + 1);
      }
    }
    return map;
  }, [jobs, year, month]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'scheduled' || j.status === 'pending' || j.status === 'running'),
    [jobs],
  );
  const errorJobs = useMemo(() => jobs.filter((j) => j.status === 'error'), [jobs]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Thứ trong tuần của ngày 1 (chuyển CN=0 → cuối tuần kiểu T2..CN).
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;

  const recent = useMemo(
    () =>
      (articles ?? [])
        .filter((a) => a.status === 'published')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 10),
    [articles],
  );

  // Đếm bài đã đăng theo loại: đăng mới vs sửa lại bằng AI.
  const counts = useMemo(() => {
    let newCount = 0;
    let editedCount = 0;
    for (const a of articles ?? []) {
      if (a.status !== 'published') continue;
      if (a.source === 'edited') editedCount++;
      else newCount++;
    }
    return { newCount, editedCount };
  }, [articles]);

  if (articles === null) {
    return (
      <Page title={t('title')}>
        <Box padding="400">
          <Spinner size="small" />
        </Box>
      </Page>
    );
  }

  return (
    <Page
      title={t('title')}
      subtitle={`${t('monthLabel', { m: month + 1, y: year })} · ${t('subtitle')}`}
      primaryAction={{ content: t('schedule'), icon: PlusIcon, url: `/${locale}/publish` }}
    >
      <BlockStack gap="400">
        {/* Tổng số bài đã đăng: đăng mới vs sửa lại */}
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t('newPosts')}
              </Text>
              <Text as="span" variant="headingLg">
                {counts.newCount}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                {t('editedPosts')}
              </Text>
              <Text as="span" variant="headingLg">
                {counts.editedCount}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Lịch đăng & job (scheduled / lỗi) + chạy thủ công */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                {t('jobsTitle')}
              </Text>
              <Button onClick={runDue} loading={runningDue} disabled={activeJobs.length === 0}>
                {t('runDue')}
              </Button>
            </InlineStack>
            {activeJobs.length === 0 && errorJobs.length === 0 ? (
              <Text as="p" tone="subdued">
                {t('noJobs')}
              </Text>
            ) : (
              <BlockStack gap="200">
                {[...activeJobs, ...errorJobs].map((j) => (
                  <InlineStack key={j.id} gap="300" blockAlign="center" wrap={false}>
                    <Badge tone={JOB_TONE[j.status]}>{t(`jobStatus_${j.status}`)}</Badge>
                    {j.runAt ? <Badge>{new Date(j.runAt).toLocaleString()}</Badge> : null}
                    <div style={{ flex: 1 }}>
                      <Text as="span" fontWeight="semibold">
                        {j.title || '-'}
                      </Text>
                      {j.lastError ? (
                        <Text as="span" tone="critical" variant="bodySm">
                          {` · ${j.lastError}`}
                        </Text>
                      ) : null}
                    </div>
                    {j.attempts > 0 ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        {t('attempts', { n: j.attempts, max: j.maxAttempts })}
                      </Text>
                    ) : null}
                    <Button variant="plain" tone="critical" onClick={() => cancelJob(j.id)}>
                      {t('cancelJob')}
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            )}
            <Text as="p" tone="subdued" variant="bodySm">
              {t('workerHint')}
            </Text>
          </BlockStack>
        </Card>

        <Card>
          {/* Lịch tháng: trên di động cho cuộn ngang để các ô không bị bóp quá nhỏ */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 520 }}>
              <BlockStack gap="200">
                <InlineGrid columns={7} gap="200">
                  {DOW.map((d) => (
                    <Text key={d} as="span" variant="bodySm" tone="subdued" alignment="center">
                      {d}
                    </Text>
                  ))}
                </InlineGrid>
                <InlineGrid columns={7} gap="200">
              {Array.from({ length: firstDow }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const count = publishedByDay.get(d) ?? 0;
                return (
                  <div
                    key={d}
                    style={{
                      minHeight: 64,
                      border: '1px solid #e3e3e3',
                      borderRadius: 8,
                      padding: 8,
                      background: d === today ? '#eaf4ff' : '#fff',
                    }}
                  >
                    <Text as="span" variant="bodySm" fontWeight="semibold" tone={d === today ? undefined : 'subdued'}>
                      {d}
                    </Text>
                    {count > 0 ? (
                      <Box paddingBlockStart="100">
                        <Badge tone="success">{`${count} ${t('published')}`}</Badge>
                      </Box>
                    ) : null}
                    {(scheduledByDay.get(d) ?? 0) > 0 ? (
                      <Box paddingBlockStart="100">
                        <Badge tone="info">{t('scheduledBadge', { n: scheduledByDay.get(d) ?? 0 })}</Badge>
                      </Box>
                    ) : null}
                  </div>
                );
              })}
                </InlineGrid>
              </BlockStack>
            </div>
          </div>
        </Card>

        <Card padding="0">
          <Box padding="400" paddingBlockEnd="300">
            <Text as="h2" variant="headingSm">
              {t('recentTitle')}
            </Text>
          </Box>
          {recent.length === 0 ? (
            <Box paddingInline="400" paddingBlockEnd="400">
              <Text as="p" tone="subdued">
                {t('noRecent')}
              </Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={['text', 'text', 'text']}
              headings={[t('colDate'), t('colType'), t('colTitle')]}
              rows={recent.map((a) => [
                <Text as="span" tone="subdued" key={`${a.id}-d`}>
                  {new Date(a.updatedAt).toLocaleDateString(locale)}
                </Text>,
                <Badge key={`${a.id}-t`} tone={a.source === 'edited' ? 'attention' : 'success'}>
                  {a.source === 'edited' ? t('typeEdited') : t('typeNew')}
                </Badge>,
                a.publishedUrl ? (
                  <ExtLink href={a.publishedUrl} bold key={`${a.id}-l`}>
                    {a.title}
                  </ExtLink>
                ) : (
                  <Text as="span" fontWeight="semibold" key={`${a.id}-l`}>
                    {a.title}
                  </Text>
                ),
              ])}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
