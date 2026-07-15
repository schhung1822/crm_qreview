import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractTargetKeyword } from '@/lib/ai/content';
import { guard } from '@/lib/auth/current';
import { htmlToMarkdown } from '@/lib/content/markdown';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput } from '@/lib/scoring/types';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { listArticles } from '@/lib/store/articles';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  connectionId: z.string(),
  postId: z.string(),
});

// POST /api/optimize/analyze → tải bài thật từ CMS, chuyển HTML→markdown, chấm SEO/GEO,
// trả breakdown để người dùng biết cần sửa gì. Cũng trả markdown để mở trong editor.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Gọi AI trích từ khóa + tải bài từ CMS → giới hạn nhẹ chống lạm dụng.
  const rl = rateLimit(`analyze:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const loaded = await adapterFromConnection(parsed.data.connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối' }, { status: 404 });

  let post;
  try {
    post = await loaded.adapter.getPost(parsed.data.postId);
    await setConnectionStatus(parsed.data.connectionId, 'active');
  } catch (err) {
    await setConnectionStatus(parsed.data.connectionId, 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải bài' },
      { status: 502 },
    );
  }

  const markdown = htmlToMarkdown(post.contentHtml);

  // Nếu bài này do app từng đăng (khớp connectionId + cmsPostId) → DÙNG LẠI target keyword
  // đã lưu để điểm khớp lúc viết, thay vì trích lại (trích lại có thể ra keyword khác →
  // hàng loạt tiêu chí keyword lệch). Không có thì mới tự trích từ nội dung.
  let targetKeyword: string;
  const known = (await listArticles()).find(
    (a) => a.connectionId === parsed.data.connectionId && a.cmsPostId === post.id,
  );
  if (known?.targetKeyword) {
    targetKeyword = known.targetKeyword;
  } else {
    targetKeyword = await extractTargetKeyword({ title: post.title, markdown });
  }

  // Ưu tiên meta description thật (adapter đã lấy từ field SEO plugin); rỗng → excerpt.
  const metaDescription = post.metaDescription || post.excerpt || '';

  // URL TUYỆT ĐỐI để mở bài trực tiếp: WordPress trả permalink đầy đủ, Wix trả path tương đối
  // (vd "/post/abc") → ghép với baseUrl để link không trỏ nhầm về domain app.
  let absoluteUrl: string | undefined;
  if (post.url) {
    try {
      absoluteUrl = new URL(post.url, loaded.record.baseUrl).toString();
    } catch {
      absoluteUrl = /^https?:\/\//i.test(post.url) ? post.url : undefined;
    }
  }
  const scoreInput = buildScoreInput({
    title: post.title,
    metaDescription,
    slug: post.slug,
    markdown,
    locale: loaded.record.locale,
    targetKeyword,
  });

  return NextResponse.json({
    post: {
      id: post.id,
      title: post.title,
      slug: post.slug,
      metaDescription,
      markdown,
      url: absoluteUrl,
      locale: loaded.record.locale,
      targetKeyword,
      // Giữ taxonomy hiện có để khi sửa & đăng lại không mất tag / chuyên mục.
      tags: post.tags ?? [],
      categories: post.categories ?? [],
    },
    seo: scoreSeo(scoreInput),
    aeo: scoreAeo(scoreInput),
    geo: scoreGeo(scoreInput),
  });
}
