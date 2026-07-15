// Kho bài viết / bản nháp - lưu file .data/articles.json. Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  metaDescription: string;
  markdown: string;
  locale: string;
  targetKeyword?: string;
  tags?: string[];
  categories?: string[]; // ID chuyên mục trên site đích (giữ khi nhập bài cũ về sửa)
  coverImageUrl?: string;
  translationGroupId?: string;
  // 'new' = bài viết mới; 'edited' = bài cũ nhập về & sửa/tối ưu bằng AI.
  source: 'new' | 'edited';
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  // 'review' = đang chờ người có quyền đăng phê duyệt (quy trình duyệt trước khi đăng).
  status: 'draft' | 'review' | 'published';
  // ─── Quy trình phê duyệt ───
  approved?: boolean; // đã được duyệt (đủ điều kiện đăng khi biz bật "bắt buộc duyệt")
  reviewNote?: string; // ghi chú của người duyệt (lý do trả lại)
  submittedBy?: string; // userId người gửi duyệt
  reviewedBy?: string; // userId người duyệt/trả lại
  assignedTo?: string; // userId người được giao phụ trách bài (cho "Việc của tôi")
  connectionId?: string;
  cmsPostId?: string;
  publishedUrl?: string;
  updatedAt: string;
}

const NAME = 'articles.json'; // CÔ LẬP THEO BIZ

// Các field được phép cập nhật qua upsert (whitelist) - KHÔNG dùng Object.assign mù để
// tránh mass-assignment (ghi đè field lạ / không mong muốn).
const UPDATABLE: Array<keyof ArticleRecord> = [
  'title',
  'slug',
  'metaDescription',
  'markdown',
  'locale',
  'targetKeyword',
  'tags',
  'categories',
  'coverImageUrl',
  'translationGroupId',
  'source',
  'seoScore',
  'aeoScore',
  'geoScore',
  'status',
  'approved',
  'reviewNote',
  'submittedBy',
  'reviewedBy',
  'assignedTo',
  'connectionId',
  'cmsPostId',
  'publishedUrl',
];

async function readAll(): Promise<ArticleRecord[]> {
  return readJson<ArticleRecord[]>(bizFile(NAME), []);
}

export async function listArticles(): Promise<ArticleRecord[]> {
  return (await readAll()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getArticle(id: string): Promise<ArticleRecord | null> {
  return (await readAll()).find((a) => a.id === id) ?? null;
}

export async function upsertArticle(
  input: Partial<ArticleRecord> & { title: string; locale: string },
): Promise<ArticleRecord> {
  const now = new Date().toISOString();
  return mutateJson<ArticleRecord[], ArticleRecord>(bizFile(NAME), [], (rows) => {
    if (input.id) {
      const existing = rows.find((a) => a.id === input.id);
      if (existing) {
        // Chỉ gán các field trong whitelist & thực sự được cung cấp.
        const target = existing as unknown as Record<string, unknown>;
        for (const k of UPDATABLE) {
          if (input[k] !== undefined) target[k] = input[k];
        }
        existing.updatedAt = now;
        return [rows, existing];
      }
    }
    const record: ArticleRecord = {
      id: 'art_' + randomBytes(8).toString('hex'),
      title: input.title,
      slug: input.slug ?? '',
      metaDescription: input.metaDescription ?? '',
      markdown: input.markdown ?? '',
      locale: input.locale,
      targetKeyword: input.targetKeyword,
      tags: input.tags,
      categories: input.categories,
      coverImageUrl: input.coverImageUrl,
      translationGroupId: input.translationGroupId,
      source: input.source ?? 'new',
      seoScore: input.seoScore ?? 0,
      aeoScore: input.aeoScore ?? 0,
      geoScore: input.geoScore ?? 0,
      status: input.status ?? 'draft',
      connectionId: input.connectionId,
      cmsPostId: input.cmsPostId,
      publishedUrl: input.publishedUrl,
      updatedAt: now,
    };
    return [[...rows, record], record];
  });
}

// Cập nhật CÓ CHỌN LỌC vài trường của 1 bài đã tồn tại (không tạo mới) - dùng cho quy trình
// phê duyệt (đổi status/approved/note...). Trả về bài sau cập nhật hoặc null nếu không thấy.
export async function updateArticleFields(
  id: string,
  patch: Partial<
    Pick<
      ArticleRecord,
      'status' | 'approved' | 'reviewNote' | 'submittedBy' | 'reviewedBy' | 'assignedTo'
    >
  >,
): Promise<ArticleRecord | null> {
  return mutateJson<ArticleRecord[], ArticleRecord | null>(bizFile(NAME), [], (rows) => {
    const a = rows.find((r) => r.id === id);
    if (!a) return [rows, null];
    if (patch.status !== undefined) a.status = patch.status;
    if (patch.approved !== undefined) a.approved = patch.approved;
    if (patch.reviewNote !== undefined) a.reviewNote = patch.reviewNote;
    if (patch.submittedBy !== undefined) a.submittedBy = patch.submittedBy;
    if (patch.reviewedBy !== undefined) a.reviewedBy = patch.reviewedBy;
    if (patch.assignedTo !== undefined) a.assignedTo = patch.assignedTo || undefined;
    a.updatedAt = new Date().toISOString();
    return [rows, a];
  });
}

export async function deleteArticle(id: string): Promise<void> {
  await mutateJson<ArticleRecord[], void>(bizFile(NAME), [], (rows) => [
    rows.filter((a) => a.id !== id),
    undefined,
  ]);
}
