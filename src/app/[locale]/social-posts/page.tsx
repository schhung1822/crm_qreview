'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProviderLogo } from '@/components/provider-logos';
import { SocialPostEditModal } from '@/components/SocialPostEditModal';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { SOCIAL_PROVIDERS, type SocialProvider } from '@/lib/connection-providers';
import type { SocialPostRecord } from '@/lib/store/social-posts';

type StatusFilter = 'all' | SocialPostRecord['status'];
type ProviderFilter = 'all' | SocialProvider;
// '' = tất cả nguồn, NO_SOURCE = bài chưa ghi nguồn, còn lại là khóa nguồn (xem sourceKey).
type SourceFilter = string;

const NO_SOURCE = '__none__';

interface SocialPostGroup {
  key: string;
  posts: SocialPostRecord[];
  primary: SocialPostRecord;
  status: SocialPostRecord['status'];
  providers: SocialProvider[];
  publishedUrls: Array<{ provider: SocialProvider; url: string }>;
  errors: Array<{ provider: SocialProvider; error: string }>;
}

const PROVIDER_LABEL: Record<SocialProvider, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  threads: 'Threads',
  youtube: 'YouTube',
};

const MEDIA_LABEL: Record<SocialPostRecord['mediaType'], string> = {
  text: 'Bài viết',
  image: 'Hình ảnh',
  video: 'Video',
};

const STATUS_LABEL: Record<SocialPostRecord['status'], string> = {
  pending_review: 'Chờ duyệt',
  published: 'Đã đăng',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
};

const STATUS_TONE: Record<SocialPostRecord['status'], 'success' | 'info' | 'critical' | 'warning'> = {
  pending_review: 'warning',
  published: 'success',
  processing: 'info',
  failed: 'critical',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function previewText(post: SocialPostRecord): string {
  const source = post.text || post.title || '';
  return source.length > 180 ? `${source.slice(0, 180)}...` : source;
}

function mediaSummary(post: SocialPostRecord): string {
  if (post.mediaType === 'image') return `${MEDIA_LABEL[post.mediaType]} · ${post.mediaUrls.length} ảnh`;
  if (post.mediaType === 'video') return MEDIA_LABEL[post.mediaType];
  return MEDIA_LABEL[post.mediaType];
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// Khóa gom nhóm nguồn: URL gom theo domain (nhiều bài cùng site = một nguồn), còn lại lấy
// nguyên chữ. Dùng chung cho cả thẻ hiển thị lẫn bộ lọc để hai chỗ luôn khớp nhau.
function sourceKey(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (isUrl(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // URL hỏng thì rơi về so khớp theo chữ.
    }
  }
  return raw.toLowerCase();
}

// Nhãn hiển thị trên thẻ: domain cho URL, chữ rút gọn cho nguồn dạng tên.
function sourceLabel(value: string): string {
  const raw = value.trim();
  if (isUrl(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./i, '');
    } catch {
      // bỏ qua, dùng nhánh rút gọn bên dưới
    }
  }
  return raw.length > 40 ? `${raw.slice(0, 40)}...` : raw;
}

function groupKey(post: SocialPostRecord): string {
  if (post.batchId) return post.batchId;
  const minute = Math.floor(new Date(post.createdAt).getTime() / 60_000);
  const media = [...post.mediaUrls].sort().join('|');
  return [post.title || '', post.text, post.mediaType, media, minute].join('::');
}

function groupStatus(posts: SocialPostRecord[]): SocialPostRecord['status'] {
  if (posts.some((post) => post.status === 'failed')) return 'failed';
  if (posts.some((post) => post.status === 'pending_review')) return 'pending_review';
  if (posts.some((post) => post.status === 'processing')) return 'processing';
  return 'published';
}

function makeGroups(posts: SocialPostRecord[]): SocialPostGroup[] {
  const map = new Map<string, SocialPostRecord[]>();
  for (const post of posts) {
    const key = groupKey(post);
    map.set(key, [...(map.get(key) ?? []), post]);
  }
  return Array.from(map.entries())
    .map(([key, rows]) => {
      const sorted = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const primary = sorted[0];
      return {
        key,
        posts: sorted,
        primary,
        status: groupStatus(sorted),
        providers: Array.from(new Set(sorted.map((post) => post.provider))),
        publishedUrls: sorted
          .filter((post): post is SocialPostRecord & { publishedUrl: string } => Boolean(post.publishedUrl))
          .map((post) => ({ provider: post.provider, url: post.publishedUrl })),
        errors: sorted
          .filter((post): post is SocialPostRecord & { error: string } => Boolean(post.error))
          .map((post) => ({ provider: post.provider, error: post.error })),
      };
    })
    .sort((a, b) => (a.primary.createdAt < b.primary.createdAt ? 1 : -1));
}

export default function SocialPostsPage() {
  const [posts, setPosts] = useState<SocialPostRecord[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('');
  const [deletingKey, setDeletingKey] = useState('');
  const [approvingKey, setApprovingKey] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [editingGroup, setEditingGroup] = useState<SocialPostGroup | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/social-posts');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Không thể tải danh sách bài đăng mạng xã hội');
      setPosts([]);
      return;
    }
    setPosts(data.posts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Danh sách nguồn lấy từ TOÀN BỘ bài (không theo bộ lọc đang chọn) để lựa chọn không tự biến mất.
  const sourceOptions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    let missing = 0;
    for (const post of posts ?? []) {
      const key = sourceKey(post.articleSource);
      if (!key) {
        missing += 1;
        continue;
      }
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label: sourceLabel(post.articleSource!), count: 1 });
    }
    const rows = Array.from(counts.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'vi'))
      .map(([key, item]) => ({ label: `${item.label} (${item.count})`, value: key }));
    return [
      { label: 'Tất cả nguồn', value: '' },
      ...rows,
      ...(missing ? [{ label: `Chưa có nguồn (${missing})`, value: NO_SOURCE }] : []),
    ];
  }, [posts]);

  // Nguồn đang lọc có thể biến mất sau khi xóa bài — trả bộ lọc về "Tất cả nguồn".
  useEffect(() => {
    if (source && !sourceOptions.some((option) => option.value === source)) setSource('');
  }, [source, sourceOptions]);

  const groupedPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (posts ?? []).filter((post) => {
      if (provider !== 'all' && post.provider !== provider) return false;
      if (status !== 'all' && post.status !== status) return false;
      if (source) {
        const key = sourceKey(post.articleSource);
        if (source === NO_SOURCE ? key !== '' : key !== source) return false;
      }
      if (!q) return true;
      return [post.title, post.text, post.connectionLabel, post.publishedUrl, post.providerPostId, post.articleSource]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
    return makeGroups(rows);
  }, [posts, provider, query, source, status]);

  async function deleteGroup(group: SocialPostGroup) {
    setDeletingKey(group.key);
    setError('');
    try {
      let latest: SocialPostRecord[] | null = null;
      for (const post of group.posts) {
        const response = await fetch(`/api/social-posts?id=${encodeURIComponent(post.id)}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error || 'Không thể xóa bản ghi bài đăng');
          return;
        }
        latest = data.posts ?? latest;
      }
      if (latest) setPosts(latest);
    } finally {
      setDeletingKey('');
    }
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function approveGroup(group: SocialPostGroup) {
    const post = group.primary;
    const mediaUrls = post.originalMediaUrls?.length ? post.originalMediaUrls : post.mediaUrls;
    setApprovingKey(group.key);
    setError('');
    setNotice(null);
    try {
      const response = await fetch('/api/social-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionIds: group.posts.map((item) => item.connectionId),
          reviewPostIds: group.posts.map((item) => item.id),
          title: post.title || undefined,
          text: post.text,
          mediaType: post.mediaType,
          mediaUrl: post.mediaType === 'video' ? mediaUrls[0] : post.mediaType === 'image' ? mediaUrls[0] : undefined,
          mediaUrls: post.mediaType === 'image' ? mediaUrls : undefined,
          linkUrl: post.mediaType === 'text' ? post.linkUrl : undefined,
          articleSource: post.articleSource || undefined,
          affiliateLinks: post.affiliateLinks?.length ? post.affiliateLinks : undefined,
          privacy: group.providers.includes('tiktok') ? 'SELF_ONLY' : undefined,
          imageProcessing:
            post.mediaType === 'image'
              ? post.imageProcessing ?? { enabled: true, cropSquare: true, scale: 1.1, barHeight: 10, showLogo: true }
              : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Không thể duyệt và đăng bài');
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const failed = results.filter((item: { ok?: boolean }) => item.ok === false).length;
      setNotice({
        tone: failed ? 'warning' : 'success',
        message: failed
          ? `Đã duyệt và đăng ${results.length - failed}/${results.length} kênh. Một số kênh đăng thất bại.`
          : 'Đã duyệt và đăng bài thành công.',
      });
      await load();
    } catch {
      setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setApprovingKey('');
    }
  }

  const loading = posts === null;

  return (
    <Page
      title="Bài đăng mạng xã hội"
      subtitle="Quản lý lịch sử đăng bài, xem lại media đã xử lý và mở bài đăng trên từng nền tảng"
      primaryAction={{ content: 'Đăng bài mới', url: '/social-publish' }}
    >
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {notice ? <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.message}</Banner> : null}

        <Card>
          <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
            <TextField
              label="Tìm kiếm"
              value={query}
              onChange={setQuery}
              autoComplete="off"
              placeholder="Tiêu đề, nội dung, tài khoản, mã bài..."
              clearButton
              onClearButtonClick={() => setQuery('')}
            />
            <Select
              label="Nền tảng"
              value={provider}
              onChange={(value) => setProvider(value as ProviderFilter)}
              options={[
                { label: 'Tất cả nền tảng', value: 'all' },
                ...SOCIAL_PROVIDERS.map((item) => ({ label: PROVIDER_LABEL[item], value: item })),
              ]}
            />
            <Select
              label="Trạng thái"
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={[
                { label: 'Tất cả trạng thái', value: 'all' },
                { label: STATUS_LABEL.pending_review, value: 'pending_review' },
                { label: STATUS_LABEL.published, value: 'published' },
                { label: STATUS_LABEL.processing, value: 'processing' },
                { label: STATUS_LABEL.failed, value: 'failed' },
              ]}
            />
            <Select
              label="Nguồn bài viết"
              value={source}
              onChange={setSource}
              options={sourceOptions}
              disabled={sourceOptions.length <= 1}
              helpText={sourceOptions.length <= 1 ? 'Chưa có bài nào ghi nguồn.' : undefined}
            />
          </InlineGrid>
        </Card>

        {loading ? (
          <Card>
            <Text as="p" tone="subdued">Đang tải lịch sử bài đăng...</Text>
          </Card>
        ) : groupedPosts.length === 0 ? (
          <Card>
            <EmptyState
              heading="Chưa có bài đăng phù hợp"
              action={{ content: 'Đăng bài mới', url: '/social-publish' }}
              image="/images/logo_duongban.webp"
            >
              <p>Lịch sử sẽ được lưu sau mỗi lần đăng từ trang Đăng mạng xã hội.</p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="200">
            {groupedPosts.map((group) => {
              const post = group.primary;
              const expanded = expandedKeys.has(group.key);
              return (
                <Card key={group.key}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" gap="300" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <InlineStack gap="100" wrap={false}>
                          {group.providers.map((item) => (
                            <ProviderLogo key={item} id={item} size={28} />
                          ))}
                        </InlineStack>
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h2" variant="headingSm">{post.title || '(Không tiêu đề)'}</Text>
                            <Badge tone={STATUS_TONE[group.status]}>{STATUS_LABEL[group.status]}</Badge>
                            {post.articleSource ? (
                              <Badge tone="info">{`Nguồn: ${sourceLabel(post.articleSource)}`}</Badge>
                            ) : null}
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            {group.posts.map((item) => `${item.connectionLabel} - ${PROVIDER_LABEL[item.provider]}`).join(', ')} · {formatDate(post.createdAt)}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <ButtonGroup>
                        {group.status === 'pending_review' ? (
                          <Button
                            variant="primary"
                            loading={approvingKey === group.key}
                            disabled={Boolean(approvingKey || deletingKey)}
                            onClick={() => void approveGroup(group)}
                          >
                            Duyệt
                          </Button>
                        ) : null}
                        {group.status === 'pending_review' ? (
                          <Button
                            disabled={Boolean(approvingKey || deletingKey)}
                            onClick={() => setEditingGroup(group)}
                          >
                            Chỉnh sửa
                          </Button>
                        ) : null}
                        {group.publishedUrls[0] ? (
                          <Button url={group.publishedUrls[0].url} target="_blank">
                            Xem bài
                          </Button>
                        ) : null}
                        <Button
                          tone="critical"
                          loading={deletingKey === group.key}
                          onClick={() => void deleteGroup(group)}
                        >
                          Xóa
                        </Button>
                        <Button
                          variant="plain"
                          icon={expanded ? ChevronUpIcon : ChevronDownIcon}
                          ariaExpanded={expanded}
                          onClick={() => toggleExpanded(group.key)}
                        >
                          {expanded ? 'Thu gọn' : 'Xem thêm'}
                        </Button>
                      </ButtonGroup>
                    </InlineStack>

                    {expanded ? (
                      <BlockStack gap="300">
                        {previewText(post) ? <Text as="p">{previewText(post)}</Text> : null}

                        <InlineStack gap="200" blockAlign="center">
                          <Badge>{mediaSummary(post)}</Badge>
                          <Badge>{`${group.providers.length} nền tảng`}</Badge>
                          {group.publishedUrls.map((item) => (
                            <a key={`${group.key}-${item.provider}`} href={item.url} target="_blank" rel="noreferrer">
                              {PROVIDER_LABEL[item.provider]}
                            </a>
                          ))}
                        </InlineStack>

                        {group.errors.length ? (
                          <BlockStack gap="100">
                            {group.errors.map((item, index) => (
                              <Text key={`${group.key}-error-${index}`} as="p" tone="critical">
                                {PROVIDER_LABEL[item.provider]}: {item.error}
                              </Text>
                            ))}
                          </BlockStack>
                        ) : null}

                        {post.mediaUrls.length ? (
                          <InlineStack gap="200">
                            {post.mediaUrls.slice(0, 8).map((url, index) => (
                              <a key={`${group.key}-${url}`} href={url} target="_blank" rel="noreferrer" aria-label={`Mở media ${index + 1}`}>
                                <Thumbnail source={post.mediaType === 'video' ? '/icon/youtube.svg' : url} alt={`Media ${index + 1}`} size="small" />
                              </a>
                            ))}
                            {post.mediaUrls.length > 8 ? <Badge>{`+${post.mediaUrls.length - 8} media`}</Badge> : null}
                          </InlineStack>
                        ) : null}

                        {post.articleSource ? (
                          <Text as="p" tone="subdued">
                            Nguồn bài viết:{' '}
                            {isUrl(post.articleSource) ? (
                              <a href={post.articleSource} target="_blank" rel="noreferrer">
                                {post.articleSource}
                              </a>
                            ) : (
                              post.articleSource
                            )}
                          </Text>
                        ) : null}

                        {post.affiliateLinks?.length ? (
                          <BlockStack gap="100">
                            <Text as="p" tone="subdued">
                              {`Link affiliate (mỗi link là một comment Facebook): ${post.affiliateLinks.length}`}
                            </Text>
                            {post.affiliateLinks.map((link, index) => (
                              <Text key={`${group.key}-aff-${index}`} as="p" variant="bodySm">
                                {isUrl(link) ? (
                                  <a href={link} target="_blank" rel="noreferrer">{link}</a>
                                ) : (
                                  link
                                )}
                              </Text>
                            ))}
                          </BlockStack>
                        ) : null}

                        {post.originalMediaUrls?.length ? (
                          <Text as="p" tone="subdued">
                            Ảnh gốc: {post.originalMediaUrls.length} URL
                          </Text>
                        ) : null}
                      </BlockStack>
                    ) : null}
                  </BlockStack>
                </Card>
              );
            })}
          </BlockStack>
        )}
      </BlockStack>
      {editingGroup ? (
        <SocialPostEditModal
          key={editingGroup.key}
          posts={editingGroup.posts}
          onClose={() => setEditingGroup(null)}
          onPublished={async (message, partial) => {
            setEditingGroup(null);
            setNotice({
              tone: partial ? 'warning' : 'success',
              message: message || 'Đã lưu chỉnh sửa và đăng bài thành công.',
            });
            await load();
          }}
        />
      ) : null}
    </Page>
  );
}
