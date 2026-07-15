// Hàng đợi job ĐĂNG bài - lưu .data/publish-jobs.json. Phục vụ:
//  • Lịch đăng: tạo job 'scheduled' (runAt tương lai), worker chạy đúng giờ.
//  • Theo dõi: mỗi lần đăng (ngay/lịch) đều có bản ghi trạng thái + log + retry.
// Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
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

const NAME = 'publish-jobs.json'; // CÔ LẬP THEO BIZ
const MAX_JOBS = 1000; // giữ N job gần nhất (tránh phình file)

async function readAll(): Promise<PublishJob[]> {
  return readJson<PublishJob[]>(bizFile(NAME), []);
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
  const desc = (a: PublishJob, b: PublishJob) => (a.createdAt < b.createdAt ? 1 : -1);
  await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => {
    const all = [...rows, job];
    if (all.length <= MAX_JOBS) return [all.sort(desc), undefined];
    // Cắt bớt để tránh phình file, NHƯNG không bao giờ bỏ job CHƯA XONG (scheduled/pending/running)
    // — nếu không, một job lịch tương lai tạo sớm có thể bị xóa trước khi tới giờ chạy.
    const active = all.filter((j) => j.status === 'scheduled' || j.status === 'pending' || j.status === 'running');
    const finished = all.filter((j) => j.status === 'done' || j.status === 'error').sort(desc);
    const keepFinished = finished.slice(0, Math.max(0, MAX_JOBS - active.length));
    return [[...active, ...keepFinished].sort(desc), undefined];
  });
  return job;
}

export async function updateJob(id: string, patch: Partial<PublishJob>): Promise<void> {
  await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => {
    const j = rows.find((r) => r.id === id);
    if (j) Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    return [rows, undefined];
  });
}

export async function deleteJob(id: string): Promise<void> {
  await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => [rows.filter((r) => r.id !== id), undefined]);
}

// Chiếm job để chạy MỘT CÁCH NGUYÊN TỬ (mutateJson khóa đọc-sửa-ghi). Chống ĐĂNG TRÙNG khi 2 lần
// quét chạy song song / cron chồng lịch: chỉ chuyển 'running' nếu job VẪN đến hạn tại nowIso. Trả
// job đã chiếm (attempts đã +1) hoặc null nếu worker khác đã chiếm trước / job không còn đến hạn.
export async function claimJob(id: string, nowIso: string): Promise<PublishJob | null> {
  return mutateJson<PublishJob[], PublishJob | null>(bizFile(NAME), [], (rows) => {
    const j = rows.find((r) => r.id === id);
    if (!j || dueJobs([j], nowIso).length !== 1) return [rows, null];
    Object.assign(j, {
      status: 'running' as PublishJobStatus,
      attempts: j.attempts + 1,
      updatedAt: new Date().toISOString(),
    });
    return [rows, { ...j }];
  });
}

// Ngưỡng coi job 'running' là KẸT: tiến trình serverless bị cắt giữa chừng (timeout/deploy/OOM)
// sau khi set 'running' nhưng trước khi set 'done'/'pending' → job đứng mãi. Quá ngưỡng này thì
// cho quét lại (attempts đã tăng nên vẫn bị chặn bởi maxAttempts, không lặp vô hạn).
const STALE_RUNNING_MS = 10 * 60 * 1000;

// Các job ĐẾN HẠN: scheduled/pending/error (chưa hết lượt), HOẶC running bị kẹt quá lâu; và
// (không có runAt hoặc runAt <= mốc now). Dùng bởi worker để biết job nào cần chạy.
export function dueJobs(jobs: PublishJob[], nowIso: string): PublishJob[] {
  const nowMs = Date.parse(nowIso);
  return jobs.filter((j) => {
    if (j.attempts >= j.maxAttempts) return false;
    if (j.runAt && j.runAt > nowIso) return false;
    if (j.status === 'scheduled' || j.status === 'pending' || j.status === 'error') return true;
    if (j.status === 'running') {
      const upd = Date.parse(j.updatedAt);
      return Number.isFinite(upd) && Number.isFinite(nowMs) && nowMs - upd > STALE_RUNNING_MS;
    }
    return false;
  });
}
