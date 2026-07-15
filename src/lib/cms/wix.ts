// Adapter Wix - Wix REST API (Blog / Data). Auth bằng API key + site/account id.
// Lưu ý: Wix giới hạn field SEO; field nào API không set được sẽ báo rõ (unsupported).
import { safeFetch } from '../security/safe-fetch';
import { htmlToRicos } from './ricos';
import type {
  CmsAdapter,
  CmsConnectionConfig,
  CmsPost,
  CmsPostInput,
} from './types';

const WIX_API = 'https://www.wixapis.com';

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/webp';
}

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
    const post = toCmsPost(data.draftPost);
    return input.status === 'publish' ? this.publishDraft(post.id, post) : post;
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const res = await safeFetch(`${WIX_API}/blog/v3/draft-posts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ draftPost: this.toWixBody(input) }),
    });
    if (!res.ok) throw await wixError(res, "updatePost");
    const data = (await res.json()) as { draftPost: WixPost };
    const post = toCmsPost(data.draftPost);
    return input.status === 'publish' ? this.publishDraft(post.id, post) : post;
  }

  // Draft-post → xuất bản thật (Wix tách bản nháp và bản đã đăng).
  private async publishDraft(id: string, fallback: CmsPost): Promise<CmsPost> {
    const res = await safeFetch(
      `${WIX_API}/blog/v3/draft-posts/${encodeURIComponent(id)}/publish`,
      { method: 'POST', headers: this.headers() },
    );
    if (!res.ok) throw await wixError(res, 'publish');
    return { ...fallback, status: 'publish' };
  }

  // Upload ảnh lên Wix Media Manager: xin upload URL → PUT bytes → nhận file có URL công khai.
  // URL công khai sẵn → passthrough. Lỗi → ném để publish/run.ts fallback sang APP_URL.
  async uploadMedia(file: { url?: string; data?: Buffer; filename: string }): Promise<{
    id?: string;
    url: string;
  }> {
    if (file.url) return { id: file.filename, url: file.url };
    if (!file.data) throw new Error('Wix uploadMedia: thiếu dữ liệu ảnh.');
    const mimeType = mimeFromName(file.filename);

    // 1) Xin URL tải lên.
    const genRes = await safeFetch(`${WIX_API}/site-media/v1/files/generate-upload-url`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ mimeType, fileName: file.filename }),
    });
    if (!genRes.ok) throw await wixError(genRes, 'generateUploadUrl');
    const gen = (await genRes.json()) as { uploadUrl?: string };
    if (!gen.uploadUrl) throw new Error('Wix: không nhận được uploadUrl.');

    // 2) Tải bytes lên (PUT, kèm filename). uploadUrl đã ký sẵn nên không gửi token Wix.
    const upRes = await safeFetch(
      `${gen.uploadUrl}?filename=${encodeURIComponent(file.filename)}`,
      { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Uint8Array(file.data) },
    );
    if (!upRes.ok) throw new Error(`Wix: tải ảnh lên thất bại (HTTP ${upRes.status}).`);
    const upJson = (await upRes.json()) as {
      file?: { id?: string; url?: string; fileUrl?: string };
    };
    const f = upJson.file;
    const url = f?.url ?? f?.fileUrl;
    if (!url) throw new Error('Wix: không nhận được URL ảnh sau khi tải lên.');
    return { id: f?.id, url };
  }

  private toWixBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.slug !== undefined) body.slug = input.slug;
    const excerpt = input.excerpt ?? input.metaDescription;
    if (excerpt !== undefined) body.excerpt = excerpt;
    // seoData.tags: meta description + JSON-LD. Cần cho Wix vì Ricos STRIP mọi <script> khỏi
    // richContent → JSON-LD nhồi trong content sẽ mất; phải gắn qua seoData custom tag.
    const seoTags: Array<Record<string, unknown>> = [];
    if (input.metaDescription) {
      seoTags.push({ type: 'meta', props: { name: 'description', content: input.metaDescription } });
    }
    if (input.jsonLd) {
      seoTags.push({
        type: 'script',
        props: { type: 'application/ld+json' },
        children: input.jsonLd,
        custom: true,
        disabled: false,
      });
    }
    if (seoTags.length) body.seoData = { tags: seoTags };
    // Wix dùng Ricos richContent (KHÔNG nhận HTML) → chuyển HTML sang cây node Ricos.
    // Bọc try/catch để lỗi chuyển đổi không làm hỏng cả lần đăng.
    if (input.contentHtml !== undefined) {
      try {
        body.richContent = htmlToRicos(input.contentHtml);
      } catch {
        body.richContent = htmlToRicos('');
      }
    }
    return body;
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
