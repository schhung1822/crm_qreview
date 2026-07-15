import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { extractTargetKeyword, suggestGeoQuestions } from '@/lib/ai/content';
import { aiReady, type AiOverride } from '@/lib/ai/providers';
import { htmlToMarkdown } from '@/lib/content/markdown';
import { serpQuestions } from '@/lib/dataforseo/client';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { adapterFromConnection, setConnectionStatus } from '@/lib/store/connections';
import { dataForSeoReady } from '@/lib/store/dataforseo';
import type { Locale } from '@/i18n/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  connectionId: z.string().min(1),
  postId: z.string().min(1),
  locale: z.string().max(12).optional().default('vi'),
  aiProvider: z.string().max(40).optional(),
  aiModel: z.string().max(120).optional(),
  // Người dùng chọn có dùng "People Also Ask" thật từ DataForSEO hay không. Mặc định có.
  useDataForSeo: z.boolean().optional().default(true),
});

// POST /api/citations/suggest → đọc 1 bài viết đã quét từ CMS → AI hiểu keyword/nội dung →
// đề xuất câu hỏi GEO. Trả { questions, keyword, title } | { error } | { needsKey }.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  // Gọi AI → chống lạm dụng.
  const rl = rateLimit(`geoq:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
  }
  const { connectionId, postId, locale, aiProvider, aiModel, useDataForSeo } = parsed.data;
  if (aiProvider === 'none') {
    return NextResponse.json({ error: 'Hãy chọn AI để tạo đề xuất.' }, { status: 400 });
  }

  // '' = tự động (định tuyến mặc định); tên provider = ép provider/model người dùng chọn.
  const override: AiOverride | undefined =
    aiProvider ? { provider: aiProvider as AiOverride['provider'], model: aiModel || undefined } : undefined;
  if (!override && !(await aiReady())) {
    return NextResponse.json({ needsKey: true });
  }

  // Tải bài thật từ CMS (giống chế độ tối ưu bài cũ) → không cần URL công khai.
  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) return NextResponse.json({ error: 'Không tìm thấy kết nối.' }, { status: 404 });

  let post;
  try {
    post = await loaded.adapter.getPost(postId);
    await setConnectionStatus(connectionId, 'active');
  } catch (err) {
    await setConnectionStatus(connectionId, 'error');
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi tải bài.' }, { status: 502 });
  }

  const content = htmlToMarkdown(post.contentHtml);
  if (content.trim().length < 120) {
    return NextResponse.json({ error: 'Bài viết không có đủ nội dung để phân tích.' }, { status: 422 });
  }
  const keyword = await extractTargetKeyword({ title: post.title, markdown: content });

  // Nếu đã kết nối DataForSEO → lấy câu hỏi "People Also Ask" + cụm từ liên quan THẬT từ Google
  // để làm dữ liệu nền cho AI và ưu tiên đưa vào kết quả (graceful: lỗi SERP thì bỏ qua).
  let paa: string[] = [];
  let related: string[] = [];
  if (useDataForSeo && (await dataForSeoReady())) {
    try {
      const serp = await serpQuestions(keyword, locale);
      paa = serp.paa;
      related = serp.related;
    } catch {
      /* SERP lỗi/không đủ credit → vẫn tạo câu hỏi bằng AI */
    }
  }

  const { questions: aiQuestions, error } = await suggestGeoQuestions({
    title: post.title,
    keyword,
    content,
    locale: locale as Locale,
    override,
    realQuestions: paa,
    relatedTerms: related,
  });

  // Gộp: câu hỏi THẬT (PAA) lên trước, rồi câu hỏi AI; khử trùng lặp; tối đa 10.
  const seen = new Set<string>();
  const merged: string[] = [];
  const paaSet = new Set(paa.map((q) => q.trim().toLowerCase()));
  for (const q of [...paa, ...(aiQuestions ?? [])]) {
    const s = (q || '').trim();
    const k = s.toLowerCase();
    if (s && !seen.has(k)) {
      seen.add(k);
      merged.push(s);
    }
  }
  const questions = merged.slice(0, 10);
  if (questions.length) {
    const realCount = questions.filter((q) => paaSet.has(q.toLowerCase())).length;
    return NextResponse.json({ questions, keyword, title: post.title, realCount });
  }
  return NextResponse.json({ error: error ?? 'Không tạo được câu hỏi.' });
}
