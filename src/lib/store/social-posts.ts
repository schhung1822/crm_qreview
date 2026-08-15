import { randomBytes } from 'node:crypto';
import type { SocialProvider } from '../connection-providers';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import type { SocialMediaType } from '../social-publishing';
import type { SocialImageProcessingOptions } from '../social-publishing/image-processing';

const NAME = 'social-posts.json';
const MAX_ROWS = 1000;

export interface SocialPostImageProcessing extends SocialImageProcessingOptions {
  enabled?: boolean;
}

export interface SocialPostRecord {
  id: string;
  batchId?: string;
  connectionId: string;
  provider: SocialProvider;
  connectionLabel: string;
  title?: string;
  text: string;
  mediaType: SocialMediaType;
  mediaUrls: string[];
  originalMediaUrls?: string[];
  imageProcessing?: SocialPostImageProcessing;
  linkUrl?: string;
  // Nguồn bài viết (tùy chọn): bài này lấy từ đâu. Chỉ hiển thị trong trang quản trị nội bộ,
  // KHÔNG gửi lên mạng xã hội.
  articleSource?: string;
  // Mỗi link affiliate sẽ thành MỘT comment riêng dưới bài Facebook đã đăng.
  affiliateLinks?: string[];
  providerPostId?: string;
  publishedUrl?: string;
  status: 'pending_review' | 'published' | 'processing' | 'failed';
  error?: string;
  createdBy?: string;
  source?: 'app' | 'external_api';
  createdAt: string;
}

export interface SocialPostInput {
  batchId?: string;
  connectionId: string;
  provider: SocialProvider;
  connectionLabel: string;
  title?: string;
  text: string;
  mediaType: SocialMediaType;
  mediaUrls?: string[];
  originalMediaUrls?: string[];
  imageProcessing?: SocialPostImageProcessing;
  linkUrl?: string;
  articleSource?: string;
  affiliateLinks?: string[];
  providerPostId?: string;
  publishedUrl?: string;
  status: 'pending_review' | 'published' | 'processing' | 'failed';
  error?: string;
  createdBy?: string;
  source?: 'app' | 'external_api';
}

function genId(): string {
  return `sp_${randomBytes(9).toString('hex')}`;
}

export function genSocialPostBatchId(): string {
  return `spb_${randomBytes(9).toString('hex')}`;
}

function normalize(record: SocialPostRecord): SocialPostRecord {
  return {
    ...record,
    mediaUrls: Array.isArray(record.mediaUrls) ? record.mediaUrls : [],
    originalMediaUrls: Array.isArray(record.originalMediaUrls) ? record.originalMediaUrls : undefined,
    affiliateLinks: Array.isArray(record.affiliateLinks) ? record.affiliateLinks : undefined,
  };
}

export async function listSocialPosts(): Promise<SocialPostRecord[]> {
  return (await readJson<SocialPostRecord[]>(globalFile(NAME), [])).map(normalize);
}

export async function getSocialPostBatch(id: string): Promise<SocialPostRecord[]> {
  const rows = await listSocialPosts();
  const found = rows.find((row) => row.id === id);
  if (!found) return [];
  if (found.batchId) return rows.filter((row) => row.batchId === found.batchId);
  return [found];
}

export async function addSocialPosts(inputs: SocialPostInput[]): Promise<SocialPostRecord[]> {
  if (!inputs.length) return [];
  const now = new Date().toISOString();
  const records = inputs.map((input) => ({
    id: genId(),
    createdAt: now,
    mediaUrls: input.mediaUrls ?? [],
    ...input,
  }));
  await mutateJson<SocialPostRecord[], void>(globalFile(NAME), [], (rows) => [
    [...records, ...rows].slice(0, MAX_ROWS),
    undefined,
  ]);
  return records;
}

export async function deleteSocialPost(id: string): Promise<void> {
  await mutateJson<SocialPostRecord[], void>(globalFile(NAME), [], (rows) => [
    rows.filter((row) => row.id !== id),
    undefined,
  ]);
}
