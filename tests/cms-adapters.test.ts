import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock safeFetch (adapter dùng để gọi API) — kiểm URL/header/body dựng đúng + parse phản hồi.
vi.mock('../src/lib/security/safe-fetch', () => ({ safeFetch: vi.fn(), safeFetchBuffer: vi.fn() }));
import { safeFetch } from '../src/lib/security/safe-fetch';
import { HaravanAdapter } from '../src/lib/cms/haravan';
import { SapoAdapter } from '../src/lib/cms/sapo';

const mockFetch = safeFetch as unknown as ReturnType<typeof vi.fn>;

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

function lastPost(): { url: string; init: RequestInit } {
  const calls = mockFetch.mock.calls as Array<[string, RequestInit]>;
  const post = [...calls].reverse().find((c) => (c[1]?.method ?? 'GET') === 'POST');
  if (!post) throw new Error('no POST call');
  return { url: post[0], init: post[1] };
}

describe('HaravanAdapter', () => {
  const cfg = {
    baseUrl: 'https://my-shop.myharavan.com',
    locale: 'vi',
    pathStrategy: 'subdir' as const,
    credentials: { accessToken: 'tok_123' },
  };

  it('createPost: đúng host /web, Bearer, body_html/handle/published/tags', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/blogs.json')) return Promise.resolve(ok({ blogs: [{ id: 1, handle: 'tin-tuc' }] }));
      return Promise.resolve(ok({ article: { id: 10, title: 'T', handle: 'bai-viet', body_html: '<p>x</p>', published: true, published_at: '2026-01-01T00:00:00Z', tags: 'a, b' } }));
    });
    const a = new HaravanAdapter(cfg);
    const post = await a.createPost({ title: 'T', slug: 'bai-viet', contentHtml: '<p>x</p>', status: 'publish', tags: ['a', 'b'] });

    const { url, init } = lastPost();
    expect(url).toBe('https://apis.haravan.com/web/blogs/1/articles.json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_123');
    const body = JSON.parse(init.body as string).article;
    expect(body.body_html).toBe('<p>x</p>');
    expect(body.handle).toBe('bai-viet');
    expect(body.published).toBe(true);
    expect(body.tags).toBe('a, b');

    expect(post.id).toBe('10');
    expect(post.slug).toBe('bai-viet');
    expect(post.status).toBe('publish');
    expect(post.url).toBe('https://my-shop.myharavan.com/blogs/tin-tuc/bai-viet');
    expect(post.tags).toEqual(['a', 'b']);
  });

  it('status draft → published=false', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/blogs.json')) return Promise.resolve(ok({ blogs: [{ id: 1, handle: 'h' }] }));
      return Promise.resolve(ok({ article: { id: 2, title: 'T', handle: 'h2', published: false } }));
    });
    const a = new HaravanAdapter(cfg);
    await a.createPost({ title: 'T', slug: 'h2', contentHtml: 'x', status: 'draft' });
    expect(JSON.parse(lastPost().init.body as string).article.published).toBe(false);
  });

  it('testConnection ném lỗi rõ ràng khi 401', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'no' } as unknown as Response);
    await expect(new HaravanAdapter(cfg).testConnection()).rejects.toThrow(/401/);
  });
});

describe('SapoAdapter', () => {
  const cfg = {
    baseUrl: 'my-shop.mysapo.net',
    locale: 'vi',
    pathStrategy: 'subdir' as const,
    credentials: { apiKey: 'key', apiSecret: 'secret' },
  };

  it('createPost: đúng host /admin, Basic auth, field content + published_on', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/blogs.json')) return Promise.resolve(ok({ blogs: [{ id: 5, handle: 'blog' }] }));
      return Promise.resolve(ok({ article: { id: 20, title: 'T', alias: 'bai', content: '<p>y</p>', published_on: '2026-02-02T00:00:00Z', tags: 'x' } }));
    });
    const a = new SapoAdapter(cfg);
    const post = await a.createPost({ title: 'T', slug: 'bai', contentHtml: '<p>y</p>', status: 'publish', tags: ['x'] });

    const { url, init } = lastPost();
    expect(url).toBe('https://my-shop.mysapo.net/admin/blogs/5/articles.json');
    const expectedAuth = 'Basic ' + Buffer.from('key:secret').toString('base64');
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
    const body = JSON.parse(init.body as string).article;
    expect(body.content).toBe('<p>y</p>'); // Sapo dùng `content`, KHÔNG phải body_html
    expect(body.body_html).toBeUndefined();
    expect(typeof body.published_on).toBe('string'); // publish → ISO
    expect(body.tags).toBe('x');

    expect(post.id).toBe('20');
    expect(post.contentHtml).toBe('<p>y</p>');
    expect(post.slug).toBe('bai');
    expect(post.status).toBe('publish');
    expect(post.url).toBe('https://my-shop.mysapo.net/blogs/blog/bai');
  });

  it('status draft → published_on=null', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/blogs.json')) return Promise.resolve(ok({ blogs: [{ id: 5 }] }));
      return Promise.resolve(ok({ article: { id: 21, title: 'T', content: 'z', published_on: null } }));
    });
    const a = new SapoAdapter(cfg);
    const post = await a.createPost({ title: 'T', slug: 'z', contentHtml: 'z', status: 'draft' });
    expect(JSON.parse(lastPost().init.body as string).article.published_on).toBeNull();
    expect(post.status).toBe('draft');
  });

  it('testConnection ném lỗi rõ ràng khi 403', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'no' } as unknown as Response);
    await expect(new SapoAdapter(cfg).testConnection()).rejects.toThrow(/403/);
  });
});
