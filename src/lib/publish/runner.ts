// Chạy các job đăng đến hạn (lịch đăng hoặc retry). Dùng bởi /api/jobs/run (gọi từ
// worker hoặc cron). Cập nhật trạng thái job + bản nháp local sau khi đăng. Server-only.
import { runPublish } from './run';
import {
  claimJob,
  dueJobs,
  listJobs,
  updateJob,
  type PublishJob,
} from '../store/publish-jobs';
import { getArticle, upsertArticle } from '../store/articles';
import { ensureMigrated, listAllBizes } from '../store/biz';
import { runWithBiz } from '../biz/context';

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
    // CHIẾM job nguyên tử trước khi chạy → nếu lần quét khác đã chiếm, bỏ qua (không đăng trùng).
    const claimed = await claimJob(job.id, now);
    if (!claimed) continue;
    result.ran++;
    try {
      // Lịch đăng: khi đến giờ thì ĐĂNG thật (không gửi 'scheduled' xuống CMS).
      const article = {
        ...claimed.article,
        status: claimed.article.status === 'scheduled' ? ('publish' as const) : claimed.article.status,
        scheduledAt: undefined,
      };
      const { post } = await runPublish({
        connectionId: claimed.connectionId,
        article,
        alternates: claimed.alternates,
      });
      await updateJob(claimed.id, {
        status: 'done',
        lastError: undefined,
        resultPostId: post.id,
        resultUrl: post.url,
      });
      // Cập nhật bản nháp local → đã đăng (giữ nguyên locale/title của bản ghi).
      if (claimed.articleId) {
        const existing = await getArticle(claimed.articleId);
        if (existing) {
          await upsertArticle({
            id: existing.id,
            title: existing.title,
            locale: existing.locale,
            status: 'published',
            connectionId: claimed.connectionId,
            cmsPostId: post.id,
            publishedUrl: post.url,
          });
        }
      }
      result.done++;
      result.jobs.push({ id: claimed.id, status: 'done' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi đăng';
      // attempts đã +1 trong claimJob. Hết lượt → 'error' (dừng); còn lượt → 'pending' (quét sau thử lại).
      const status = claimed.attempts >= claimed.maxAttempts ? 'error' : 'pending';
      await updateJob(claimed.id, { status, lastError: msg });
      result.failed++;
      result.jobs.push({ id: claimed.id, status, error: msg });
    }
  }

  return result;
}

// Chạy job đến hạn cho MỌI biz. Dùng khi gọi từ cron/worker (không có ngữ cảnh biz + không có
// cookie sg_biz). BẤT BIẾN QUAN TRỌNG: các store (publish-jobs, articles) trỏ thư mục dữ liệu
// theo bizId đang hoạt động; cron không có bizId → runDueJobs() sẽ đọc file .data GỐC (rỗng) và
// bỏ sót job của mọi biz. Vì vậy phải LẶP qua từng biz và bọc runWithBiz(bizId) để store trỏ đúng
// .data/biz/<bizId>/. `limit` áp cho TỪNG biz (mỗi biz tối đa `limit` job/lần quét).
export async function runDueJobsAllBiz(opts?: { limit?: number; nowIso?: string }): Promise<RunDueResult> {
  await ensureMigrated();
  const agg: RunDueResult = { ran: 0, done: 0, failed: 0, jobs: [] };
  const bizes = await listAllBizes();
  for (const biz of bizes) {
    if (biz.suspended) continue; // biz bị quản trị nền tảng tạm khóa → không tự đăng
    const r = await runWithBiz({ bizId: biz.id, userId: biz.ownerId }, () => runDueJobs(opts));
    agg.ran += r.ran;
    agg.done += r.done;
    agg.failed += r.failed;
    agg.jobs.push(...r.jobs);
  }
  return agg;
}
