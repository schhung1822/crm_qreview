import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isFullAccessRole } from '@/lib/auth/permissions';
import { guard } from '@/lib/auth/current';
import { buildHreflang } from '@/lib/cms';
import { PublishError, runPublish } from '@/lib/publish/run';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { getArticleConfig } from '@/lib/store/article-config';
import { getArticle, upsertArticle } from '@/lib/store/articles';
import { createJob, updateJob } from '@/lib/store/publish-jobs';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string().optional(),
  confirm: z.boolean().default(false),
  articleId: z.string().optional(), // bản nháp local (cập nhật trạng thái sau khi đăng theo lịch)
  article: z.object({
    cmsPostId: z.string().optional(), // có → update; không → create
    title: z.string(),
    slug: z.string(),
    contentHtml: z.string(),
    metaDescription: z.string().optional(),
    status: z.enum(['draft', 'publish', 'scheduled']).default('publish'),
    scheduledAt: z.string().optional(),
    categories: z.array(z.string()).optional(), // id category có sẵn trên site
    tags: z.array(z.string()).optional(), // tên tag (tạo nếu chưa có)
    coverImageUrl: z.string().optional(), // ảnh bìa (local /generated hoặc URL)
  }),
  alternates: z.array(z.object({ locale: z.string(), url: z.string() })).default([]),
});

// POST /api/publish
// - confirm=false hoặc thiếu connectionId → PREVIEW (dry-run) + hreflang. KHÔNG ghi site.
// - status='scheduled' + scheduledAt tương lai → tạo JOB lịch đăng (worker chạy đúng giờ).
// - còn lại → đăng NGAY qua runPublish, ghi lại 1 job lịch sử (done/error).
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  const { connectionId, confirm, article, alternates, articleId } = parsed.data;

  if (!confirm || !connectionId) {
    return NextResponse.json({
      preview: { ...article, hreflang: buildHreflang(alternates) },
      note: confirm ? 'Thiếu connectionId - chỉ trả preview.' : 'Dry-run: chưa xác nhận đăng.',
    });
  }

  // CỔNG PHÊ DUYỆT: nếu biz bật "bắt buộc duyệt", người KHÔNG phải chủ/quản trị chỉ được đăng
  // bài đã có approved=true. Chủ/quản trị (full-access) luôn bỏ qua cổng này.
  const cfg = await getArticleConfig();
  if (cfg.requireApproval && !isFullAccessRole(g.bizRole ?? 'viewer')) {
    const art = articleId ? await getArticle(articleId) : null;
    if (!art?.approved) {
      return NextResponse.json(
        { error: 'Bài cần được phê duyệt trước khi đăng. Hãy gửi duyệt và chờ người có quyền đăng phê duyệt.' },
        { status: 403 },
      );
    }
  }

  // Chống spam ghi lên CMS (tốn quota + không hoàn tác). Chỉ áp cho đường ghi thật.
  const rl = rateLimit(`publish:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu đăng. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429 },
    );
  }

  // Lịch đăng: scheduledAt trong tương lai → tạo job, worker sẽ đăng đúng giờ.
  if (article.status === 'scheduled' && article.scheduledAt) {
    const runAt = new Date(article.scheduledAt);
    if (!Number.isNaN(runAt.getTime()) && runAt.getTime() > Date.now()) {
      const job = await createJob({
        connectionId,
        article,
        alternates,
        articleId,
        status: 'scheduled',
        runAt: runAt.toISOString(),
      });
      return NextResponse.json({ scheduled: true, jobId: job.id, runAt: job.runAt });
    }
    // scheduledAt ở quá khứ → coi như đăng ngay.
  }

  // Đăng ngay.
  try {
    const { post, imagesNotUploaded } = await runPublish({ connectionId, article, alternates });
    // Ghi lại lịch sử (không chặn kết quả nếu ghi lỗi).
    createJob({ connectionId, article, alternates, articleId, status: 'done' })
      .then((j) => updateJob(j.id, { attempts: 1, resultPostId: post.id, resultUrl: post.url }))
      .catch(() => {});
    // TRUST SERVER: ghi cmsPostId + publishedUrl (+ status khi đăng thật) vào bản nháp local, để lần
    // đăng sau CẬP NHẬT đúng bài đã đăng thay vì tạo mới. (Endpoint lưu nháp chặn status/publishedUrl
    // từ client vì lý do bảo mật, nên phải set ở đây - giống runner làm cho lịch đăng.)
    if (articleId) {
      try {
        const existing = await getArticle(articleId);
        if (existing) {
          await upsertArticle({
            id: existing.id,
            title: existing.title,
            locale: existing.locale,
            connectionId,
            cmsPostId: post.id,
            publishedUrl: post.url,
            // 'draft' = lưu nháp trên CMS → KHÔNG đánh dấu local là đã đăng.
            ...(article.status !== 'draft' ? { status: 'published' as const } : {}),
          });
        }
      } catch {
        /* cập nhật local lỗi KHÔNG được làm hỏng kết quả đăng đã thành công */
      }
    }
    return NextResponse.json({ published: true, post, imagesNotUploaded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi khi đăng';
    if (err instanceof PublishError && err.code === 'connection_not_found') {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    createJob({ connectionId, article, alternates, articleId, status: 'error' })
      .then((j) => updateJob(j.id, { attempts: 1, lastError: msg }))
      .catch(() => {});
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
