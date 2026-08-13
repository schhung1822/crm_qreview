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
import { SOCIAL_PROVIDERS, type SocialProvider } from '@/lib/connection-providers';
import type { SocialPostRecord } from '@/lib/store/social-posts';

type StatusFilter = 'all' | SocialPostRecord['status'];
type ProviderFilter = 'all' | SocialProvider;

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
  published: 'Đã đăng',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
};

const STATUS_TONE: Record<SocialPostRecord['status'], 'success' | 'info' | 'critical'> = {
  published: 'success',
  processing: 'info',
  failed: 'critical',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
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

export default function SocialPostsPage() {
  const [posts, setPosts] = useState<SocialPostRecord[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [deletingId, setDeletingId] = useState('');

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

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter((post) => {
      if (provider !== 'all' && post.provider !== provider) return false;
      if (status !== 'all' && post.status !== status) return false;
      if (!q) return true;
      return [post.title, post.text, post.connectionLabel, post.publishedUrl, post.providerPostId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [posts, provider, query, status]);

  async function deletePost(id: string) {
    setDeletingId(id);
    setError('');
    try {
      const response = await fetch(`/api/social-posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Không thể xóa bản ghi bài đăng');
        return;
      }
      setPosts(data.posts ?? []);
    } finally {
      setDeletingId('');
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

        <Card>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
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
                { label: STATUS_LABEL.published, value: 'published' },
                { label: STATUS_LABEL.processing, value: 'processing' },
                { label: STATUS_LABEL.failed, value: 'failed' },
              ]}
            />
          </InlineGrid>
        </Card>

        {loading ? (
          <Card>
            <Text as="p" tone="subdued">Đang tải lịch sử bài đăng...</Text>
          </Card>
        ) : filteredPosts.length === 0 ? (
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
          <BlockStack gap="300">
            {filteredPosts.map((post) => (
              <Card key={post.id}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" gap="300" blockAlign="start">
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <ProviderLogo id={post.provider} size={36} />
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingSm">{post.title || '(Không tiêu đề)'}</Text>
                          <Badge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</Badge>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          {post.connectionLabel} · {PROVIDER_LABEL[post.provider]} · {formatDate(post.createdAt)}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <ButtonGroup>
                      {post.publishedUrl ? (
                        <Button url={post.publishedUrl} target="_blank">
                          Xem bài
                        </Button>
                      ) : null}
                      <Button
                        tone="critical"
                        loading={deletingId === post.id}
                        onClick={() => void deletePost(post.id)}
                      >
                        Xóa
                      </Button>
                    </ButtonGroup>
                  </InlineStack>

                  {previewText(post) ? <Text as="p">{previewText(post)}</Text> : null}

                  <InlineStack gap="200" blockAlign="center">
                    <Badge>{mediaSummary(post)}</Badge>
                    {post.providerPostId ? <Badge>{`Mã: ${post.providerPostId}`}</Badge> : null}
                    {post.error ? <Text as="span" tone="critical">{post.error}</Text> : null}
                  </InlineStack>

                  {post.mediaUrls.length ? (
                    <InlineStack gap="200">
                      {post.mediaUrls.slice(0, 8).map((url, index) => (
                        <a key={`${post.id}-${url}`} href={url} target="_blank" rel="noreferrer" aria-label={`Mở media ${index + 1}`}>
                          <Thumbnail source={post.mediaType === 'video' ? '/icon/youtube.svg' : url} alt={`Media ${index + 1}`} size="small" />
                        </a>
                      ))}
                      {post.mediaUrls.length > 8 ? <Badge>{`+${post.mediaUrls.length - 8} media`}</Badge> : null}
                    </InlineStack>
                  ) : null}

                  {post.originalMediaUrls?.length ? (
                    <Text as="p" tone="subdued">
                      Ảnh gốc: {post.originalMediaUrls.length} URL
                    </Text>
                  ) : null}
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}
