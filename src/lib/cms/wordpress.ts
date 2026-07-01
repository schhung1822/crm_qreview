// Adapter WordPress - REST API /wp-json/wp/v2 + Application Password (Basic auth).
// Meta SEO map theo plugin (Yoast/RankMath) cấu hình ở Connection.
import { safeFetch, safeFetchBuffer } from '../security/safe-fetch';
import type {
  CmsAdapter,
  CmsConnectionConfig,
  CmsPost,
  CmsPostInput,
  CmsTaxonomyTerm,
  ListPostsOpts,
} from './types';

// Đọc body lỗi để LOG phía server (chẩn đoán) nhưng KHÔNG ném ra client (tránh lộ
// nội dung nội bộ / chi tiết CMS). Client chỉ nhận thông báo chung + mã trạng thái.
async function cmsError(res: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    /* bỏ qua */
  }
  console.error(`[WordPress] ${label} ${res.status}: ${detail}`);
  return new Error(`${label} lỗi (HTTP ${res.status})`);
}

export class WordPressAdapter implements CmsAdapter {
  private base: string;
  private auth: string;
  private seoPlugin: string;

  constructor(config: CmsConnectionConfig) {
    this.base = config.baseUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    const { username, appPassword } = config.credentials;
    this.auth =
      'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.seoPlugin = config.seoPlugin ?? 'none';
  }

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = { Authorization: this.auth };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async testConnection(): Promise<boolean> {
    const res = await safeFetch(`${this.base}/users/me`, { headers: this.headers(false) });
    return res.ok;
  }

  async listPosts(opts?: ListPostsOpts): Promise<CmsPost[]> {
    const common: Record<string, string> = { orderby: 'date', order: 'desc' };
    if (opts?.search) common.search = opts.search;
    if (opts?.after) common.after = opts.after;
    if (opts?.before) common.before = opts.before;
    // Lọc trạng thái (cần auth để xem nháp). Mặc định: published.
    if (opts?.status === 'draft') common.status = 'draft';
    else if (opts?.status === 'any') common.status = 'publish,draft,future,pending,private';

    // Toàn bộ bài → phân trang per_page=100 cho tới khi hết (chặn 50 trang ~ 5000 bài).
    if (opts?.all) {
      const acc: WpPost[] = [];
      for (let page = 1; page <= 50; page++) {
        const params = new URLSearchParams({ ...common, per_page: '100', page: String(page) });
        const res = await safeFetch(`${this.base}/posts?${params}`, { headers: this.headers(false) });
        if (!res.ok) break; // hết trang → WP trả 400
        const batch = (await res.json()) as WpPost[];
        acc.push(...batch);
        if (batch.length < 100) break;
      }
      return acc.map(toCmsPost);
    }

    const params = new URLSearchParams({
      ...common,
      per_page: String(Math.min(100, opts?.perPage ?? 20)),
      page: String(opts?.page ?? 1),
    });
    const res = await safeFetch(`${this.base}/posts?${params}`, { headers: this.headers(false) });
    if (!res.ok) throw await cmsError(res, 'listPosts');
    const data = (await res.json()) as WpPost[];
    return data.map(toCmsPost);
  }

  async getPost(id: string): Promise<CmsPost> {
    // _embed=wp:term → kèm TÊN category/tag (để giữ nguyên khi nhập về sửa & đăng lại).
    const res = await safeFetch(
      `${this.base}/posts/${encodeURIComponent(id)}?context=edit&_embed=wp:term`,
      { headers: this.headers(false) },
    );
    if (!res.ok) throw await cmsError(res, 'getPost');
    return toCmsPost((await res.json()) as WpPost);
  }

  async createPost(input: CmsPostInput): Promise<CmsPost> {
    const res = await safeFetch(`${this.base}/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.toWpBody(input)),
    });
    if (!res.ok) throw await cmsError(res, 'createPost');
    return toCmsPost((await res.json()) as WpPost);
  }

  async updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost> {
    const res = await safeFetch(`${this.base}/posts/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.toWpBody(input)),
    });
    if (!res.ok) throw await cmsError(res, 'updatePost');
    return toCmsPost((await res.json()) as WpPost);
  }

  async uploadMedia(file: {
    url?: string;
    data?: Buffer;
    filename: string;
  }): Promise<{ id: string; url: string }> {
    let body: Buffer;
    if (file.data) body = file.data;
    // Tải ảnh từ URL ngoài: qua safeFetchBuffer (chắn SSRF + giới hạn dung lượng).
    else if (file.url) body = (await safeFetchBuffer(file.url)).buffer;
    else throw new Error('uploadMedia: cần url hoặc data');

    const res = await safeFetch(`${this.base}/media`, {
      method: 'POST',
      headers: {
        Authorization: this.auth,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        // WP cần đúng mime của ảnh (octet-stream sẽ bị từ chối → ảnh không lên).
        'Content-Type': mimeFromName(file.filename),
      },
      body: body as unknown as BodyInit,
    });
    if (!res.ok) throw await cmsError(res, 'uploadMedia');
    const m = (await res.json()) as { id: number; source_url: string };
    return { id: String(m.id), url: m.source_url };
  }

  // Tìm id bài theo URL (slug cuối path). Thử posts rồi pages.
  async findPostByUrl(url: string): Promise<string | null> {
    let last = '';
    try {
      last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return null;
    }
    if (!last) return null;
    // Nhiều permalink có đuôi .html/.htm/.php (Blogger, WP cấu hình đuôi…) nhưng slug WP
    // thường KHÔNG có đuôi → thử cả bản gốc lẫn bản đã bỏ đuôi để khớp được cả hai kiểu.
    const noExt = last.replace(/\.(html?|php|aspx?)$/i, '');
    const slugs = [...new Set([last, noExt].filter(Boolean))];
    for (const slug of slugs) {
      for (const kind of ['posts', 'pages'] as const) {
        const res = await safeFetch(
          `${this.base}/${kind}?slug=${encodeURIComponent(slug)}&per_page=1`,
          { headers: this.headers(false) },
        );
        if (!res.ok) continue;
        const arr = (await res.json()) as Array<{ id: number }>;
        if (arr[0]?.id) return String(arr[0].id);
      }
    }
    return null;
  }

  // Lấy taxonomy có sẵn trên site để người dùng chọn khi đăng.
  async listCategories(): Promise<CmsTaxonomyTerm[]> {
    return this.listTerms('categories');
  }

  async listTags(): Promise<CmsTaxonomyTerm[]> {
    return this.listTerms('tags');
  }

  private async listTerms(kind: 'categories' | 'tags'): Promise<CmsTaxonomyTerm[]> {
    const res = await safeFetch(`${this.base}/${kind}?per_page=100&orderby=count&order=desc`, {
      headers: this.headers(false),
    });
    if (!res.ok) throw await cmsError(res, `list ${kind}`);
    const data = (await res.json()) as Array<{ id: number; name: string }>;
    return data.map((c) => ({ id: String(c.id), name: c.name }));
  }

  // Tạo tag theo tên nếu chưa có; trả id. Cho phép gắn tag mới khi đăng.
  async ensureTags(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const clean = name.trim();
      if (!clean) continue;
      const found = await safeFetch(
        `${this.base}/tags?search=${encodeURIComponent(clean)}&per_page=1`,
        { headers: this.headers(false) },
      );
      if (found.ok) {
        const arr = (await found.json()) as Array<{ id: number; name: string }>;
        const exact = arr.find((t) => t.name.toLowerCase() === clean.toLowerCase());
        if (exact) {
          ids.push(String(exact.id));
          continue;
        }
      }
      const created = await safeFetch(`${this.base}/tags`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ name: clean }),
      });
      if (created.ok) {
        const t = (await created.json()) as { id: number };
        ids.push(String(t.id));
      }
    }
    return ids;
  }

  private toWpBody(input: Partial<CmsPostInput>): Record<string, unknown> {
    // CHỈ gửi field được cung cấp → cập nhật một phần (vd chỉ content) KHÔNG đụng
    // các field khác. Quan trọng: không tự set status, tránh biến bài công khai → nháp.
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.slug !== undefined) body.slug = input.slug;
    if (input.contentHtml !== undefined) body.content = input.contentHtml;
    if (input.excerpt !== undefined) body.excerpt = input.excerpt;
    if (input.scheduledAt) {
      body.status = 'future';
      body.date = input.scheduledAt;
    } else if (input.status) {
      // Chỉ đổi trạng thái khi được yêu cầu rõ ràng.
      body.status = input.status === 'publish' ? 'publish' : 'draft';
    }
    if (input.featuredMediaId) body.featured_media = Number(input.featuredMediaId);
    if (input.categories?.length) body.categories = input.categories.map((c) => Number(c)).filter(Boolean);
    if (input.tags?.length) body.tags = input.tags.map((t) => Number(t)).filter(Boolean);
    // Meta SEO theo plugin
    if (input.metaDescription) {
      if (this.seoPlugin === 'yoast') {
        body.meta = { _yoast_wpseo_metadesc: input.metaDescription };
      } else if (this.seoPlugin === 'rankmath') {
        body.meta = { rank_math_description: input.metaDescription };
      }
    }
    return body;
  }
}

// Suy ra mime từ đuôi file để WP nhận đúng loại ảnh.
function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    avif: 'image/avif',
  };
  return map[ext] ?? 'application/octet-stream';
}

interface WpPost {
  id: number;
  slug: string;
  link?: string;
  status: string;
  date?: string;
  date_gmt?: string;
  title: { rendered?: string; raw?: string };
  content: { rendered?: string; raw?: string };
  excerpt?: { rendered?: string; raw?: string };
  categories?: number[]; // ID chuyên mục đã gán
  tags?: number[]; // ID tag đã gán
  // Meta SEO theo plugin (chính field ta GHI khi đăng) - đọc lại để chấm điểm khớp.
  meta?: Record<string, unknown>;
  // Yoast tự thêm object này vào REST khi plugin bật.
  yoast_head_json?: { description?: string; og_description?: string };
  // _embed=wp:term → mảng theo từng taxonomy, mỗi term có {id,name,taxonomy}.
  _embedded?: { 'wp:term'?: Array<Array<{ id: number; name: string; taxonomy: string }>> };
}

// Tên tag từ block _embedded (taxonomy 'post_tag').
function tagNamesFromEmbedded(p: WpPost): string[] | undefined {
  const groups = p._embedded?.['wp:term'];
  if (!groups) return undefined;
  const names = groups
    .flat()
    .filter((t) => t?.taxonomy === 'post_tag')
    .map((t) => t.name)
    .filter(Boolean);
  return names.length ? names : undefined;
}

function stripToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Lấy meta description theo thứ tự ưu tiên: field plugin ta đã ghi (Yoast/RankMath) →
// yoast_head_json (Yoast tính sẵn) → excerpt thủ công. Nhờ vậy nhập lại bài khớp lúc đăng.
export function metaDescriptionOf(p: {
  meta?: Record<string, unknown>;
  yoast_head_json?: { description?: string; og_description?: string };
  excerpt?: { rendered?: string; raw?: string };
}): string | undefined {
  const m = (p.meta ?? {}) as Record<string, unknown>;
  const fromMeta =
    (m['_yoast_wpseo_metadesc'] as string | undefined) ||
    (m['rank_math_description'] as string | undefined);
  if (fromMeta && fromMeta.trim()) return fromMeta.trim();

  const yoast = p.yoast_head_json?.description || p.yoast_head_json?.og_description;
  if (yoast && yoast.trim()) return yoast.trim();

  const ex = stripToText(p.excerpt?.raw ?? p.excerpt?.rendered ?? '');
  return ex || undefined;
}

function toCmsPost(p: WpPost): CmsPost {
  return {
    id: String(p.id),
    title: p.title.raw ?? p.title.rendered ?? '',
    slug: p.slug,
    contentHtml: p.content.raw ?? p.content.rendered ?? '',
    excerpt: p.excerpt?.raw ?? p.excerpt?.rendered,
    metaDescription: metaDescriptionOf(p),
    status: p.status === 'publish' ? 'publish' : 'draft',
    url: p.link,
    date: p.date_gmt ? `${p.date_gmt}Z` : p.date,
    categories: p.categories?.length ? p.categories.map(String) : undefined,
    tags: tagNamesFromEmbedded(p),
  };
}
