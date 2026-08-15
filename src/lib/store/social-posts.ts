// Kho bài đăng mạng xã hội. Từ nay đi qua lớp repo (bảng SocialPost với driver prisma,
// .data/social-posts.json với driver file) thay vì nhét cả danh sách vào một blob JSON.
// KHÔNG còn trần MAX_ROWS — trước đây bài cũ nhất bị cắt âm thầm khi vượt 1000 bản ghi.
import { randomBytes } from 'node:crypto';
import type { SocialProvider } from '../connection-providers';
import { getRepos } from '../data/repos';
import { NO_SOURCE_KEY, type SocialPostFilter, type SocialPostSource } from '../data/repos/types';
import type { SocialMediaType } from '../social-publishing';
import type { SocialImageProcessingOptions } from '../social-publishing/image-processing';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export { NO_SOURCE_KEY };
export type { SocialPostFilter, SocialPostSource };

export interface SocialPostImageProcessing extends SocialImageProcessingOptions {
  enabled?: boolean;
}

export interface SocialPostRecord {
  id: string;
  // Một lần đăng (có thể nhiều kênh) = một batchId. Bắt buộc: dùng để gom nhóm và phân trang.
  batchId: string;
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
  // Link bài viết nguồn tham khảo (tùy chọn). Chỉ để tra cứu nội bộ, KHÔNG gửi lên mạng xã hội.
  urlSource?: string;
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

export interface SocialPostInput extends Omit<SocialPostRecord, 'id' | 'batchId' | 'createdAt' | 'mediaUrls'> {
  batchId?: string;
  mediaUrls?: string[];
}

function genId(): string {
  return `sp_${randomBytes(9).toString('hex')}`;
}

export function genSocialPostBatchId(): string {
  return `spb_${randomBytes(9).toString('hex')}`;
}

export async function listSocialPostPage(
  filter: SocialPostFilter = {},
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
): Promise<{ posts: SocialPostRecord[]; totalBatches: number }> {
  const repos = await getRepos();
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit) || DEFAULT_PAGE_SIZE));
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const page = await repos.socialPosts.page(filter, safeLimit, safeOffset);
  return { posts: page.rows, totalBatches: page.totalBatches };
}

// Danh sách nguồn + số lượng, dùng dựng bộ lọc nguồn ở giao diện.
export async function listSocialPostSources(): Promise<{ sources: SocialPostSource[]; missing: number }> {
  const repos = await getRepos();
  const { rows, missing } = await repos.socialPosts.sources();
  return {
    sources: rows.sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    missing,
  };
}

// Chỉ lấy bài từ mốc thời gian trở lại đây — dùng cho báo cáo, tránh kéo toàn bộ lịch sử.
export async function listSocialPostsSince(createdAtIso: string): Promise<SocialPostRecord[]> {
  const repos = await getRepos();
  return repos.socialPosts.since(createdAtIso);
}

export async function getSocialPostBatch(id: string): Promise<SocialPostRecord[]> {
  const repos = await getRepos();
  return repos.socialPosts.batch(id);
}

export async function countSocialPosts(): Promise<number> {
  const repos = await getRepos();
  return repos.socialPosts.count();
}

// Một lần gọi = MỘT lần đăng: nếu input chưa có batchId thì cả lô dùng chung một batchId mới.
export async function addSocialPosts(inputs: SocialPostInput[]): Promise<SocialPostRecord[]> {
  if (!inputs.length) return [];
  const repos = await getRepos();
  const now = new Date().toISOString();
  const fallbackBatchId = genSocialPostBatchId();
  const records: SocialPostRecord[] = inputs.map((input) => ({
    ...input,
    id: genId(),
    batchId: input.batchId || fallbackBatchId,
    mediaUrls: input.mediaUrls ?? [],
    createdAt: now,
  }));
  await repos.socialPosts.insertMany(records);
  return records;
}

export async function deleteSocialPost(id: string): Promise<void> {
  const repos = await getRepos();
  await repos.socialPosts.remove(id);
}
