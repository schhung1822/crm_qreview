'use client';

import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { ProviderLogo } from '@/components/provider-logos';
import type { SocialMediaType } from '@/lib/social-publishing';
import type { SocialProvider } from '@/lib/connection-providers';

interface SocialConnection {
  id: string;
  provider: SocialProvider;
  label: string;
  kind: 'social';
  status: 'active' | 'error';
}

interface DraftSummary {
  id: string;
  title: string;
}

const PLATFORM_NAMES: Record<SocialProvider, string> = {
  facebook: 'Facebook Fanpage',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  threads: 'Threads',
  youtube: 'YouTube',
};

const CAPABILITIES: Record<SocialProvider, SocialMediaType[]> = {
  facebook: ['text', 'image', 'video'],
  instagram: ['image', 'video'],
  tiktok: ['image', 'video'],
  threads: ['text', 'image', 'video'],
  youtube: ['video'],
};

const MEDIA_LABEL: Record<SocialMediaType, string> = {
  text: 'Bài viết',
  image: 'Hình ảnh',
  video: 'Video',
};

function markdownToCaption(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function SocialPublishPage() {
  const locale = useLocale();
  const [connections, setConnections] = useState<SocialConnection[] | null>(null);
  const [connectionId, setConnectionId] = useState('');
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftId, setDraftId] = useState('');
  const [mediaType, setMediaType] = useState<SocialMediaType>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [privacy, setPrivacy] = useState('SELF_ONLY');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/connections').then((response) => response.json()),
      fetch('/api/articles/draft').then((response) => response.json()),
    ])
      .then(([connectionData, draftData]) => {
        const social = (connectionData.connections ?? []).filter(
          (connection: SocialConnection) => connection.kind === 'social',
        ) as SocialConnection[];
        setConnections(social);
        setConnectionId((current) => current || social[0]?.id || '');
        setDrafts(draftData.articles ?? []);
      })
      .catch(() => setConnections([]));
  }, []);

  const connection = connections?.find((item) => item.id === connectionId);
  const capabilities = useMemo(
    () => (connection ? CAPABILITIES[connection.provider] : []),
    [connection],
  );

  useEffect(() => {
    if (capabilities.length && !capabilities.includes(mediaType)) setMediaType(capabilities[0]);
  }, [capabilities, mediaType]);

  const canPublish = useMemo(() => {
    if (!connectionId || !connection || !text.trim() || publishing) return false;
    if (mediaType !== 'text' && !/^https?:\/\//i.test(mediaUrl.trim())) return false;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl.trim())) return false;
    return true;
  }, [connectionId, connection, text, mediaType, mediaUrl, linkUrl, publishing]);

  async function loadDraft(id: string) {
    setDraftId(id);
    if (!id) return;
    const response = await fetch(`/api/articles/draft?id=${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const article = (await response.json()).article;
    if (!article) return;
    setTitle(article.title || '');
    setText(markdownToCaption(article.markdown || ''));
    if (article.coverImageUrl && /^https?:\/\//i.test(article.coverImageUrl)) {
      setMediaUrl(article.coverImageUrl);
      if (capabilities.includes('image')) setMediaType('image');
    }
  }

  async function publish() {
    if (!canPublish) return;
    setPublishing(true);
    setResult(null);
    try {
      const response = await fetch('/api/social-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          title: title.trim() || undefined,
          text: text.trim(),
          mediaType,
          mediaUrl: mediaType === 'text' ? undefined : mediaUrl.trim(),
          linkUrl: mediaType === 'text' && linkUrl.trim() ? linkUrl.trim() : undefined,
          privacy: connection?.provider === 'tiktok' ? privacy : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResult({ ok: false, message: data.error || 'Không thể đăng nội dung' });
        return;
      }
      setResult({
        ok: true,
        message: data.result?.message || (data.result?.status === 'processing' ? 'Nền tảng đang xử lý nội dung.' : 'Đăng nội dung thành công.'),
        url: data.result?.url,
      });
    } finally {
      setPublishing(false);
    }
  }

  const noConnections = connections !== null && connections.length === 0;

  return (
    <Page title="Đăng mạng xã hội" subtitle="Xuất bản bài viết, hình ảnh và video tới các tài khoản đã kết nối">
      <BlockStack gap="400">
        <Banner tone="info">
          Ảnh và video phải có URL HTTPS công khai để nền tảng tải được. YouTube chỉ hỗ trợ video; Instagram và TikTok không hỗ trợ bài chỉ có chữ.
        </Banner>

        {noConnections ? (
          <Banner tone="warning" action={{ content: 'Thêm kết nối', url: `/${locale}/settings` }}>
            Chưa có kết nối mạng xã hội. Hãy thêm Facebook, Instagram, TikTok, Threads hoặc YouTube trước.
          </Banner>
        ) : null}
        {result ? (
          <Banner tone={result.ok ? 'success' : 'critical'}>
            {result.message}{' '}
            {result.url ? <a href={result.url} target="_blank" rel="noreferrer">Xem bài đăng</a> : null}
          </Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, md: '2fr 1fr' }} gap="400">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">Nội dung</Text>
              <Select
                label="Nạp từ bài viết đã lưu"
                options={[{ label: 'Không chọn bài viết', value: '' }, ...drafts.map((draft) => ({ label: draft.title || '(Không tiêu đề)', value: draft.id }))]}
                value={draftId}
                onChange={(value) => void loadDraft(value)}
              />
              <TextField label="Tiêu đề" value={title} onChange={setTitle} autoComplete="off" helpText="Bắt buộc đối với YouTube; tùy chọn ở nền tảng khác." />
              <TextField label="Nội dung / chú thích" value={text} onChange={setText} multiline={10} autoComplete="off" showCharacterCount maxLength={10_000} />
              {mediaType !== 'text' ? (
                <TextField
                  label={`URL ${mediaType === 'image' ? 'hình ảnh' : 'video'} công khai`}
                  value={mediaUrl}
                  onChange={setMediaUrl}
                  type="url"
                  autoComplete="off"
                  placeholder={mediaType === 'image' ? 'https://example.com/image.jpg' : 'https://example.com/video.mp4'}
                />
              ) : connection && ['facebook', 'threads'].includes(connection.provider) ? (
                <TextField label="Liên kết đính kèm (tùy chọn)" value={linkUrl} onChange={setLinkUrl} type="url" autoComplete="off" />
              ) : null}
            </BlockStack>
          </Card>

          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">Nơi đăng</Text>
                <Select
                  label="Tài khoản / kênh"
                  options={(connections ?? []).map((item) => ({ label: `${item.label} · ${PLATFORM_NAMES[item.provider]}`, value: item.id }))}
                  value={connectionId}
                  onChange={(value) => {
                    setConnectionId(value);
                    setResult(null);
                  }}
                  disabled={noConnections}
                />
                {connection ? (
                  <InlineStack gap="200" blockAlign="center">
                    <ProviderLogo id={connection.provider} size={30} />
                    <Text as="span" variant="bodySm" tone="subdued">{PLATFORM_NAMES[connection.provider]}</Text>
                  </InlineStack>
                ) : null}
                <Select
                  label="Loại nội dung"
                  options={capabilities.map((type) => ({ label: MEDIA_LABEL[type], value: type }))}
                  value={mediaType}
                  onChange={(value) => setMediaType(value as SocialMediaType)}
                  disabled={!connection}
                />
                {connection?.provider === 'tiktok' ? (
                  <Select
                    label="Quyền riêng tư TikTok"
                    options={[
                      { label: 'Chỉ mình tôi', value: 'SELF_ONLY' },
                      { label: 'Mọi người', value: 'PUBLIC_TO_EVERYONE' },
                      { label: 'Người theo dõi', value: 'FOLLOWER_OF_CREATOR' },
                      { label: 'Bạn bè', value: 'MUTUAL_FOLLOW_FRIENDS' },
                    ]}
                    value={privacy}
                    onChange={setPrivacy}
                  />
                ) : null}
              </BlockStack>
            </Card>
            <Button variant="primary" size="large" fullWidth loading={publishing} disabled={!canPublish} onClick={() => void publish()}>
              Đăng ngay
            </Button>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
