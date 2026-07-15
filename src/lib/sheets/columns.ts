// CỘT CỐ ĐỊNH của Google Sheet quản lý bài viết. Thứ tự cột KHÔNG đổi (khớp header + dựng dòng).
// Cột khoá (upsert) = "slug" (cột A): trùng slug → cập nhật dòng, chưa có → thêm dòng mới.
export interface SheetRowData {
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword: string;
  categories: string; // gộp bằng ", "
  tags: string; // gộp bằng ", "
  coverImageUrl: string;
  locale: string;
  status: string;
  seoScore: number | '';
  aeoScore: number | '';
  geoScore: number | '';
  contentMarkdown: string;
  contentHtml: string;
  publishedUrl: string;
  updatedAt: string;
}

interface ColumnDef {
  header: string; // nhãn dòng tiêu đề trong Sheet
  value: (r: SheetRowData) => string;
}

// Thứ tự cột = thứ tự trong mảng. Cột đầu tiên PHẢI là slug (khoá upsert).
const COLUMNS: ColumnDef[] = [
  { header: 'slug', value: (r) => r.slug },
  { header: 'title', value: (r) => r.title },
  { header: 'meta_description', value: (r) => r.metaDescription },
  { header: 'target_keyword', value: (r) => r.targetKeyword },
  { header: 'categories', value: (r) => r.categories },
  { header: 'tags', value: (r) => r.tags },
  { header: 'cover_image', value: (r) => r.coverImageUrl },
  { header: 'locale', value: (r) => r.locale },
  { header: 'status', value: (r) => r.status },
  { header: 'seo_score', value: (r) => String(r.seoScore) },
  { header: 'aeo_score', value: (r) => String(r.aeoScore) },
  { header: 'geo_score', value: (r) => String(r.geoScore) },
  { header: 'content_markdown', value: (r) => r.contentMarkdown },
  { header: 'content_html', value: (r) => r.contentHtml },
  { header: 'published_url', value: (r) => r.publishedUrl },
  { header: 'updated_at', value: (r) => r.updatedAt },
];

export const SHEET_HEADERS: string[] = COLUMNS.map((c) => c.header);
export const SHEET_COL_COUNT = COLUMNS.length;
export const SHEET_KEY_HEADER = COLUMNS[0].header; // "slug"

// Dựng một dòng (mảng chuỗi theo đúng thứ tự cột) từ dữ liệu bài.
export function buildRow(data: SheetRowData): string[] {
  return COLUMNS.map((c) => c.value(data));
}

// Chữ cái cột cuối (A..Z, AA..) cho phạm vi A1 notation. Đủ dùng tới 702 cột.
export function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export const SHEET_LAST_COL = colLetter(SHEET_COL_COUNT);
