// Worker dây chuyền tạo bài: chạy job kế tiếp trong hàng đợi (gen-jobs). Dùng bởi:
//  • /api/gen-jobs/run (client bấm "Tạo hàng loạt" gọi lặp - chạy được KHÔNG cần cron ngoài)
//  • /api/jobs/run khi viaCron (chạy nền cho mọi biz)
// Server-only.
import type { Locale } from '@/i18n/config';
import { runWithBiz } from '../biz/context';
import { ensureMigrated, listAllBizes } from '../store/biz';
import { claimNextGenJob, updateGenJob, type GenJob } from '../store/gen-jobs';
import { generateDraftFromItem } from './generate-draft';

export interface RunNextResult {
  processed: boolean;
  job?: { id: string; status: GenJob['status']; articleId?: string; error?: string };
}

// Chạy ĐÚNG 1 job đến lượt (đã chiếm nguyên tử). processed=false nếu hàng đợi hết việc.
export async function runNextGenJob(): Promise<RunNextResult> {
  const now = new Date().toISOString();
  const job = await claimNextGenJob(now);
  if (!job) return { processed: false };
  try {
    const r = await generateDraftFromItem(
      {
        title: job.title,
        targetKeyword: job.targetKeyword,
        locale: job.locale as Locale,
        internalLinks: job.internalLinks,
      },
      { requireAi: true },
    );
    if (!r.draft) throw new Error(r.aiError || 'AI chưa sẵn sàng hoặc hết hạn mức.');
    await updateGenJob(job.id, {
      status: 'done',
      articleId: r.draft.id,
      seo: r.seo,
      aeo: r.aeo,
      geo: r.geo,
      error: undefined,
    });
    return { processed: true, job: { id: job.id, status: 'done', articleId: r.draft.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi tạo bài';
    // attempts đã +1 khi chiếm. Hết lượt → 'error' (dừng); còn lượt → 'queued' (thử lại lượt sau).
    const status: GenJob['status'] = job.attempts >= job.maxAttempts ? 'error' : 'queued';
    await updateGenJob(job.id, { status, error: msg });
    return { processed: true, job: { id: job.id, status, error: msg } };
  }
}

// Cron/worker nền: chạy tối đa `limit` job cho MỖI biz (không có ngữ cảnh biz → phải bọc runWithBiz).
export async function runDueGenJobsAllBiz(limit = 3): Promise<{ processed: number }> {
  await ensureMigrated();
  let processed = 0;
  for (const biz of await listAllBizes()) {
    if (biz.suspended) continue;
    await runWithBiz({ bizId: biz.id, userId: biz.ownerId }, async () => {
      for (let i = 0; i < limit; i++) {
        const r = await runNextGenJob();
        if (!r.processed) break;
        processed++;
      }
    });
  }
  return { processed };
}
