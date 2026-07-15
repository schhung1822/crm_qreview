// Interface chung cho mọi CMS. WordPress, Wix & Shopify đều implement interface này.
export type CmsProvider = 'wordpress' | 'wix' | 'shopify' | 'haravan' | 'sapo';

export interface CmsPost {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
  excerpt?: string;
  metaDescription?: string;
  status: 'draft' | 'publish' | 'scheduled';
  url?: string;
  date?: string; // ngày đăng (ISO) để lọc/hiển thị
  // Taxonomy hiện có của bài (để giữ nguyên khi nhập về sửa & đăng lại):
  tags?: string[]; // TÊN tag
  categories?: string[]; // ID chuyên mục (khớp listCategories().id)
}

export interface ListPostsOpts {
  search?: string;
  perPage?: number;
  page?: number;
  after?: string; // ISO - bài đăng SAU mốc này
  before?: string; // ISO - bài đăng TRƯỚC mốc này
  all?: boolean; // true → lấy TẤT CẢ bài (phân trang hết)
  status?: 'publish' | 'draft' | 'any'; // mặc định: published
  // Chỉ lấy field NHẸ (id/slug/title/ngày/link) - KHÔNG lấy nội dung. Dùng cho danh sách quét:
  // tránh CMS chậm (WordPress dựng content + yoast_head_json rất tốn thời gian trên host yếu).
  summary?: boolean;
}

export interface CmsPostInput {
  title: string;
  slug: string;
  contentHtml: string;
  excerpt?: string;
  metaDescription?: string;
  status?: 'draft' | 'publish' | 'scheduled';
  scheduledAt?: string;
  featuredMediaId?: string;
  categories?: string[];
  tags?: string[];
  // hreflang: các bản dịch khác trong cùng TranslationGroup
  alternates?: Array<{ locale: string; url: string }>;
  // JSON-LD (chuỗi JSON) cho provider mà <script> bị strip khỏi content (Wix → gắn qua seoData).
  // WordPress/Shopify nhúng thẳng vào content nên bỏ qua field này.
  jsonLd?: string;
}

export interface CmsCredentials {
  // WordPress: { username, appPassword }; Wix: { apiKey, siteId, accountId }
  [key: string]: string;
}

export interface CmsConnectionConfig {
  baseUrl: string;
  locale: string;
  pathStrategy: 'subdir' | 'subdomain';
  seoPlugin?: string;
  credentials: CmsCredentials;
}

export interface CmsAdapter {
  testConnection(): Promise<boolean>;
  listPosts(opts?: ListPostsOpts): Promise<CmsPost[]>;
  getPost(id: string): Promise<CmsPost>;
  createPost(input: CmsPostInput): Promise<CmsPost>;
  updatePost(id: string, input: Partial<CmsPostInput>): Promise<CmsPost>;
  // Upload ảnh lên CMS, trả về URL công khai. Cấp `data` (bytes) hoặc `url` (ảnh công khai sẵn).
  // Publish sẽ thử hàm này trước; lỗi (thiếu quyền...) mới fallback sang {APP_URL}/generated/... .
  uploadMedia(file: { url?: string; data?: Buffer; filename: string }): Promise<{
    id?: string;
    url: string;
  }>;
  // Taxonomy có sẵn trên site (chỉ WordPress hỗ trợ đầy đủ). Optional.
  listCategories?(): Promise<CmsTaxonomyTerm[]>;
  listTags?(): Promise<CmsTaxonomyTerm[]>;
  // Tạo tag mới theo tên (nếu chưa có), trả về danh sách id. Optional.
  ensureTags?(names: string[]): Promise<string[]>;
  // Tìm id bài theo URL (slug/handle) - để audit mở đúng bài cần sửa. Optional.
  findPostByUrl?(url: string): Promise<string | null>;
}

export interface CmsTaxonomyTerm {
  id: string;
  name: string;
}
