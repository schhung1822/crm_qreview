import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/security/safe-fetch', () => ({ safeFetch: vi.fn(), safeFetchBuffer: vi.fn() }));

import { safeFetch, safeFetchBuffer } from '../src/lib/security/safe-fetch';
import { publishSocial, testSocialConnection } from '../src/lib/social-publishing';

const mockFetch = safeFetch as unknown as ReturnType<typeof vi.fn>;
const mockBuffer = safeFetchBuffer as unknown as ReturnType<typeof vi.fn>;

function response(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockBuffer.mockReset();
});

describe('social connections', () => {
  it('kiểm tra Facebook Page bằng Page ID và access token', async () => {
    mockFetch.mockResolvedValue(response({ id: 'page_1', name: 'Trang' }));
    await expect(testSocialConnection('facebook', { pageId: 'page_1', accessToken: 'secret' })).resolves.toEqual({ ok: true });
    expect(mockFetch.mock.calls[0][0]).toContain('/page_1?fields=id,name&access_token=secret');
  });

  it('đăng ảnh Facebook qua endpoint photos', async () => {
    mockFetch.mockResolvedValue(response({ post_id: 'page_1_99' }));
    const result = await publishSocial(
      'facebook',
      { pageId: 'page_1', accessToken: 'secret' },
      { mediaType: 'image', mediaUrl: 'https://cdn.example.com/a.jpg', text: 'Chú thích' },
    );
    expect(mockFetch.mock.calls[0][0]).toContain('/page_1/photos');
    expect(String(mockFetch.mock.calls[0][1].body)).toContain('url=https%3A%2F%2Fcdn.example.com%2Fa.jpg');
    expect(result.status).toBe('published');
  });

  it('Instagram tạo container rồi publish', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ id: 'container_1' }))
      .mockResolvedValueOnce(response({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'media_1' }))
      .mockResolvedValueOnce(response({ permalink: 'https://instagram.com/p/1' }));
    const result = await publishSocial(
      'instagram',
      { instagramUserId: 'ig_1', accessToken: 'secret' },
      { mediaType: 'image', mediaUrl: 'https://cdn.example.com/a.jpg', text: 'Ảnh mới' },
    );
    expect(mockFetch.mock.calls[0][0]).toContain('/ig_1/media');
    expect(mockFetch.mock.calls[2][0]).toContain('/ig_1/media_publish');
    expect(result.url).toBe('https://instagram.com/p/1');
  });

  it('TikTok truy vấn creator trước khi gửi video', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ data: { privacy_level_options: ['SELF_ONLY'] } }))
      .mockResolvedValueOnce(response({ data: { publish_id: 'pub_1' }, error: { code: 'ok' } }));
    const result = await publishSocial(
      'tiktok',
      { accessToken: 'secret' },
      { mediaType: 'video', mediaUrl: 'https://cdn.example.com/v.mp4', text: 'Video mới', privacy: 'SELF_ONLY' },
    );
    expect(mockFetch.mock.calls[0][0]).toContain('/creator_info/query/');
    expect(mockFetch.mock.calls[1][0]).toContain('/video/init/');
    expect(result).toMatchObject({ id: 'pub_1', status: 'processing' });
  });

  it('YouTube làm mới token và upload video resumable', async () => {
    mockBuffer.mockResolvedValue({ buffer: Buffer.from('video'), contentType: 'video/mp4' });
    mockFetch
      .mockResolvedValueOnce(response({ access_token: 'fresh-token' }))
      .mockResolvedValueOnce(response({}, 200, { location: 'https://upload.youtube.com/session/1' }))
      .mockResolvedValueOnce(response({ id: 'yt_1' }));
    const result = await publishSocial(
      'youtube',
      { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
      { mediaType: 'video', mediaUrl: 'https://cdn.example.com/v.mp4', text: 'Mô tả', title: 'Video' },
    );
    expect(mockFetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(mockFetch.mock.calls[1][0]).toContain('uploadType=resumable');
    expect(mockFetch.mock.calls[2][0]).toBe('https://upload.youtube.com/session/1');
    expect(result.url).toBe('https://www.youtube.com/watch?v=yt_1');
  });
});
