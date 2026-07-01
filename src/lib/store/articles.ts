// Kho bài viết / bản nháp - lưu file .data/articles.json. Server-only.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
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
  status: 'draft' | 'published';
  connectionId?: string;
  cmsPostId?: string;
  publishedUrl?: string;
  updatedAt: string;
}

const FILE = path.join(process.cwd(), '.data', 'articles.json');

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
  'connectionId',
  'cmsPostId',
  'publishedUrl',
];

async function readAll(): Promise<ArticleRecord[]> {
  return readJson<ArticleRecord[]>(FILE, []);
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
  return mutateJson<ArticleRecord[], ArticleRecord>(FILE, [], (rows) => {
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

export async function deleteArticle(id: string): Promise<void> {
  await mutateJson<ArticleRecord[], void>(FILE, [], (rows) => [
    rows.filter((a) => a.id !== id),
    undefined,
  ]);
}
