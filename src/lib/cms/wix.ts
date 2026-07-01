// Adapter Wix - Wix REST API (Blog / Data). Auth bằng API key + site/account id.
// Lưu ý: Wix giới hạn field SEO; field nào API không set được sẽ báo rõ (unsupported).
import { safeFetch } from '../security/safe-fetch';
import type {
  CmsAdapter,
  CmsConnectionConfig,
  CmsPost,
  CmsPostInput,
} from './types';

const WIX_API = 'https://www.wixapis.com';

async function wixError(res: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* bỏ qua */
  }
  console.error(`[Wix] ${label} ${res.status}: ${detail}`);
  return new Error(`Wix ${label} lỗi (HTTP ${res.status})`);
}

export class WixAdapter implements CmsAdapter {
  private apiKey: string;
  private siteId: string;
  private accountId: string;
  public readonly unsupported = ['categories', 'tags'] as const;

  constructor(config: CmsConnectionConfig) {
    this.apiKey = config.credentials.apiKey;
    this.siteId = config.credentials.siteId;
    this.accountId = config.credentials.accountId ?? '';
  }

  private headers(): HeadersInit {
    return {
      Authorization: this.apiKey,
      'Content-Type': 'application/json',
      'wix-site-id': this.siteId,
      ...(this.accountId ? { 'wix-account-id': this.accountId } : {}),
    };
  }

  async testConnection(): Promise<boolean> {
    const res = await safeFetch(`${WIX_API}/blog/v3/posts?paging.limit=1`, {
      headers: this.headers(),
    });
    return res.ok;
  }

  async listPosts(opts?: { perPage?: number }): Promise<CmsPost[]> {
    const res = await safeFetch(
      `${WIX_API}/blog/v3/posts?paging.limit=${opts?.perPage ?? 20}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw await wixError(res, "listPosts");
    const data = (await res.json()) as { posts?: WixPost[] };
    return (data.posts ?? []).map(toCmsPost);
  }

  async getPost(id: string): Promise<CmsPost> {
    const res = await safeFetch(`${WIX_API}/blog/v3/posts/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await wixError(res, "getPost");
    const data = (await res.json()) as { post: WixPost };
    return toCmsPost(data.post);
  }

  async createPost(input: CmsPostInput): Promise<CmsPost> {
    const res = await safeFetch(`${WIX_API}/blog/v3/draft-posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ draftPost: this.toWixBody(input) }),
    });
    if (!res.ok) throw await wixError(res, "createPost");
    const data = (await res.json()) as { draftPost: WixPost };
    return toCmsPost(data.draftPost);
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const res = await safeFetch(`${WIX_API}/blog/v3/draft-posts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ draftPost: this.toWixBody(input) }),
    });
    if (!res.ok) throw await wixError(res, "updatePost");
    const data = (await res.json()) as { draftPost: WixPost };
    return toCmsPost(data.draftPost);
  }

  // Wix CHƯA hỗ trợ upload bytes ảnh qua API ở bản này (cần luồng Media Manager riêng).
  // Cờ này để route publish biết & CẢNH BÁO người dùng thay vì im lặng giữ URL local.
  public readonly canUploadLocalMedia = false;

  async uploadMedia(file: { url?: string; data?: Buffer; filename: string }): Promise<{
    id: string;
    url: string;
  }> {
    // Có URL công khai sẵn → passthrough (Wix hiển thị được). Ảnh tạo trong app
    // (bytes local) thì KHÔNG upload được → ném lỗi rõ để route gom thành cảnh báo.
    if (file.url) return { id: file.filename, url: file.url };
    throw new Error(
      'Wix chưa hỗ trợ tải ảnh tạo trong app lên site qua API. Hãy dùng URL ảnh công khai, ' +
        'hoặc tải ảnh thủ công lên Wix Media rồi chèn URL.',
    );
  }

  private toWixBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    return {
      title: input.title,
      // Wix dùng rich-content; ở scaffold đưa HTML vào field excerpt/seo cơ bản.
      excerpt: input.excerpt ?? input.metaDescription,
      seoData: input.metaDescription
        ? { tags: [{ type: 'meta', props: { name: 'description', content: input.metaDescription } }] }
        : undefined,
      slug: input.slug,
    };
  }
}

interface WixPost {
  id: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  url?: { path?: string };
}

function toCmsPost(p: WixPost): CmsPost {
  return {
    id: p.id,
    title: p.title ?? '',
    slug: p.slug ?? '',
    contentHtml: '',
    excerpt: p.excerpt,
    status: 'draft',
    url: p.url?.path,
  };
}
