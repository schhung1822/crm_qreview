import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature } from '@/lib/billing/entitlement';
import { runWithBiz } from '@/lib/biz/context';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { detectVideoPlatform, normalizeVideoUrl } from '@/lib/social/detect';
import { getApifyPool } from '@/lib/social/apify-keys';
import { createScriptAnalysis, listScriptAnalyses } from '@/lib/store/script-analyses';
import { runScriptAnalysis } from '@/lib/script-analysis/runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  url: z.string().min(4).max(2048),
  provider: z.string().optional(),
  model: z.string().optional(),
  locale: z.string().max(10).optional(), // ngôn ngữ fallback cho AI (AI vẫn ưu tiên ngôn ngữ transcript)
});

// GET → lịch sử phân tích. POST → tạo phân tích mới (chạy nền: lấy transcript rồi AI phân tích).
export async function GET() {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  return NextResponse.json({ items: await listScriptAnalyses() });
}

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (g.bizId && !(await bizHasFeature(g.bizId, 'videoScriptAnalysis'))) {
    return NextResponse.json({ error: 'Biz của bạn không có quyền dùng chức năng Phân tích kịch bản video.' }, { status: 403 });
  }
  // Gọi AI + Apify → chặn tần suất.
  const rl = rateLimit(`ai:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Thiếu link video.' }, { status: 400 });
  }
  const url = normalizeVideoUrl(parsed.data.url);
  const platform = detectVideoPlatform(url);
  if (!platform) {
    return NextResponse.json(
      { error: 'Link không thuộc TikTok, YouTube hoặc Facebook. Vui lòng dán link 1 video/reels.' },
      { status: 400 },
    );
  }
  // Lấy transcript cần Apify → yêu cầu có ít nhất 1 key.
  if ((await getApifyPool()).length === 0) {
    return NextResponse.json(
      { error: 'Chưa cấu hình Apify API key. Thêm ở Quản lý kết nối để lấy transcript video.' },
      { status: 400 },
    );
  }

  const rec = await createScriptAnalysis({
    url,
    platform,
    locale: parsed.data.locale || 'vi',
    ai: parsed.data.provider ? { provider: parsed.data.provider, model: parsed.data.model } : undefined,
  });

  // Fire-and-forget TRONG ngữ cảnh biz (server standalone giữ tiến trình chạy nền).
  const ctx = { userId: g.user.id, bizId: g.bizId };
  void runWithBiz(ctx, () => runScriptAnalysis(rec.id)).catch(() => {});

  return NextResponse.json({ id: rec.id });
}
