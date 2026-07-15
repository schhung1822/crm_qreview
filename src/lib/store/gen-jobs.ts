// Hàng đợi TẠO BÀI hàng loạt (dây chuyền). Lưu .data/biz/<id>/gen-jobs.json (cô lập theo biz).
// Bền: sống sót khi đóng tab, tiếp tục/thử lại được. Worker: gen/runner.ts. Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export type GenJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface GenJob {
  id: string;
  planId?: string;
  title: string;
  targetKeyword: string;
  locale: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  status: GenJobStatus;
  articleId?: string; // bản nháp đã tạo
  seo?: number;
  aeo?: number;
  geo?: number;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

const NAME = 'gen-jobs.json';
const MAX_JOBS = 500;
const STALE_RUNNING_MS = 5 * 60 * 1000; // job 'running' quá lâu (tiến trình chết) → cho chạy lại

function asc(a: GenJob, b: GenJob) {
  return a.createdAt < b.createdAt ? -1 : 1; // FIFO theo lúc tạo
}

export async function listGenJobs(): Promise<GenJob[]> {
  return (await readJson<GenJob[]>(bizFile(NAME), [])).sort(asc);
}

// Tạo hàng loạt job 'queued'. Trả các job vừa tạo.
export async function createGenJobs(
  items: Array<Pick<GenJob, 'title' | 'targetKeyword' | 'locale'> & { planId?: string; internalLinks?: GenJob['internalLinks'] }>,
): Promise<GenJob[]> {
  const now = new Date().toISOString();
  const created: GenJob[] = items.map((it, i) => ({
    id: 'gen_' + randomBytes(8).toString('hex') + i.toString(36),
    planId: it.planId,
    title: it.title,
    targetKeyword: it.targetKeyword,
    locale: it.locale,
    internalLinks: it.internalLinks,
    status: 'queued',
    attempts: 0,
    maxAttempts: 2,
    createdAt: now,
    updatedAt: now,
  }));
  if (!created.length) return [];
  await mutateJson<GenJob[], void>(bizFile(NAME), [], (rows) => {
    const all = [...rows, ...created];
    if (all.length <= MAX_JOBS) return [all, undefined];
    // Cắt bớt: bỏ job ĐÃ XONG cũ nhất trước, GIỮ mọi job chưa xong.
    const active = all.filter((j) => j.status === 'queued' || j.status === 'running');
    const finished = all.filter((j) => j.status === 'done' || j.status === 'error').sort(asc);
    const keep = finished.slice(Math.max(0, finished.length - (MAX_JOBS - active.length)));
    return [[...active, ...keep], undefined];
  });
  return created;
}

function eligible(j: GenJob, nowMs: number): boolean {
  if (j.attempts >= j.maxAttempts) return false;
  if (j.status === 'queued') return true;
  if (j.status === 'running') {
    const upd = Date.parse(j.updatedAt);
    return Number.isFinite(upd) && nowMs - upd > STALE_RUNNING_MS;
  }
  return false;
}

// Chiếm job kế tiếp (FIFO) MỘT CÁCH NGUYÊN TỬ để chạy. Trả job đã chiếm (attempts +1) hoặc null.
export async function claimNextGenJob(nowIso: string): Promise<GenJob | null> {
  const nowMs = Date.parse(nowIso);
  return mutateJson<GenJob[], GenJob | null>(bizFile(NAME), [], (rows) => {
    const sorted = [...rows].sort(asc);
    const pick = sorted.find((r) => eligible(r, nowMs));
    if (!pick) return [rows, null];
    const target = rows.find((r) => r.id === pick.id)!;
    Object.assign(target, {
      status: 'running' as GenJobStatus,
      attempts: target.attempts + 1,
      updatedAt: new Date().toISOString(),
    });
    return [rows, { ...target }];
  });
}

export async function updateGenJob(id: string, patch: Partial<GenJob>): Promise<void> {
  await mutateJson<GenJob[], void>(bizFile(NAME), [], (rows) => {
    const j = rows.find((r) => r.id === id);
    if (j) Object.assign(j, patch, { updatedAt: new Date().toISOString() });
    return [rows, undefined];
  });
}

// Đưa các job LỖI (terminal) về hàng đợi để thử lại (reset attempts). Trả số job được thử lại.
export async function retryErroredGenJobs(): Promise<number> {
  return mutateJson<GenJob[], number>(bizFile(NAME), [], (rows) => {
    let n = 0;
    for (const j of rows) {
      if (j.status === 'error') {
        j.status = 'queued';
        j.attempts = 0;
        j.error = undefined;
        j.updatedAt = new Date().toISOString();
        n++;
      }
    }
    return [rows, n];
  });
}

// Xóa các job đã XONG/LỖI (dọn hàng đợi). Giữ job đang chạy/chờ.
export async function clearFinishedGenJobs(): Promise<void> {
  await mutateJson<GenJob[], void>(bizFile(NAME), [], (rows) => [
    rows.filter((j) => j.status === 'queued' || j.status === 'running'),
    undefined,
  ]);
}

export interface GenCounts {
  total: number;
  queued: number;
  running: number;
  done: number;
  error: number;
}
export function countGenJobs(jobs: GenJob[]): GenCounts {
  return {
    total: jobs.length,
    queued: jobs.filter((j) => j.status === 'queued').length,
    running: jobs.filter((j) => j.status === 'running').length,
    done: jobs.filter((j) => j.status === 'done').length,
    error: jobs.filter((j) => j.status === 'error').length,
  };
}
