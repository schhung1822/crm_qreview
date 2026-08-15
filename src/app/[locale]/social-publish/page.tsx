'use client';

import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Page,
  RangeSlider,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { ProviderLogo } from '@/components/provider-logos';
import type { SocialProvider } from '@/lib/connection-providers';
import type { SocialMediaType } from '@/lib/social-publishing';
import { useSearchParams } from 'next/navigation';

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

interface PublishResultItem {
  connectionId: string;
  provider: SocialProvider;
  label: string;
  ok: boolean;
  result?: {
    id: string;
    url?: string;
    status: 'published' | 'processing';
    message?: string;
    affiliateComments?: { total: number; posted: number; errors: string[] };
  };
  error?: string;
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
  video: 'Short clip / video',
};

const ALL_MEDIA_TYPES: SocialMediaType[] = ['text', 'image', 'video'];

function parseMediaUrls(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean)));
}

// Mỗi DÒNG là một link affiliate = một comment. Không tách theo dấu phẩy vì link affiliate
// thường có dấu phẩy trong tham số tracking.
function parseAffiliateLinks(value: string): string[] {
  return Array.from(new Set(value.split(/\n+/).map((line) => line.trim()).filter(Boolean)));
}

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
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<SocialConnection[] | null>(null);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([]);
  const [reviewPostIds, setReviewPostIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftId, setDraftId] = useState('');
  const [mediaType, setMediaType] = useState<SocialMediaType>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [imageProcessingEnabled, setImageProcessingEnabled] = useState(true);
  const [imageCropSquare, setImageCropSquare] = useState(true);
  const [imageScale, setImageScale] = useState(1.1);
  const [imageBarHeight, setImageBarHeight] = useState(10);
  const [imageShowLogo, setImageShowLogo] = useState(true);
  const [imageLogoUrl, setImageLogoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [articleSource, setArticleSource] = useState('');
  const [affiliateLinksText, setAffiliateLinksText] = useState('');
  const [privacy, setPrivacy] = useState('SELF_ONLY');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'warning' | 'critical'; message: string; items: PublishResultItem[] } | null>(null);

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
        setSelectedConnectionIds((current) => {
          const existing = current.filter((id) => social.some((connection) => connection.id === id));
          return existing.length ? existing : social.filter((connection) => connection.status === 'active').slice(0, 1).map((connection) => connection.id);
        });
        setDrafts(draftData.articles ?? []);
      })
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    const reviewId = searchParams.get('review');
    if (!reviewId) return;
    fetch(`/api/social-posts?id=${encodeURIComponent(reviewId)}`)
      .then((response) => response.json())
      .then((data: { posts?: Array<{
        id: string;
        connectionId: string;
        title?: string;
        text: string;
        mediaType: SocialMediaType;
        mediaUrls?: string[];
        linkUrl?: string;
        articleSource?: string;
        affiliateLinks?: string[];
        imageProcessing?: {
          enabled?: boolean;
          cropSquare?: boolean;
          scale?: number;
          barHeight?: number;
          showLogo?: boolean;
          logoUrl?: string;
        };
      }> }) => {
        const rows = data.posts ?? [];
        const first = rows[0];
        if (!first) return;
        setReviewPostIds(rows.map((row) => row.id));
        setSelectedConnectionIds(rows.map((row) => row.connectionId));
        setTitle(first.title || '');
        setText(first.text || '');
        setMediaType(first.mediaType);
        setMediaUrl((first.mediaUrls ?? []).join('\n'));
        setLinkUrl(first.linkUrl || '');
        setArticleSource(first.articleSource || '');
        setAffiliateLinksText((first.affiliateLinks ?? []).join('\n'));
        setImageProcessingEnabled(first.imageProcessing?.enabled !== false);
        setImageCropSquare(first.imageProcessing?.cropSquare !== false);
        setImageScale(first.imageProcessing?.scale ?? 1.1);
        setImageBarHeight(first.imageProcessing?.barHeight ?? 10);
        setImageShowLogo(first.imageProcessing?.showLogo !== false);
        setImageLogoUrl(first.imageProcessing?.logoUrl ?? '');
        setResult({
          tone: 'warning',
          message: 'Bài này được gửi từ API ngoài và đang chờ duyệt. Bạn có thể chỉnh sửa nội dung rồi bấm đăng.',
          items: [],
        });
      })
      .catch(() => {});
  }, [searchParams]);

  const selectedConnections = useMemo(
    () => (connections ?? []).filter((item) => selectedConnectionIds.includes(item.id)),
    [connections, selectedConnectionIds],
  );
  const activeConnections = useMemo(
    () => (connections ?? []).filter((item) => item.status === 'active'),
    [connections],
  );
  const mediaOptions = useMemo(() => {
    const source = selectedConnections.length ? selectedConnections : activeConnections;
    const supported = new Set<SocialMediaType>();
    source.forEach((connection) => CAPABILITIES[connection.provider].forEach((type) => supported.add(type)));
    return ALL_MEDIA_TYPES.filter((type) => supported.has(type));
  }, [activeConnections, selectedConnections]);
  const unsupportedConnections = useMemo(
    () => selectedConnections.filter((connection) => !CAPABILITIES[connection.provider].includes(mediaType)),
    [mediaType, selectedConnections],
  );
  const imageUrls = useMemo(() => parseMediaUrls(mediaUrl), [mediaUrl]);
  const affiliateLinks = useMemo(() => parseAffiliateLinks(affiliateLinksText), [affiliateLinksText]);
  const invalidAffiliateLinks = useMemo(
    () => affiliateLinks.filter((link) => !/https?:\/\/\S+/i.test(link)),
    [affiliateLinks],
  );
  const hasFacebook = useMemo(
    () => selectedConnections.some((connection) => connection.provider === 'facebook'),
    [selectedConnections],
  );

  useEffect(() => {
    if (mediaOptions.length && !mediaOptions.includes(mediaType)) setMediaType(mediaOptions[0]);
  }, [mediaOptions, mediaType]);

  const canPublish = useMemo(() => {
    if (!selectedConnections.length || !text.trim() || publishing) return false;
    if (selectedConnections.some((connection) => connection.status !== 'active')) return false;
    if (unsupportedConnections.length > 0) return false;
    if (mediaType === 'image' && (imageUrls.length === 0 || imageUrls.some((url) => !/^https?:\/\//i.test(url)))) return false;
    if (mediaType === 'video' && !/^https?:\/\//i.test(mediaUrl.trim())) return false;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl.trim())) return false;
    if (invalidAffiliateLinks.length > 0) return false;
    return true;
  }, [selectedConnections, text, publishing, unsupportedConnections, mediaType, imageUrls, mediaUrl, linkUrl, invalidAffiliateLinks]);

  function toggleConnection(id: string, checked: boolean) {
    setSelectedConnectionIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
    setResult(null);
  }

  function selectCompatibleConnections() {
    setSelectedConnectionIds(activeConnections.filter((connection) => CAPABILITIES[connection.provider].includes(mediaType)).map((connection) => connection.id));
    setResult(null);
  }

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
      if (mediaOptions.includes('image')) setMediaType('image');
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
          connectionIds: selectedConnectionIds,
          title: title.trim() || undefined,
          text: text.trim(),
          mediaType,
          mediaUrl: mediaType === 'video' ? mediaUrl.trim() : mediaType === 'image' ? imageUrls[0] : undefined,
          mediaUrls: mediaType === 'image' ? imageUrls : undefined,
          reviewPostIds: reviewPostIds.length ? reviewPostIds : undefined,
          imageProcessing: mediaType === 'image' ? {
            enabled: imageProcessingEnabled,
            cropSquare: imageCropSquare,
            scale: imageScale,
            barHeight: imageBarHeight,
            showLogo: imageShowLogo,
            logoUrl: imageLogoUrl.trim() || undefined,
          } : undefined,
          linkUrl: mediaType === 'text' && linkUrl.trim() ? linkUrl.trim() : undefined,
          articleSource: articleSource.trim() || undefined,
          affiliateLinks: affiliateLinks.length ? affiliateLinks : undefined,
          privacy: selectedConnections.some((connection) => connection.provider === 'tiktok') ? privacy : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const items = (data.results ?? []) as PublishResultItem[];
      if (!response.ok) {
        setResult({ tone: 'critical', message: data.error || 'Không thể đăng nội dung', items });
        return;
      }
      const failed = items.filter((item) => !item.ok).length;
      const processing = items.filter((item) => item.ok && item.result?.status === 'processing').length;
      setResult({
        tone: failed ? 'warning' : 'success',
        message: failed
          ? `Đã đăng ${items.length - failed}/${items.length} kênh. Kiểm tra lỗi bên dưới.`
          : processing
            ? 'Nội dung đã gửi thành công, một số nền tảng đang xử lý/kiểm duyệt.'
            : 'Đăng nội dung thành công trên các kênh đã chọn.',
        items,
      });
    } finally {
      setPublishing(false);
    }
  }

  const noConnections = connections !== null && connections.length === 0;
  const unsupportedNames = unsupportedConnections.map((connection) => PLATFORM_NAMES[connection.provider]).join(', ');

  return (
    <Page title="Đăng mạng xã hội" subtitle="Xuất bản bài viết, hình ảnh và short clip tới một hoặc nhiều tài khoản đã kết nối">
      <BlockStack gap="400">
        <Banner tone="info">
          Ảnh và video cần URL HTTPS công khai để nền tảng tải được. YouTube chỉ hỗ trợ video; Instagram và TikTok không hỗ trợ bài chỉ có chữ qua API.
        </Banner>

        {noConnections ? (
          <Banner tone="warning" action={{ content: 'Thêm kết nối', url: `/${locale}/settings` }}>
            Chưa có kết nối mạng xã hội. Hãy thêm Facebook, Instagram, TikTok, Threads hoặc YouTube trước.
          </Banner>
        ) : null}
        {unsupportedConnections.length ? (
          <Banner tone="warning">
            Loại nội dung {MEDIA_LABEL[mediaType].toLowerCase()} chưa được hỗ trợ bởi: {unsupportedNames}. Bỏ chọn các kênh này hoặc đổi loại nội dung trước khi đăng.
          </Banner>
        ) : null}
        {result ? (
          <Banner tone={result.tone}>
            <BlockStack gap="200">
              <Text as="p">{result.message}</Text>
              {result.items.map((item) => (
                <BlockStack key={item.connectionId} gap="050">
                  <InlineStack gap="200" blockAlign="center">
                    <ProviderLogo id={item.provider} size={22} />
                    <Text as="span" variant="bodySm">
                      {item.label} · {item.ok ? item.result?.message || (item.result?.status === 'processing' ? 'Đang xử lý' : 'Đã đăng') : item.error}
                    </Text>
                    {item.result?.url ? (
                      <a href={item.result.url} target="_blank" rel="noreferrer">
                        Xem bài đăng
                      </a>
                    ) : null}
                  </InlineStack>
                  {item.result?.affiliateComments ? (
                    <Text as="span" variant="bodySm" tone={item.result.affiliateComments.errors.length ? 'critical' : 'subdued'}>
                      {`Comment affiliate: ${item.result.affiliateComments.posted}/${item.result.affiliateComments.total}`}
                      {item.result.affiliateComments.errors.length ? ` · ${item.result.affiliateComments.errors.join(' · ')}` : ''}
                    </Text>
                  ) : null}
                </BlockStack>
              ))}
            </BlockStack>
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
              <TextField
                label="Nguồn bài viết (tùy chọn)"
                value={articleSource}
                onChange={setArticleSource}
                autoComplete="off"
                maxLength={300}
                placeholder="Tên nguồn hoặc URL bài gốc"
                helpText="Chỉ dùng để ghi nhận nội bộ trong trang Bài đăng mạng xã hội. Không gửi lên mạng xã hội."
              />
              <TextField label="Nội dung / chú thích" value={text} onChange={setText} multiline={10} autoComplete="off" showCharacterCount maxLength={10_000} />
              <TextField
                label="Link affiliate (tùy chọn)"
                value={affiliateLinksText}
                onChange={setAffiliateLinksText}
                multiline={4}
                autoComplete="off"
                placeholder={'https://shopee.vn/abc\nhttps://tiki.vn/xyz'}
                error={invalidAffiliateLinks.length ? `Dòng không chứa URL http(s): ${invalidAffiliateLinks.join(', ')}` : undefined}
                helpText={
                  affiliateLinks.length && !hasFacebook
                    ? 'Chưa chọn kênh Facebook nào nên các link này sẽ không được đăng. Mỗi dòng một link — mỗi link thành một comment riêng dưới bài Facebook.'
                    : 'Mỗi dòng một link — mỗi link sẽ được đăng thành một comment riêng dưới bài Facebook. Các nền tảng khác bỏ qua.'
                }
              />
              {mediaType !== 'text' ? (
                <TextField
                  label={`URL ${mediaType === 'image' ? 'hình ảnh' : 'short clip / video'} công khai`}
                  value={mediaUrl}
                  onChange={setMediaUrl}
                  type="url"
                  multiline={mediaType === 'image' ? 5 : false}
                  autoComplete="off"
                  placeholder={mediaType === 'image' ? 'https://example.com/image.jpg' : 'https://example.com/video.mp4'}
                  helpText={mediaType === 'image' ? 'Có thể nhập nhiều ảnh, mỗi dòng một URL. Nếu tắt xử lý ảnh, hệ thống sẽ dùng nguyên URL đã dán và không lưu ảnh về máy chủ.' : undefined}
                />
              ) : selectedConnections.some((connection) => ['facebook', 'threads'].includes(connection.provider)) ? (
                <TextField label="Liên kết đính kèm (tùy chọn)" value={linkUrl} onChange={setLinkUrl} type="url" autoComplete="off" />
              ) : null}
              {mediaType === 'image' ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Xử lý ảnh trước khi đăng</Text>
                    <Checkbox
                      label="Bật xử lý ảnh: tải về, tùy chỉnh kích thước, thêm khung trắng và logo"
                      checked={imageProcessingEnabled}
                      onChange={setImageProcessingEnabled}
                    />
                    {imageProcessingEnabled ? (
                      <>
                        <Checkbox
                          label="Cắt ảnh thành hình vuông (tỷ lệ 1:1)"
                          helpText="Mặc định bật. Tắt tùy chọn này để giữ nguyên tỷ lệ ảnh gốc."
                          checked={imageCropSquare}
                          onChange={setImageCropSquare}
                        />
                        <RangeSlider
                          label={`Scale ảnh: ${imageScale.toFixed(2)}x`}
                          min={1}
                          max={1.5}
                          step={0.05}
                          value={imageScale}
                          onChange={(value) => setImageScale(Number(value))}
                          output
                        />
                        <RangeSlider
                          label={`Độ dày khung trắng: ${imageBarHeight}px`}
                          min={0}
                          max={80}
                          step={10}
                          value={imageBarHeight}
                          onChange={(value) => setImageBarHeight(Number(value))}
                          output
                        />
                        <InlineGrid columns={{ xs: 1, md: 1 }} gap="300">
                          <TextField
                            label="Logo riêng (tùy chọn)"
                            value={imageLogoUrl}
                            onChange={setImageLogoUrl}
                            autoComplete="off"
                            placeholder="Để trống = /images/qreview_toke.webp"
                            helpText="Có thể dùng URL http(s), data URI hoặc đường dẫn nội bộ /images/..."
                          />
                        </InlineGrid>
                        <Checkbox
                          label="Chèn logo vào góc ảnh"
                          checked={imageShowLogo}
                          onChange={setImageShowLogo}
                        />
                      </>
                    ) : (
                      <Text as="p" tone="subdued">
                        Hệ thống sẽ gửi nguyên các URL ảnh đã dán lên nền tảng. URL phải là HTTPS công khai và đúng yêu cầu tỷ lệ/dung lượng của từng mạng xã hội.
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              ) : null}
            </BlockStack>
          </Card>

          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingSm">Nơi đăng</Text>
                  <Button size="slim" onClick={selectCompatibleConnections} disabled={!activeConnections.length}>
                    Chọn kênh phù hợp
                  </Button>
                </InlineStack>
                <Select
                  label="Loại nội dung"
                  options={mediaOptions.map((type) => ({ label: MEDIA_LABEL[type], value: type }))}
                  value={mediaType}
                  onChange={(value) => {
                    setMediaType(value as SocialMediaType);
                    setResult(null);
                  }}
                  disabled={!activeConnections.length}
                />
                <BlockStack gap="200">
                  {(connections ?? []).map((connection) => (
                    <InlineStack key={connection.id} gap="200" blockAlign="center" wrap={false}>
                      <Checkbox
                        label={`${connection.label} · ${PLATFORM_NAMES[connection.provider]}`}
                        checked={selectedConnectionIds.includes(connection.id)}
                        disabled={connection.status !== 'active'}
                        onChange={(checked) => toggleConnection(connection.id, checked)}
                      />
                      <ProviderLogo id={connection.provider} size={24} />
                    </InlineStack>
                  ))}
                </BlockStack>
                {selectedConnections.some((connection) => connection.provider === 'tiktok') ? (
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
              Đăng ngay {selectedConnections.length ? `(${selectedConnections.length} kênh)` : ''}
            </Button>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
