'use client';

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DataTable,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CornerToast } from '@/components/CornerToast';
import { ExtLink } from '@/components/ui';

interface Article {
  id: string;
  title: string;
  locale: string;
  status: 'draft' | 'review' | 'published';
  updatedAt: string;
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  targetKeyword?: string;
  publishedUrl?: string;
  approved?: boolean;
  reviewNote?: string;
  assignedTo?: string;
}

export default function ArticlesPage() {
  const t = useTranslations('articles');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Vừa đăng bài xong (chuyển từ trang Đăng bài) → hiện thông báo thành công ở góc phải, rồi dọn URL.
  const [publishedToast, setPublishedToast] = useState(false);
  const dismissToast = useCallback(() => setPublishedToast(false), []);
  useEffect(() => {
    if (searchParams.get('published') === '1') {
      setPublishedToast(true);
      router.replace(`/${locale}/articles`);
    }
  }, [searchParams, router, locale]);

  const [items, setItems] = useState<Article[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Quyền theo biz + userId + cờ bắt buộc duyệt (để gạn nút Gửi duyệt / Duyệt / Trả lại).
  const [perms, setPerms] = useState<{ permissions: string[]; requireApproval: boolean } | null>(
    null,
  );
  const [acting, setActing] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);

  const [status, setStatus] = useState<'all' | 'draft' | 'review' | 'published'>('all');
  const [time, setTime] = useState<'all' | '7' | '30' | '90'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/articles/draft');
    if (res.ok) {
      const all = ((await res.json()).articles as Article[]) ?? [];
      setItems(all);
      setSelected((prev) => new Set([...prev].filter((id) => all.some((x) => x.id === id))));
    } else {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/auth/permissions');
      if (res.ok) {
        const d = await res.json();
        setPerms({
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
          requireApproval: !!d.requireApproval,
        });
      } else {
        setPerms({ permissions: [], requireApproval: false });
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/users-lite');
      if (res.ok) setMembers((await res.json()).members ?? []);
    })();
  }, []);

  const canPublish = perms?.permissions.includes('content:publish') ?? false;
  const canWrite = perms?.permissions.includes('content:write') ?? false;

  // Giao/bỏ giao bài cho 1 thành viên rồi nạp lại danh sách.
  const assign = useCallback(
    async (id: string, userId: string) => {
      await fetch('/api/articles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: userId || null }),
      });
      await load();
    },
    [load],
  );

  // Chuyển trạng thái duyệt của 1 bài (gửi duyệt / duyệt / trả lại) rồi nạp lại danh sách.
  const review = useCallback(
    async (id: string, action: 'submit' | 'approve' | 'reject', note?: string) => {
      setActing(id);
      try {
        const res = await fetch('/api/articles/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action, note }),
        });
        if (res.ok) await load();
      } finally {
        setActing(null);
      }
    },
    [load],
  );

  const filtered = useMemo(() => {
    if (!items) return [];
    const now = Date.now();
    const days = time === 'all' ? 0 : Number(time);
    const cutoff = days ? now - days * 86400_000 : 0;
    const kw = q.trim().toLowerCase();
    return items.filter((a) => {
      if (status !== 'all' && a.status !== status) return false;
      if (cutoff && new Date(a.updatedAt).getTime() < cutoff) return false;
      if (kw && !`${a.title} ${a.targetKeyword ?? ''}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [items, status, time, q]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) =>
      s.size === filtered.length ? new Set() : new Set(filtered.map((a) => a.id)),
    );
  }

  async function deleteSelected() {
    if (selected.size === 0 || !confirm(t('deleteConfirm', { n: selected.size }))) return;
    setDeleting(true);
    try {
      for (const id of selected) await fetch(`/api/articles/draft?id=${id}`, { method: 'DELETE' });
      setSelected(new Set());
      await load();
    } finally {
      setDeleting(false);
    }
  }

  const allChecked = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  const rows = filtered.map((a) => [
    <Checkbox key={`${a.id}-c`} label="" labelHidden checked={selected.has(a.id)} onChange={() => toggle(a.id)} />,
    <Button key={`${a.id}-e`} variant="plain" url={`/${locale}/editor?draft=${a.id}&from=articles`}>
      {a.title || '(không tiêu đề)'}
    </Button>,
    <BlockStack key={`${a.id}-s`} gap="100" inlineAlign="start">
      <Badge
        tone={
          a.status === 'published' ? 'success' : a.status === 'review' ? 'attention' : undefined
        }
      >
        {a.status === 'published'
          ? t('statusPublished')
          : a.status === 'review'
            ? t('statusReview')
            : t('statusDraft')}
      </Badge>
      {a.status === 'draft' && a.approved ? <Badge tone="success">{t('approvedTag')}</Badge> : null}
      {a.status === 'draft' && a.reviewNote ? (
        <Text as="span" tone="critical" variant="bodySm">
          {t('rejectedTag')}: {a.reviewNote}
        </Text>
      ) : null}
    </BlockStack>,
    `${a.seoScore} / ${a.aeoScore ?? 0} / ${a.geoScore}`,
    new Date(a.updatedAt).toLocaleDateString(),
    <Select
      key={`${a.id}-asg`}
      label=""
      labelHidden
      disabled={!canWrite}
      options={[
        { label: t('unassigned'), value: '' },
        ...members.map((m) => ({ label: m.name, value: m.id })),
      ]}
      value={a.assignedTo ?? ''}
      onChange={(v) => void assign(a.id, v)}
    />,
    <InlineStack key={`${a.id}-act`} gap="200" wrap blockAlign="center">
      {/* "Sửa" LUÔN mở trình soạn thảo trong app (kể cả bài đã đăng). Với bài đã đăng, thêm
          link "Mở" RIÊNG để xem bản public (tab mới). */}
      <Button key={`${a.id}-b`} size="slim" url={`/${locale}/editor?draft=${a.id}&from=articles`}>
        {t('edit')}
      </Button>
      {/* Ô "Mở" LUÔN chiếm chỗ (ẩn khi bài chưa đăng) để "Dịch" thẳng hàng giữa các dòng. */}
      <span
        key={`${a.id}-v`}
        style={{ visibility: a.status === 'published' && a.publishedUrl ? 'visible' : 'hidden' }}
      >
        <ExtLink href={a.publishedUrl ?? '#'}>{tc('open')}</ExtLink>
      </span>
      {/* Quy trình duyệt: nháp → "Gửi duyệt" (khi không tự đăng được hoặc biz bắt buộc duyệt);
          chờ duyệt → "Duyệt"/"Trả lại" cho người có quyền đăng, còn lại chỉ báo đang chờ. */}
      {a.status === 'draft' && canWrite && (!canPublish || (perms?.requireApproval ?? false)) ? (
        <Button
          key={`${a.id}-sub`}
          size="slim"
          loading={acting === a.id}
          onClick={() => void review(a.id, 'submit')}
        >
          {t('submitReview')}
        </Button>
      ) : null}
      {a.status === 'review' ? (
        canPublish ? (
          <>
            <Button
              key={`${a.id}-ap`}
              size="slim"
              loading={acting === a.id}
              onClick={() => void review(a.id, 'approve')}
            >
              {t('approve')}
            </Button>
            <Button
              key={`${a.id}-rj`}
              size="slim"
              variant="plain"
              tone="critical"
              disabled={acting === a.id}
              onClick={() => {
                const note = window.prompt(t('rejectReason'));
                if (note !== null) void review(a.id, 'reject', note);
              }}
            >
              {t('reject')}
            </Button>
          </>
        ) : (
          <Text as="span" tone="subdued" variant="bodySm" key={`${a.id}-pend`}>
            {t('pendingApproval')}
          </Text>
        )
      ) : null}
    </InlineStack>,
  ]);

  return (
    <>
      {publishedToast ? (
        <CornerToast message={t('publishedToast')} onDismiss={dismissToast} />
      ) : null}
    <Page
      title={t('title')}
      subtitle={t('subtitle')}
      primaryAction={{ content: t('write'), url: `/${locale}/editor` }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            {/* Mobile: 2 select ngắn cùng 1 hàng; ô tìm kiếm full width bên dưới */}
            <InlineGrid columns={{ xs: 2, sm: '1fr 1fr' }} gap="300">
              <Select
                label={t('filterStatus')}
                options={[
                  { label: t('filterAll'), value: 'all' },
                  { label: t('statusDraft'), value: 'draft' },
                  { label: t('statusReview'), value: 'review' },
                  { label: t('statusPublished'), value: 'published' },
                ]}
                value={status}
                onChange={(v) => setStatus(v as 'all' | 'draft' | 'review' | 'published')}
              />
              <Select
                label={t('filterTime')}
                options={[
                  { label: t('timeAll'), value: 'all' },
                  { label: t('time7'), value: '7' },
                  { label: t('time30'), value: '30' },
                  { label: t('time90'), value: '90' },
                ]}
                value={time}
                onChange={(v) => setTime(v as 'all' | '7' | '30' | '90')}
              />
            </InlineGrid>
            <TextField
              label={t('searchKeyword')}
              value={q}
              onChange={setQ}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setQ('')}
            />
          </BlockStack>
        </Card>

        {items === null ? (
          <Box padding="400">
            <Spinner size="small" />
          </Box>
        ) : items.length === 0 ? (
          <Card>
            <Text as="p" tone="subdued">
              {t('empty')}
            </Text>
          </Card>
        ) : (
          <Card padding="0">
            <Box padding="300" borderBlockEndWidth="025" borderColor="border">
              <InlineStack align="space-between" blockAlign="center">
                <Checkbox label={t('selectAll')} checked={allChecked} onChange={toggleAll} />
                <Button
                  tone="critical"
                  variant="primary"
                  disabled={selected.size === 0}
                  loading={deleting}
                  onClick={deleteSelected}
                >
                  {t('deleteSelected', { n: selected.size })}
                </Button>
              </InlineStack>
            </Box>
            {filtered.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued">
                  {t('noResults')}
                </Text>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={[
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                ]}
                headings={[
                  '',
                  t('colTitle'),
                  t('colStatus'),
                  'SEO / AEO / GEO',
                  t('colUpdated'),
                  t('colAssignee'),
                  '',
                ]}
                rows={rows}
              />
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
    </>
  );
}
