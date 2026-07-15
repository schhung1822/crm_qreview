// Adapter Haravan - Web Content REST API (Blog/Article). Private app access token (Bearer).
// API host CỐ ĐỊNH https://apis.haravan.com/web (không phụ thuộc domain shop). baseUrl = domain
// công khai của shop (để dựng URL bài + {{website}}). credentials = { accessToken, blogId? }.
import { safeFetch } from '../security/safe-fetch';
import type { CmsAdapter, CmsConnectionConfig, CmsPost, CmsPostInput } from './types';

const API_BASE = 'https://apis.haravan.com/web';

function haravanAuthError(status: number): Error {
  if (status === 401) {
    return new Error(
      'Token không hợp lệ (401). Dùng Access Token của Private App (gửi dạng "Authorization: Bearer ..."). ' +
        'Vào Apps → Private apps để tạo/lấy token; kiểm tra không dư khoảng trắng khi copy.',
    );
  }
  if (status === 403) {
    return new Error('Token thiếu quyền (403). Bật scope read_content + write_content cho Private App rồi thử lại.');
  }
  if (status === 404) {
    return new Error('Không tìm thấy tài nguyên (404). Kiểm tra Blog ID (nếu có nhập) và quyền của token.');
  }
  return new Error(`Haravan trả lỗi (HTTP ${status}). Kiểm tra lại token và cấu hình.`);
}

async function haravanError(res: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* bỏ qua */
  }
  console.error(`[Haravan] ${label} ${res.status}: ${detail}`);
  return new Error(`Haravan ${label} lỗi (HTTP ${res.status})`);
}

export class HaravanAdapter implements CmsAdapter {
  private token: string;
  private blogId?: string;
  private blogHandle?: string;
  private siteDomain: string; // domain công khai của shop (dựng URL bài)

  constructor(config: CmsConnectionConfig) {
    this.token = (config.credentials.accessToken || '').trim();
    this.blogId = (config.credentials.blogId || '').trim() || undefined;
    this.siteDomain = (config.baseUrl || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim();
  }

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async testConnection(): Promise<boolean> {
    const res = await safeFetch(`${API_BASE}/blogs.json?limit=1`, { headers: this.headers() });
    if (res.ok) return true;
    throw haravanAuthError(res.status);
  }

  private async resolveBlog(): Promise<string> {
    if (this.blogId) return this.blogId;
    const res = await safeFetch(`${API_BASE}/blogs.json`, { headers: this.headers() });
    if (!res.ok) throw await haravanError(res, 'blogs');
    const data = (await res.json()) as { blogs?: Array<{ id: number; handle?: string }> };
    const blog = data.blogs?.[0];
    if (!blog?.id) throw new Error('Shop Haravan chưa có Blog nào. Tạo 1 blog trước khi đăng.');
    this.blogId = String(blog.id);
    this.blogHandle = blog.handle;
    return this.blogId;
  }

  async listPosts(opts?: { perPage?: number }): Promise<CmsPost[]> {
    const blogId = await this.resolveBlog();
    const params = new URLSearchParams({ limit: String(opts?.perPage ?? 20) });
    const res = await safeFetch(`${API_BASE}/blogs/${blogId}/articles.json?${params}`, { headers: this.headers() });
    if (!res.ok) throw await haravanError(res, 'listPosts');
    const data = (await res.json()) as { articles?: HaravanArticle[] };
    return (data.articles ?? []).map((a) => this.toCmsPost(a));
  }

  async getPost(id: string): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${API_BASE}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await haravanError(res, 'getPost');
    const data = (await res.json()) as { article: HaravanArticle };
    return this.toCmsPost(data.article);
  }

  async createPost(input: CmsPostInput): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${API_BASE}/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ article: this.toBody(input) }),
    });
    if (!res.ok) throw await haravanError(res, 'createPost');
    const data = (await res.json()) as { article: HaravanArticle };
    return this.toCmsPost(data.article);
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const blogId = await this.resolveBlog();
    const res = await safeFetch(`${API_BASE}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ article: { id: Number(id), ...this.toBody(input) } }),
    });
    if (!res.ok) throw await haravanError(res, 'updatePost');
    const data = (await res.json()) as { article: HaravanArticle };
    return this.toCmsPost(data.article);
  }

  // Haravan không có kho media riêng cho app này → URL công khai passthrough; bytes thô không hỗ trợ
  // (publish sẽ fallback sang {APP_URL}/generated/...). Ảnh nhúng theo <img> trong nội dung.
  async uploadMedia(file: { url?: string; data?: Buffer; filename: string }): Promise<{ id?: string; url: string }> {
    if (file.url) return { id: file.filename, url: file.url };
    throw new Error('Haravan: không hỗ trợ tải bytes ảnh trực tiếp (dùng URL công khai).');
  }

  private toBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.contentHtml !== undefined) body.body_html = input.contentHtml;
    if (input.slug !== undefined) body.handle = input.slug;
    // Chỉ đổi trạng thái khi truyền status rõ ràng (tránh vô tình ẩn bài khi chỉ sửa nội dung).
    if (input.status) body.published = input.status === 'publish';
    if (input.tags?.length) body.tags = input.tags.join(', ');
    return body;
  }

  private toCmsPost(a: HaravanArticle): CmsPost {
    const handle = a.handle ?? '';
    const blogSeg = this.blogHandle || 'blog';
    return {
      id: String(a.id),
      title: a.title ?? '',
      slug: handle,
      contentHtml: a.body_html ?? '',
      excerpt: a.summary_html ?? undefined,
      status: a.published === false ? 'draft' : a.published_at || a.published === true ? 'publish' : 'draft',
      url: this.siteDomain && handle ? `https://${this.siteDomain}/blogs/${blogSeg}/${handle}` : undefined,
      tags: a.tags ? a.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    };
  }
}

interface HaravanArticle {
  id: number;
  title?: string;
  handle?: string;
  body_html?: string;
  summary_html?: string;
  published?: boolean;
  published_at?: string | null;
  tags?: string;
}
