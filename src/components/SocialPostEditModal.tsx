'use client';

import {
  Banner,
  BlockStack,
  Checkbox,
  InlineGrid,
  InlineStack,
  Modal,
  RangeSlider,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useEffect, useMemo, useState } from 'react';
import { ProviderLogo } from '@/components/provider-logos';
import type { SocialProvider } from '@/lib/connection-providers';
import type { SocialMediaType } from '@/lib/social-publishing';
import type { SocialPostRecord } from '@/lib/store/social-posts';

interface SocialConnection {
  id: string;
  provider: SocialProvider;
  label: string;
  kind: 'social';
  status: 'active' | 'error';
}

interface Props {
  posts: SocialPostRecord[];
  onClose: () => void;
  onPublished: (message?: string, partial?: boolean) => void | Promise<void>;
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

function parseMediaUrls(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean)));
}

// Mỗi DÒNG là một link affiliate = một comment (link affiliate hay có dấu phẩy trong tracking).
function parseAffiliateLinks(value: string): string[] {
  return Array.from(new Set(value.split(/\n+/).map((line) => line.trim()).filter(Boolean)));
}

export function SocialPostEditModal({ posts, onClose, onPublished }: Props) {
  const post = posts[0];
  const initialMediaUrls = post.originalMediaUrls?.length ? post.originalMediaUrls : post.mediaUrls;
  const [connections, setConnections] = useState<SocialConnection[] | null>(null);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState(() => posts.map((item) => item.connectionId));
  const [mediaType, setMediaType] = useState<SocialMediaType>(post.mediaType);
  const [title, setTitle] = useState(post.title || '');
  const [text, setText] = useState(post.text || '');
  const [mediaUrl, setMediaUrl] = useState(initialMediaUrls.join('\n'));
  const [linkUrl, setLinkUrl] = useState(post.linkUrl || '');
  const [articleSource, setArticleSource] = useState(post.articleSource || '');
  const [urlSource, setUrlSource] = useState(post.urlSource || '');
  const [affiliateLinksText, setAffiliateLinksText] = useState((post.affiliateLinks ?? []).join('\n'));
  const [privacy, setPrivacy] = useState('SELF_ONLY');
  const [imageProcessingEnabled, setImageProcessingEnabled] = useState(post.imageProcessing?.enabled !== false);
  const [imageCropSquare, setImageCropSquare] = useState(post.imageProcessing?.cropSquare !== false);
  const [imageScale, setImageScale] = useState(post.imageProcessing?.scale ?? 1.1);
  const [imageBarHeight, setImageBarHeight] = useState(post.imageProcessing?.barHeight ?? 10);
  const [imageShowLogo, setImageShowLogo] = useState(post.imageProcessing?.showLogo !== false);
  const [imageLogoUrl, setImageLogoUrl] = useState(post.imageProcessing?.logoUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/connections')
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể tải danh sách kết nối');
        return (data.connections ?? []).filter(
          (connection: SocialConnection) => connection.kind === 'social',
        ) as SocialConnection[];
      })
      .then(setConnections)
      .catch((reason: unknown) => {
        setConnections([]);
        setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách kết nối');
      });
  }, []);

  const selectedConnections = useMemo(
    () => (connections ?? []).filter((item) => selectedConnectionIds.includes(item.id)),
    [connections, selectedConnectionIds],
  );
  const mediaUrls = useMemo(() => parseMediaUrls(mediaUrl), [mediaUrl]);
  const affiliateLinks = useMemo(() => parseAffiliateLinks(affiliateLinksText), [affiliateLinksText]);
  const invalidAffiliateLinks = useMemo(
    () => affiliateLinks.filter((link) => !/https?:\/\/\S+/i.test(link)),
    [affiliateLinks],
  );
  const unsupportedConnections = useMemo(
    () => selectedConnections.filter((connection) => !CAPABILITIES[connection.provider].includes(mediaType)),
    [mediaType, selectedConnections],
  );
  const hasTikTok = selectedConnections.some((connection) => connection.provider === 'tiktok');
  const canPublish = useMemo(() => {
    if (connections === null || !selectedConnections.length || !text.trim() || busy) return false;
    if (selectedConnections.some((connection) => connection.status !== 'active')) return false;
    if (unsupportedConnections.length) return false;
    if (mediaType === 'image' && (!mediaUrls.length || mediaUrls.some((url) => !/^https?:\/\//i.test(url)))) return false;
    if (mediaType === 'video' && !/^https?:\/\//i.test(mediaUrl.trim())) return false;
    // Link bài gốc nay lưu cho mọi loại nội dung → phải hợp lệ ở mọi loại (API cũng chặn).
    if (linkUrl.trim() && !/^https?:\/\//i.test(linkUrl.trim())) return false;
    if (urlSource.trim() && !/^https?:\/\//i.test(urlSource.trim())) return false;
    if (invalidAffiliateLinks.length) return false;
    return true;
  }, [busy, connections, invalidAffiliateLinks, linkUrl, mediaType, mediaUrl, mediaUrls, selectedConnections, text, unsupportedConnections, urlSource]);

  function toggleConnection(id: string, checked: boolean) {
    setSelectedConnectionIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
    setError('');
  }

  async function submit() {
    if (!canPublish) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/social-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionIds: selectedConnectionIds,
          reviewPostIds: posts.map((item) => item.id),
          title: title.trim() || undefined,
          text: text.trim(),
          mediaType,
          mediaUrl: mediaType === 'video' ? mediaUrl.trim() : mediaType === 'image' ? mediaUrls[0] : undefined,
          mediaUrls: mediaType === 'image' ? mediaUrls : undefined,
          // Lưu link bài gốc cho mọi loại nội dung (nền tảng chỉ đính kèm với bài chỉ có chữ).
          linkUrl: linkUrl.trim() || undefined,
          articleSource: articleSource.trim() || undefined,
          urlSource: urlSource.trim() || undefined,
          affiliateLinks: affiliateLinks.length ? affiliateLinks : undefined,
          privacy: hasTikTok ? privacy : undefined,
          imageProcessing:
            mediaType === 'image'
              ? {
                  enabled: imageProcessingEnabled,
                  cropSquare: imageCropSquare,
                  scale: imageScale,
                  barHeight: imageBarHeight,
                  showLogo: imageShowLogo,
                  logoUrl: imageLogoUrl.trim() || undefined,
                }
              : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Không thể đăng nội dung');
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const failed = results.filter((item: { ok?: boolean }) => item.ok === false).length;
      await onPublished(
        failed
          ? `Đã đăng ${results.length - failed}/${results.length} kênh. Một số kênh đăng thất bại.`
          : 'Đã lưu chỉnh sửa và đăng bài thành công.',
        failed > 0,
      );
    } catch {
      setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Chỉnh sửa bài chờ duyệt"
      size="large"
      primaryAction={{
        content: 'Lưu chỉnh sửa & đăng',
        onAction: () => void submit(),
        loading: busy,
        disabled: !canPublish,
      }}
      secondaryActions={[{ content: 'Hủy', onAction: onClose, disabled: busy }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error ? <Banner tone="critical">{error}</Banner> : null}
          {unsupportedConnections.length ? (
            <Banner tone="warning">
              {MEDIA_LABEL[mediaType]} chưa được hỗ trợ bởi:{' '}
              {unsupportedConnections.map((connection) => PLATFORM_NAMES[connection.provider]).join(', ')}.
            </Banner>
          ) : null}

          <InlineGrid columns={{ xs: 1, md: '2fr 1fr' }} gap="400">
            <BlockStack gap="300">
              <TextField label="Tiêu đề" value={title} onChange={setTitle} autoComplete="off" />
              <TextField
                label="Nguồn bài viết (tùy chọn)"
                value={articleSource}
                onChange={setArticleSource}
                autoComplete="off"
                maxLength={300}
                placeholder="Tên nguồn hoặc URL bài gốc"
                helpText="Chỉ ghi nhận nội bộ, không gửi lên mạng xã hội."
              />
              <TextField
                label="Link bài viết nguồn (tùy chọn)"
                value={urlSource}
                onChange={setUrlSource}
                type="url"
                autoComplete="off"
                placeholder="https://example.com/bai-tham-khao"
                helpText="Link bài tham khảo để mở lại khi cần. Chỉ lưu nội bộ, không gửi lên mạng xã hội."
              />
              <TextField
                label="Nội dung / chú thích"
                value={text}
                onChange={setText}
                multiline={8}
                autoComplete="off"
                showCharacterCount
                maxLength={10_000}
              />
              {mediaType === 'image' || mediaType === 'video' ? (
                <TextField
                  label={mediaType === 'image' ? 'URL hình ảnh công khai' : 'URL video công khai'}
                  value={mediaUrl}
                  onChange={setMediaUrl}
                  type="url"
                  multiline={mediaType === 'image' ? 5 : false}
                  autoComplete="off"
                  helpText={mediaType === 'image' ? 'Có thể nhập nhiều ảnh, mỗi dòng một URL.' : undefined}
                />
              ) : null}

              <TextField
                label="Liên kết đính kèm (tùy chọn)"
                value={linkUrl}
                onChange={setLinkUrl}
                type="url"
                autoComplete="off"
                placeholder="https://example.com/bai-viet"
                helpText={
                  mediaType === 'text'
                    ? 'Facebook và Threads đính kèm link này vào bài chỉ có chữ.'
                    : 'Bài ảnh/video không đính kèm link lên nền tảng; link chỉ được lưu để tra cứu.'
                }
              />

              <TextField
                label="Link affiliate (tùy chọn)"
                value={affiliateLinksText}
                onChange={setAffiliateLinksText}
                multiline={4}
                autoComplete="off"
                placeholder={'https://shopee.vn/abc\nhttps://tiki.vn/xyz'}
                error={invalidAffiliateLinks.length ? `Dòng không chứa URL http(s): ${invalidAffiliateLinks.join(', ')}` : undefined}
                helpText="Mỗi dòng một link — mỗi link sẽ thành một comment riêng dưới bài Facebook. Các nền tảng khác bỏ qua."
              />

              {mediaType === 'image' ? (
                <BlockStack gap="300">
                  <Checkbox
                    label="Xử lý ảnh trước khi đăng (kích thước, scale, khung và logo)"
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
                      <TextField
                        label="Logo riêng (tùy chọn)"
                        value={imageLogoUrl}
                        onChange={setImageLogoUrl}
                        autoComplete="off"
                        placeholder="Để trống để dùng logo mặc định"
                      />
                      <Checkbox label="Chèn logo vào góc ảnh" checked={imageShowLogo} onChange={setImageShowLogo} />
                    </>
                  ) : null}
                </BlockStack>
              ) : null}
            </BlockStack>

            <BlockStack gap="300">
              <Select
                label="Loại nội dung"
                options={(Object.keys(MEDIA_LABEL) as SocialMediaType[]).map((type) => ({
                  label: MEDIA_LABEL[type],
                  value: type,
                }))}
                value={mediaType}
                onChange={(value) => {
                  setMediaType(value as SocialMediaType);
                  setError('');
                }}
              />
              <Text as="h3" variant="headingSm">Nơi đăng</Text>
              {connections === null ? <Text as="p" tone="subdued">Đang tải kết nối...</Text> : null}
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
              {hasTikTok ? (
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
          </InlineGrid>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
