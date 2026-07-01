// Chạy các job đăng đến hạn (lịch đăng hoặc retry). Dùng bởi /api/jobs/run (gọi từ
// worker hoặc cron). Cập nhật trạng thái job + bản nháp local sau khi đăng. Server-only.
import { runPublish } from './run';
import {
  dueJobs,
  listJobs,
  updateJob,
  type PublishJob,
} from '../store/publish-jobs';
import { getArticle, upsertArticle } from '../store/articles';

export interface RunDueResult {
  ran: number;
  done: number;
  failed: number;
  jobs: Array<{ id: string; status: PublishJob['status']; error?: string }>;
}

// Quét & chạy mọi job đến hạn (tuần tự - tránh đụng độ ghi file + rate-limit CMS).
// limit: số job tối đa mỗi lần quét (chống chạy quá lâu trong 1 request serverless).
export async function runDueJobs(opts?: { limit?: number; nowIso?: string }): Promise<RunDueResult> {
  const now = opts?.nowIso ?? new Date().toISOString();
  const limit = opts?.limit ?? 25;
  const all = await listJobs();
  const due = dueJobs(all, now).slice(0, limit);

  const result: RunDueResult = { ran: 0, done: 0, failed: 0, jobs: [] };

  for (const job of due) {
    result.ran++;
    await updateJob(job.id, { status: 'running', attempts: job.attempts + 1 });
    try {
      // Lịch đăng: khi đến giờ thì ĐĂNG thật (không gửi 'scheduled' xuống CMS).
      const article = {
        ...job.article,
        status: job.article.status === 'scheduled' ? ('publish' as const) : job.article.status,
        scheduledAt: undefined,
      };
      const { post } = await runPublish({
        connectionId: job.connectionId,
        article,
        alternates: job.alternates,
      });
      await updateJob(job.id, {
        status: 'done',
        lastError: undefined,
        resultPostId: post.id,
        resultUrl: post.url,
      });
      // Cập nhật bản nháp local → đã đăng (giữ nguyên locale/title của bản ghi).
      if (job.articleId) {
        const existing = await getArticle(job.articleId);
        if (existing) {
          await upsertArticle({
            id: existing.id,
            title: existing.title,
            locale: existing.locale,
            status: 'published',
            connectionId: job.connectionId,
            cmsPostId: post.id,
            publishedUrl: post.url,
          });
        }
      }
      result.done++;
      result.jobs.push({ id: job.id, status: 'done' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi đăng';
      const attempts = job.attempts + 1;
      // Hết lượt → 'error' (dừng); còn lượt → 'pending' (lần quét sau thử lại).
      const status = attempts >= job.maxAttempts ? 'error' : 'pending';
      await updateJob(job.id, { status, lastError: msg });
      result.failed++;
      result.jobs.push({ id: job.id, status, error: msg });
    }
  }

  return result;
}
