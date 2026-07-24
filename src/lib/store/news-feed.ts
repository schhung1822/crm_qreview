// BẢNG TIN nền tảng (news-feed) hiển thị ở CỘT PHẢI cho mọi user đăng nhập. Do superadmin soạn.
// Mỗi tin: tiêu đề + nội dung (markdown) + phân loại + ngày đăng + ảnh + link. Sắp theo ghim → ngày.
// Nội dung công khai (mọi user đọc) nên KHÔNG mã hóa. Server-only. Lưu .data/news-feed.json (toàn cục).
import { randomBytes } from 'node:crypto';
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';

// Phân loại tin — cố định, có nhãn i18n phía client (news.cat_*). "important" = tin quan trọng.
export const NEWS_CATEGORIES = ['important', 'update', 'feature', 'event', 'webinar', 'guide'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
const CATSET = new Set<string>(NEWS_CATEGORIES);

export interface NewsItem {
  id: string;
  title: string;
  body: string; // markdown, hiện trong popup
  category: NewsCategory;
  url?: string; // link kèm (mở tab mới nếu http(s), same-tab nếu "/…")
  imageUrl?: string; // ảnh thumbnail (http(s) hoặc "/…")
  publishedAt: string; // ISO — mốc thời gian sắp xếp + hiển thị
  pinned: boolean; // ghim lên đầu bất kể ngày
  enabled: boolean;
}
export interface NewsFeedConfig {
  enabled: boolean; // bật/tắt cả bảng tin
  items: NewsItem[];
}

const FILE = 'news-feed.json';
const DEFAULT: NewsFeedConfig = { enabled: false, items: [] };
const MAX_ITEMS = 100;

// Chỉ giữ url http(s) tuyệt đối hoặc đường dẫn nội bộ "/…"; còn lại bỏ (chống javascript:, data: lạ).
function safeUrl(raw: unknown, max: number): string {
  const url = String(raw ?? '').trim().slice(0, max);
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return '';
}

// Chuẩn hóa ISO: nhận YYYY-MM-DD hoặc ISO đầy đủ; sai/thiếu → chuỗi rỗng (đánh dấu để gán mặc định).
function safeIso(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function normItem(raw: Partial<NewsItem>, fallbackDate: string): NewsItem {
  const category = CATSET.has(String(raw.category)) ? (raw.category as NewsCategory) : 'update';
  const url = safeUrl(raw.url, 500);
  const imageUrl = safeUrl(raw.imageUrl, 1000);
  return {
    id: (raw.id && String(raw.id).slice(0, 40)) || randomBytes(8).toString('hex'),
    title: String(raw.title ?? '').trim().slice(0, 200),
    body: String(raw.body ?? '').trim().slice(0, 8000),
    category,
    ...(url ? { url } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    publishedAt: safeIso(raw.publishedAt) || fallbackDate,
    pinned: raw.pinned === true,
    enabled: raw.enabled !== false,
  };
}

// Sắp xếp hiển thị: ghim lên đầu, rồi mới nhất trước.
function sortItems(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

// Cấu hình đầy đủ cho admin sửa (đã sắp xếp sẵn để hiển thị nhất quán).
export async function readNews(): Promise<NewsFeedConfig> {
  const d = await readGlobalConfig<Partial<NewsFeedConfig>>(FILE, DEFAULT);
  const fb = new Date().toISOString();
  const items = Array.isArray(d.items) ? d.items.map((it) => normItem(it, fb)) : [];
  return { enabled: d.enabled === true, items: sortItems(items) };
}

// Bản công khai cho cột phải: chỉ tin đang bật + có tiêu đề. Tắt cả bảng → rỗng.
export async function readNewsPublic(): Promise<NewsFeedConfig> {
  const d = await readNews();
  if (!d.enabled) return { enabled: false, items: [] };
  return { enabled: true, items: d.items.filter((i) => i.enabled && i.title) };
}

export interface NewsPatch {
  enabled?: boolean;
  items?: Array<Partial<NewsItem>>;
}

// Lưu toàn bộ (admin gửi cả danh sách). Chuẩn hóa + sắp xếp trước khi ghi.
export async function saveNews(patch: NewsPatch): Promise<NewsFeedConfig> {
  return mutateGlobalConfig<Partial<NewsFeedConfig>, NewsFeedConfig>(FILE, DEFAULT, (cur) => {
    const fb = new Date().toISOString();
    const src = Array.isArray(patch.items) ? patch.items : Array.isArray(cur.items) ? cur.items : [];
    const items = sortItems(src.slice(0, MAX_ITEMS).map((it) => normItem(it, fb)));
    const next: NewsFeedConfig = {
      enabled: patch.enabled !== undefined ? patch.enabled === true : cur.enabled === true,
      items,
    };
    return [next, next];
  });
}
