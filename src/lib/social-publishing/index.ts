import { safeFetch, safeFetchBuffer } from '../security/safe-fetch';
import type { SocialProvider } from '../connection-providers';

export type SocialMediaType = 'text' | 'image' | 'video';

export interface SocialPublishInput {
  text: string;
  title?: string;
  mediaType: SocialMediaType;
  mediaUrl?: string;
  linkUrl?: string;
  privacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
}

export interface SocialPublishResult {
  id: string;
  url?: string;
  status: 'published' | 'processing';
  message?: string;
}

type Credentials = Record<string, string>;
type JsonObject = Record<string, unknown>;

const META_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

async function readJson(res: Response): Promise<JsonObject> {
  const data = (await res.json().catch(() => ({}))) as JsonObject;
  if (!res.ok) {
    const nested = data.error as { message?: string; code?: string | number } | undefined;
    throw new Error(nested?.message || String(data.message || `API trả về lỗi ${res.status}`));
  }
  return data;
}

async function apiJson(url: string, init?: RequestInit): Promise<JsonObject> {
  return readJson(await safeFetch(url, { ...init, timeoutMs: 60_000 }));
}

async function postForm(url: string, values: Record<string, string | number | boolean | undefined>): Promise<JsonObject> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') body.set(key, String(value));
  return apiJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

function required(creds: Credentials, key: string, label = key): string {
  const value = creds[key]?.trim();
  if (!value) throw new Error(`Thiếu ${label}`);
  return value;
}

function requireMedia(input: SocialPublishInput, provider: string): string {
  if (!input.mediaUrl) throw new Error(`${provider} yêu cầu URL ảnh hoặc video công khai`);
  return input.mediaUrl;
}

async function youtubeAccessToken(creds: Credentials): Promise<string> {
  if (creds.accessToken?.trim()) return creds.accessToken.trim();
  const data = await postForm('https://oauth2.googleapis.com/token', {
    client_id: required(creds, 'clientId', 'Google Client ID'),
    client_secret: required(creds, 'clientSecret', 'Google Client Secret'),
    refresh_token: required(creds, 'refreshToken', 'Google Refresh Token'),
    grant_type: 'refresh_token',
  });
  return required(data as Credentials, 'access_token', 'access token từ Google');
}

export async function testSocialConnection(
  provider: SocialProvider,
  credentials: Credentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === 'facebook') {
      const pageId = required(credentials, 'pageId', 'Page ID');
      const token = required(credentials, 'accessToken', 'Page Access Token');
      await apiJson(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(token)}`);
    } else if (provider === 'instagram') {
      const userId = required(credentials, 'instagramUserId', 'Instagram User ID');
      const token = required(credentials, 'accessToken', 'Access Token');
      await apiJson(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(userId)}?fields=id,username&access_token=${encodeURIComponent(token)}`);
    } else if (provider === 'threads') {
      const token = required(credentials, 'accessToken', 'Threads Access Token');
      await apiJson(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
    } else if (provider === 'tiktok') {
      const token = required(credentials, 'accessToken', 'TikTok Access Token');
      await apiJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      const token = await youtubeAccessToken(credentials);
      await apiJson('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Không kết nối được' };
  }
}

async function publishFacebook(creds: Credentials, input: SocialPublishInput): Promise<SocialPublishResult> {
  const pageId = required(creds, 'pageId', 'Page ID');
  const token = required(creds, 'accessToken', 'Page Access Token');
  let endpoint = 'feed';
  const payload: Record<string, string | boolean | undefined> = { access_token: token, message: input.text };
  if (input.mediaType === 'image') {
    endpoint = 'photos';
    payload.url = requireMedia(input, 'Facebook');
    payload.caption = input.text;
    delete payload.message;
  } else if (input.mediaType === 'video') {
    endpoint = 'videos';
    payload.file_url = requireMedia(input, 'Facebook');
    payload.description = input.text;
    payload.title = input.title;
    delete payload.message;
  } else if (input.linkUrl) payload.link = input.linkUrl;
  const data = await postForm(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(pageId)}/${endpoint}`, payload);
  const id = String(data.post_id || data.id || '');
  return { id, url: id ? `https://www.facebook.com/${id}` : undefined, status: 'published' };
}

async function waitForMetaContainer(containerId: string, token: string, host: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const data = await apiJson(`${host}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const status = String(data.status_code || 'FINISHED');
    if (status === 'FINISHED' || status === 'PUBLISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(String(data.status || `Xử lý media thất bại (${status})`));
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Nền tảng vẫn đang xử lý media, vui lòng thử lại sau');
}

async function publishInstagram(creds: Credentials, input: SocialPublishInput): Promise<SocialPublishResult> {
  if (input.mediaType === 'text') throw new Error('Instagram không hỗ trợ bài chỉ có chữ qua API');
  const userId = required(creds, 'instagramUserId', 'Instagram User ID');
  const token = required(creds, 'accessToken', 'Access Token');
  const mediaUrl = requireMedia(input, 'Instagram');
  const host = `https://graph.facebook.com/${META_VERSION}`;
  const created = await postForm(`${host}/${encodeURIComponent(userId)}/media`, {
    access_token: token,
    caption: input.text,
    media_type: input.mediaType === 'video' ? 'REELS' : undefined,
    image_url: input.mediaType === 'image' ? mediaUrl : undefined,
    video_url: input.mediaType === 'video' ? mediaUrl : undefined,
    share_to_feed: input.mediaType === 'video' ? true : undefined,
  });
  const containerId = String(created.id || '');
  if (!containerId) throw new Error('Instagram không trả về mã media');
  await waitForMetaContainer(containerId, token, host);
  const published = await postForm(`${host}/${encodeURIComponent(userId)}/media_publish`, {
    access_token: token,
    creation_id: containerId,
  });
  const id = String(published.id || '');
  const detail: JsonObject = id
    ? await apiJson(`${host}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}))
    : {};
  return { id, url: typeof detail.permalink === 'string' ? detail.permalink : undefined, status: 'published' };
}

async function publishThreads(creds: Credentials, input: SocialPublishInput): Promise<SocialPublishResult> {
  const token = required(creds, 'accessToken', 'Threads Access Token');
  const userId = creds.threadsUserId?.trim() || 'me';
  const mediaUrl = input.mediaType === 'text' ? undefined : requireMedia(input, 'Threads');
  const host = 'https://graph.threads.net/v1.0';
  const created = await postForm(`${host}/${encodeURIComponent(userId)}/threads`, {
    access_token: token,
    media_type: input.mediaType.toUpperCase(),
    text: input.text,
    image_url: input.mediaType === 'image' ? mediaUrl : undefined,
    video_url: input.mediaType === 'video' ? mediaUrl : undefined,
    link_attachment_url: input.mediaType === 'text' ? input.linkUrl : undefined,
  });
  const containerId = String(created.id || '');
  if (!containerId) throw new Error('Threads không trả về mã bài đăng');
  if (input.mediaType === 'video') await waitForMetaContainer(containerId, token, host);
  const published = await postForm(`${host}/${encodeURIComponent(userId)}/threads_publish`, {
    access_token: token,
    creation_id: containerId,
  });
  const id = String(published.id || '');
  const detail: JsonObject = id
    ? await apiJson(`${host}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}))
    : {};
  return { id, url: typeof detail.permalink === 'string' ? detail.permalink : undefined, status: 'published' };
}

async function publishTikTok(creds: Credentials, input: SocialPublishInput): Promise<SocialPublishResult> {
  if (input.mediaType === 'text') throw new Error('TikTok không hỗ trợ bài chỉ có chữ qua Content Posting API');
  const token = required(creds, 'accessToken', 'TikTok Access Token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
  const creator = await apiJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers });
  const creatorData = (creator.data || {}) as { privacy_level_options?: string[] };
  const allowed = creatorData.privacy_level_options || [];
  const requestedPrivacy = input.privacy || 'SELF_ONLY';
  const privacy = allowed.includes(requestedPrivacy) ? requestedPrivacy : allowed.includes('SELF_ONLY') ? 'SELF_ONLY' : allowed[0];
  if (!privacy) throw new Error('TikTok không trả về quyền riêng tư khả dụng cho tài khoản này');
  const mediaUrl = requireMedia(input, 'TikTok');
  const endpoint = input.mediaType === 'image'
    ? 'https://open.tiktokapis.com/v2/post/publish/content/init/'
    : 'https://open.tiktokapis.com/v2/post/publish/video/init/';
  const body = input.mediaType === 'image'
    ? {
        media_type: 'PHOTO',
        post_mode: 'DIRECT_POST',
        post_info: {
          title: (input.title || input.text).slice(0, 90),
          description: input.text.slice(0, 4000),
          privacy_level: privacy,
          disable_comment: false,
          auto_add_music: false,
          brand_content_toggle: false,
          brand_organic_toggle: false,
        },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [mediaUrl] },
      }
    : {
        post_info: {
          title: input.text.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          brand_content_toggle: false,
          brand_organic_toggle: false,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl },
      };
  const data = await apiJson(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const publishData = (data.data || {}) as { publish_id?: string };
  if (!publishData.publish_id) throw new Error(String((data.error as JsonObject | undefined)?.message || 'TikTok không trả về mã xuất bản'));
  return {
    id: publishData.publish_id,
    status: 'processing',
    message: 'TikTok đã nhận nội dung và đang kiểm duyệt/xử lý.',
  };
}

async function publishYouTube(creds: Credentials, input: SocialPublishInput): Promise<SocialPublishResult> {
  if (input.mediaType !== 'video') throw new Error('YouTube Data API chỉ hỗ trợ đăng video');
  const token = await youtubeAccessToken(creds);
  const mediaUrl = requireMedia(input, 'YouTube');
  const media = await safeFetchBuffer(mediaUrl, { timeoutMs: 120_000 }, 200 * 1024 * 1024);
  const metadata = {
    snippet: { title: (input.title || input.text || 'Video mới').slice(0, 100), description: input.text.slice(0, 5000) },
    status: { privacyStatus: creds.privacyStatus || 'private', selfDeclaredMadeForKids: false },
  };
  const init = await safeFetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    timeoutMs: 60_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(media.buffer.length),
      'X-Upload-Content-Type': media.contentType,
    },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) await readJson(init);
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube không trả về URL tải video');
  const uploadResponse = await safeFetch(uploadUrl, {
    method: 'PUT',
    timeoutMs: 10 * 60_000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': media.contentType, 'Content-Length': String(media.buffer.length) },
    body: new Uint8Array(media.buffer),
  });
  const uploaded = await readJson(uploadResponse);
  const id = String(uploaded.id || '');
  return { id, url: id ? `https://www.youtube.com/watch?v=${id}` : undefined, status: 'published' };
}

export async function publishSocial(
  provider: SocialProvider,
  credentials: Credentials,
  input: SocialPublishInput,
): Promise<SocialPublishResult> {
  if (provider === 'facebook') return publishFacebook(credentials, input);
  if (provider === 'instagram') return publishInstagram(credentials, input);
  if (provider === 'threads') return publishThreads(credentials, input);
  if (provider === 'tiktok') return publishTikTok(credentials, input);
  return publishYouTube(credentials, input);
}
