import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';
import type { PublishArticle } from '../publish/run';

export type PublishJobStatus = 'scheduled' | 'pending' | 'running' | 'done' | 'error';
export interface PublishJob { id: string; connectionId: string; article: PublishArticle; alternates: Array<{ locale: string; url: string }>; articleId?: string; status: PublishJobStatus; runAt?: string; attempts: number; maxAttempts: number; lastError?: string; resultPostId?: string; resultUrl?: string; createdAt: string; updatedAt: string; }
const NAME = 'publish-jobs.json';
const MAX_JOBS = 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;
const isDb = () => storageDriver() === 'prisma';
const desc = (a: PublishJob, b: PublishJob) => (a.createdAt < b.createdAt ? 1 : -1);
function out(r: { id: string; connectionId: string; article: unknown; articleId?: string | null; status: string; runAt?: Date | null; attempts: number; maxAttempts: number; lastError?: string | null; resultPostId?: string | null; resultUrl?: string | null; createdAt: Date; updatedAt: Date }): PublishJob { return { id: r.id, connectionId: r.connectionId, article: r.article as PublishArticle, alternates: [], articleId: r.articleId ?? undefined, status: r.status as PublishJobStatus, runAt: r.runAt?.toISOString(), attempts: r.attempts, maxAttempts: r.maxAttempts, lastError: r.lastError ?? undefined, resultPostId: r.resultPostId ?? undefined, resultUrl: r.resultUrl ?? undefined, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }; }
async function readAll(): Promise<PublishJob[]> { if (isDb()) return (await prisma.publishJob.findMany()).map(out); return readJson<PublishJob[]>(bizFile(NAME), []); }

export async function listJobs(filter?: { status?: PublishJobStatus }): Promise<PublishJob[]> { const rows = await readAll(); const outRows = filter?.status ? rows.filter((j) => j.status === filter.status) : rows; return outRows.sort(desc); }

export async function createJob(input: Pick<PublishJob, 'connectionId' | 'article' | 'alternates' | 'articleId'> & { status: PublishJobStatus; runAt?: string; maxAttempts?: number; }): Promise<PublishJob> {
  const now = new Date().toISOString();
  const job: PublishJob = { id: 'job_' + randomBytes(8).toString('hex'), connectionId: input.connectionId, article: input.article, alternates: input.alternates ?? [], articleId: input.articleId, status: input.status, runAt: input.runAt, attempts: 0, maxAttempts: input.maxAttempts ?? 3, createdAt: now, updatedAt: now };
  if (isDb()) { await prisma.publishJob.create({ data: { id: job.id, connectionId: job.connectionId, article: job.article as object, articleId: job.articleId ?? null, status: job.status, runAt: job.runAt ? new Date(job.runAt) : null, attempts: job.attempts, maxAttempts: job.maxAttempts, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt) } }); return job; }
  await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => { const all = [...rows, job]; if (all.length <= MAX_JOBS) return [all.sort(desc), undefined]; const active = all.filter((j) => j.status === 'scheduled' || j.status === 'pending' || j.status === 'running'); const finished = all.filter((j) => j.status === 'done' || j.status === 'error').sort(desc); return [[...active, ...finished.slice(0, Math.max(0, MAX_JOBS - active.length))].sort(desc), undefined]; });
  return job;
}

export async function updateJob(id: string, patch: Partial<PublishJob>): Promise<void> {
  if (isDb()) { const data: Record<string, unknown> = { updatedAt: new Date() }; for (const k of ['status','attempts','lastError','resultPostId','resultUrl','articleId','maxAttempts'] as const) if (patch[k] !== undefined) data[k] = patch[k]; if (patch.runAt !== undefined) data.runAt = patch.runAt ? new Date(patch.runAt) : null; if (patch.article !== undefined) data.article = patch.article as object; await prisma.publishJob.updateMany({ where: { id }, data }); return; }
  await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => { const j = rows.find((r) => r.id === id); if (j) Object.assign(j, patch, { updatedAt: new Date().toISOString() }); return [rows, undefined]; });
}

export async function deleteJob(id: string): Promise<void> { if (isDb()) { await prisma.publishJob.deleteMany({ where: { id } }); return; } await mutateJson<PublishJob[], void>(bizFile(NAME), [], (rows) => [rows.filter((r) => r.id !== id), undefined]); }

export async function claimJob(id: string, nowIso: string): Promise<PublishJob | null> {
  if (isDb()) { const j = (await readAll()).find((r) => r.id === id); if (!j || dueJobs([j], nowIso).length !== 1) return null; await updateJob(id, { status: 'running', attempts: j.attempts + 1 }); return { ...j, status: 'running', attempts: j.attempts + 1, updatedAt: new Date().toISOString() }; }
  return mutateJson<PublishJob[], PublishJob | null>(bizFile(NAME), [], (rows) => { const j = rows.find((r) => r.id === id); if (!j || dueJobs([j], nowIso).length !== 1) return [rows, null]; Object.assign(j, { status: 'running' as PublishJobStatus, attempts: j.attempts + 1, updatedAt: new Date().toISOString() }); return [rows, { ...j }]; });
}

export function dueJobs(jobs: PublishJob[], nowIso: string): PublishJob[] { const nowMs = Date.parse(nowIso); return jobs.filter((j) => { if (j.attempts >= j.maxAttempts) return false; if (j.runAt && j.runAt > nowIso) return false; if (j.status === 'scheduled' || j.status === 'pending' || j.status === 'error') return true; if (j.status === 'running') { const upd = Date.parse(j.updatedAt); return Number.isFinite(upd) && Number.isFinite(nowMs) && nowMs - upd > STALE_RUNNING_MS; } return false; }); }
