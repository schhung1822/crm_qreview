// Hàng đợi job ĐĂNG bài - lưu .data/publish-jobs.json. Phục vụ:
//  • Lịch đăng: tạo job 'scheduled' (runAt tương lai), worker chạy đúng giờ.
//  • Theo dõi: mỗi lần đăng (ngay/lịch) đều có bản ghi trạng thái + log + retry.
// Server-only.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';
import type { PublishArticle } from '../publish/run';

export type PublishJobStatus = 'scheduled' | 'pending' | 'running' | 'done' | 'error';

export interface PublishJob {
  id: string;
  connectionId: string;
  article: PublishArticle;
  alternates: Array<{ locale: string; url: string }>;
  articleId?: string; // bản nháp local để cập nhật trạng thái sau khi đăng
  status: PublishJobStatus;
  runAt?: string; // ISO - thời điểm cần chạy (lịch đăng). Không có = chạy ngay khi quét.
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  resultPostId?: string;
  resultUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const FILE = path.join(process.cwd(), '.data', 'publish-jobs.json');
const MAX_JOBS = 1000; // giữ N job gần nhất (tránh phình file)

async function readAll(): Promise<PublishJob[]> {
  return readJson<PublishJob[]>(FILE, []);
}

export async function listJobs(filter?: { status?: PublishJobStatus }): Promise<PublishJob[]> {
  const rows = await readAll();
  const out = filter?.status ? rows.filter((j) => j.status === filter.status) : rows;
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createJob(
  input: Pick<PublishJob, 'connectionId' | 'article' | 'alternates' | 'articleId'> & {
    status: PublishJobStatus;
    runAt?: string;
    maxAttempts?: number;
  },
): Promise<PublishJob> {
  const now = new Date().toISOString();
  const job: PublishJob = {
    id: 'job_' + randomBytes(8).toString('hex'),
    connectionId: input.connectionId,
    article: input.article,
    alternates: input.alternates ?? [],
    articleId: input.articleId,
    status: input.status,
    runAt: input.runAt,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now,
  };
  await mutateJson<PublishJob[], void>(FILE, [], (rows) => {
    const next = [...rows, job].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return [next.slice(0, MAX_JOBS), undefined];
  });
  return job;
}

export async function updateJob(id: string, patch: Partial<PublishJob>): Promise<void> {
  await mutateJson<PublishJob[], void>(FILE, [], (rows) => {
    const j = rows.find((r) => r.id === id);
    if (j) Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    return [rows, undefined];
  });
}

export async function deleteJob(id: string): Promise<void> {
  await mutateJson<PublishJob[], void>(FILE, [], (rows) => [rows.filter((r) => r.id !== id), undefined]);
}

// Các job ĐẾN HẠN: trạng thái scheduled/pending/error (chưa hết lượt) và (không có runAt
// hoặc runAt <= mốc now). Dùng bởi worker để biết job nào cần chạy.
export function dueJobs(jobs: PublishJob[], nowIso: string): PublishJob[] {
  return jobs.filter(
    (j) =>
      (j.status === 'scheduled' || j.status === 'pending' || j.status === 'error') &&
      j.attempts < j.maxAttempts &&
      (!j.runAt || j.runAt <= nowIso),
  );
}
