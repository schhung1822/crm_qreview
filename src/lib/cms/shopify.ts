// Adapter Shopify - Admin REST API (Blog / Article) + custom app access token.
// baseUrl = shop domain (vd my-store.myshopify.com). credentials = { accessToken, blogId? }.
// SEO title/description set qua metafields global (title_tag / description_tag).
import { safeFetch } from '../security/safe-fetch';
import type {
  CmsAdapter,
  CmsConnectionConfig,
  CmsPost,
  CmsPostInput,
} from './types';

const API_VERSION = '2024-10';

// Lỗi xác thực/kết nối Shopify với gợi ý xử lý cụ thể (hiện cho người dùng khi Test).
function shopifyAuthError(status: number): Error {
  if (status === 401) {
    return new Error(
      'Token không hợp lệ (401). Phải dùng "Admin API access token" (bắt đầu shpat_) ở tab ' +
        'API credentials - KHÔNG phải "API key" hay "API secret key". Nếu chưa Install app thì ' +
        'Install trước; token chỉ hiện 1 lần sau khi Install (lỡ mất thì Uninstall rồi Install lại để lấy token mới).',
    );
  }
  if (status === 403) {
    return new Error(
      'Token thiếu quyền (403). Trong app bật scope read_content + write_content (mục Store content) rồi Install lại app.',
    );
  }
  if (status === 404) {
    return new Error(
      'Không tìm thấy cửa hàng (404). Kiểm tra Store domain đúng dạng your-store.myshopify.com (không kèm https:// hay dấu /).',
    );
  }
  if (status === 423) {
    return new Error('Cửa hàng đang bị khóa/đóng băng (423).');
  }
  return new Error(`Shopify trả lỗi (HTTP ${status}). Kiểm tra lại store domain và token.`);
}

// Log body lỗi server-side, trả client thông báo chung (tránh lộ chi tiết upstream).
async function shopifyError(res: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* bỏ qua */
  }
  console.error(`[Shopify] ${label} ${res.status}: ${detail}`);
  return new Error(`Shopify ${label} lỗi (HTTP ${res.status})`);
}

export class ShopifyAdapter implements CmsAdapter {
  private shop: string;
  private token: string;
  private blogId?: string;

  constructor(config: CmsConnectionConfig) {
    // Chấp nhận "store.myshopify.com" hoặc "https://store.myshopify.com/..."; bỏ scheme,
    // bỏ mọi đường dẫn phía sau, cắt khoảng trắng. Token cũng phải cắt khoảng trắng/xuống
    // dòng khi copy (dư khoảng trắng → Shopify trả 401).
    this.shop = (config.baseUrl || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .trim();
    this.token = (config.credentials.accessToken || '').trim();
    this.blogId = (config.credentials.blogId || '').trim() || undefined;
  }

  private base(): string {
    return `https://${this.shop}/admin/api/${API_VERSION}`;
  }

  private headers(): HeadersInit {
    return { 'X-Shopify-Access-Token': this.token, 'Content-Type': 'application/json' };
  }

  async testConnection(): Promise<boolean> {
    // Kiểm tra quyền NỘI DUNG (blog/article) - đúng quyền app này cần, thay vì /shop.json
    // (có thể bị 403 nếu app chỉ có scope content). Báo lỗi rõ lý do để dễ sửa.
    const res = await safeFetch(`${this.base()}/blogs.json?limit=1`, { headers: this.headers() });
    if (res.ok) return true;
    throw shopifyAuthError(res.status);
  }

  private async resolveBlogId(): Promise<string> {
    if (this.blogId) return this.blogId;
    const res = await safeFetch(`${this.base()}/blogs.json`, { headers: this.headers() });
    if (!res.ok) throw await shopifyError(res, 'blogs');
    const data = (await res.json()) as { blogs?: Array<{ id: number }> };
    const id = data.blogs?.[0]?.id;
    if (!id) throw new Error('Cửa hàng Shopify chưa có Blog nào. Tạo 1 blog trước.');
    this.blogId = String(id);
    return this.blogId;
  }

  // Tìm id bài theo URL (handle cuối path).
  async findPostByUrl(url: string): Promise<string | null> {
    let handle = '';
    try {
      handle = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return null;
    }
    if (!handle) return null;
    const blogId = await this.resolveBlogId();
    const res = await safeFetch(
      `${this.base()}/blogs/${blogId}/articles.json?handle=${encodeURIComponent(handle)}`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { articles?: Array<{ id: number }> };
    return data.articles?.[0]?.id ? String(data.articles[0].id) : null;
  }

  async listPosts(opts?: { search?: string; perPage?: number }): Promise<CmsPost[]> {
    const blogId = await this.resolveBlogId();
    const params = new URLSearchParams({ limit: String(opts?.perPage ?? 20) });
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles.json?${params}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await shopifyError(res, 'listPosts');
    const data = (await res.json()) as { articles?: ShopifyArticle[] };
    return (data.articles ?? []).map((a) => this.toCmsPost(a));
  }

  async getPost(id: string): Promise<CmsPost> {
    const blogId = await this.resolveBlogId();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await shopifyError(res, 'getPost');
    const data = (await res.json()) as { article: ShopifyArticle };
    return this.toCmsPost(data.article);
  }

  async createPost(input: CmsPostInput): Promise<CmsPost> {
    const blogId = await this.resolveBlogId();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ article: this.toBody(input) }),
    });
    if (!res.ok) throw await shopifyError(res, 'createPost');
    const data = (await res.json()) as { article: ShopifyArticle };
    return this.toCmsPost(data.article);
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const blogId = await this.resolveBlogId();
    const res = await safeFetch(`${this.base()}/blogs/${blogId}/articles/${encodeURIComponent(id)}.json`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ article: { id: Number(id), ...this.toBody(input) } }),
    });
    if (!res.ok) throw await shopifyError(res, 'updatePost');
    const data = (await res.json()) as { article: ShopifyArticle };
    return this.toCmsPost(data.article);
  }

  async uploadMedia(file: { url?: string; filename: string }): Promise<{ id: string; url: string }> {
    // Ảnh bài Shopify gắn trực tiếp khi tạo (article.image.src). Ở đây trả url passthrough.
    if (file.url) return { id: file.filename, url: file.url };
    throw new Error('Shopify uploadMedia: cần url ảnh (Files API chưa cấu hình).');
  }

  private toBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    // Chỉ gửi field được cung cấp (cập nhật một phần không đụng các field khác).
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.contentHtml !== undefined) body.body_html = input.contentHtml;
    if (input.slug !== undefined) body.handle = input.slug;
    // CHỈ đổi trạng thái khi truyền status rõ ràng → tránh bỏ đăng bài khi sửa nội dung.
    if (input.status) body.published = input.status === 'publish';
    if (input.tags?.length) body.tags = input.tags.join(', ');
    const metafields: unknown[] = [];
    if (input.title) {
      metafields.push({
        key: 'title_tag',
        namespace: 'global',
        value: input.title,
        type: 'single_line_text_field',
      });
    }
    if (input.metaDescription) {
      metafields.push({
        key: 'description_tag',
        namespace: 'global',
        value: input.metaDescription,
        type: 'multi_line_text_field',
      });
    }
    if (metafields.length) body.metafields = metafields;
    return body;
  }

  private toCmsPost(a: ShopifyArticle): CmsPost {
    return {
      id: String(a.id),
      title: a.title ?? '',
      slug: a.handle ?? '',
      contentHtml: a.body_html ?? '',
      excerpt: a.summary_html ?? undefined,
      status: a.published_at ? 'publish' : 'draft',
      url: a.handle ? `https://${this.shop}/blogs/news/${a.handle}` : undefined,
      // Shopify lưu tag dạng chuỗi ngăn phẩy; Shopify KHÔNG có chuyên mục (category).
      tags: a.tags
        ? a.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined,
    };
  }
}

interface ShopifyArticle {
  id: number;
  title?: string;
  handle?: string;
  body_html?: string;
  summary_html?: string;
  published_at?: string | null;
  tags?: string;
}
