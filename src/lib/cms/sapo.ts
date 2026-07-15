// Adapter Sapo - Admin REST API (Blog/Article). Private app: Basic Auth (apiKey:apiSecret).
// baseUrl = domain admin của shop (vd your-store.mysapo.net). credentials = { apiKey, apiSecret, blogId? }.
// KHÁC Shopify/Haravan: field nội dung là `content` (không phải body_html); trạng thái qua
// `published_on` (ISO = đã đăng, null = nháp); KHÔNG có field slug/handle (Sapo tự sinh từ title).
import { safeFetch } from '../security/safe-fetch';
import type { CmsAdapter, CmsConnectionConfig, CmsPost, CmsPostInput } from './types';

function sapoAuthError(status: number): Error {
  if (status === 401) {
    return new Error(
      'Xác thực thất bại (401). Kiểm tra API key + API secret của Private App (Basic Auth). ' +
        'Vào Cấu hình → Ứng dụng riêng (Private Apps) để lấy đúng cặp key/secret.',
    );
  }
  if (status === 403) {
    return new Error('Thiếu quyền (403). Bật scope read_content + write_content cho Private App rồi thử lại.');
  }
  if (status === 404) {
    return new Error('Không tìm thấy (404). Kiểm tra domain shop dạng your-store.mysapo.net và Blog ID (nếu nhập).');
  }
  return new Error(`Sapo trả lỗi (HTTP ${status}). Kiểm tra lại domain, key/secret.`);
}

async function sapoError(res: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* bỏ qua */
  }
  console.error(`[Sapo] ${label} ${res.status}: ${detail}`);
  return new Error(`Sapo ${label} lỗi (HTTP ${res.status})`);
}

export class SapoAdapter implements CmsAdapter {
  private host: string;
  private authHeader: string;
  private blogId?: string;
  private blogHandle?: string;

  constructor(config: CmsConnectionConfig) {
    this.host = (config.baseUrl || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim();
    const apiKey = (config.credentials.apiKey || '').trim();
    const apiSecret = (config.credentials.apiSecret || '').trim();
    this.authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    this.blogId = (config.credentials.blogId || '').trim() || undefined;
  }

  private base(): string {
    return `https://${this.host}/admin`;
  }
  private headers(): HeadersInit {
    return { Authorization: this.authHeader, 'Content-Type': 'application/json' };
  }

  async testConnection(): Promise<boolean> {
    const res = await safeFetch(`${this.base()}/blogs.json?limit=1`, { headers: this.headers() });
    if (res.ok) return true;
    throw sapoAuthError(res.status);
  }

  private async resolveBlog(): Promise<string> {
    if (this.blogId) return this.blogId;
    const res = await safeFetch(`${this.base()}/blogs.json`, { headers: this.headers() });
    if (!res.ok) throw await sapoError(res, 'blogs');
    const data = (await res.json()) as { blogs?: Array<{ id: number; handle?: string; alias?: string }> };
    const blog = data.blogs?.[0];
    if (!blog?.id) throw new Error('Shop Sapo chưa có Blog nào. Tạo 1 blog trước khi đăng.');
    this.blogId = String(blog.id);
    this.blogHandle = blog.handle || blog.alias;
    return this.blogId;
  }

  async listPosts(opts?: { perPage?: number }): Promise<CmsPost[]> {
    const blogId = await this.resolveBlog();
    const params = new URLSearchParams({ limit: String(opts?.perPage ?? 20) });
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles.json?${params}`, { headers: this.headers() });
    if (!res.ok) throw await sapoError(res, 'listPosts');
    const data = (await res.json()) as { articles?: SapoArticle[] };
    return (data.articles ?? []).map((a) => this.toCmsPost(a));
  }

  async getPost(id: string): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await sapoError(res, 'getPost');
    const data = (await res.json()) as { article: SapoArticle };
    return this.toCmsPost(data.article);
  }

  async createPost(input: CmsPostInput): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ article: this.toBody(input) }),
    });
    if (!res.ok) throw await sapoError(res, 'createPost');
    const data = (await res.json()) as { article: SapoArticle };
    return this.toCmsPost(data.article);
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ article: { id: Number(id), ...this.toBody(input) } }),
    });
    if (!res.ok) throw await sapoError(res, 'updatePost');
    const data = (await res.json()) as { article: SapoArticle };
    return this.toCmsPost(data.article);
  }

  async uploadMedia(file: { url?: string; data?: Buffer; filename: string }): Promise<{ id?: string; url: string }> {
    if (file.url) return { id: file.filename, url: file.url };
    throw new Error('Sapo: không hỗ trợ tải bytes ảnh trực tiếp (dùng URL công khai).');
  }

  private toBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.contentHtml !== undefined) body.content = input.contentHtml; // Sapo dùng `content`
    // Trạng thái: published_on = ISO khi đăng, null khi nháp. Chỉ đặt khi status truyền rõ ràng.
    if (input.status) body.published_on = input.status === 'publish' ? new Date().toISOString() : null;
    if (input.tags?.length) body.tags = input.tags.join(', ');
    return body;
  }

  private toCmsPost(a: SapoArticle): CmsPost {
    const alias = a.alias || a.handle || '';
    return {
      id: String(a.id),
      title: a.title ?? '',
      slug: alias,
      contentHtml: a.content ?? '',
      status: a.published_on ? 'publish' : 'draft',
      date: a.published_on ?? undefined,
      url: this.host && alias && this.blogHandle ? `https://${this.host}/blogs/${this.blogHandle}/${alias}` : undefined,
      tags: a.tags ? a.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    };
  }
}

interface SapoArticle {
  id: number;
  title?: string;
  alias?: string;
  handle?: string;
  content?: string;
  published_on?: string | null;
  tags?: string;
}
