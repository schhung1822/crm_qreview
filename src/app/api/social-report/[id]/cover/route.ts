// POST /api/social-report/[id]/cover → tạo ẢNH BÌA chia sẻ (OG) bằng AI cho báo cáo.
//   body: { prompt?, useSystemDesign?, provider?, model? }. Ảnh ngang 1536x1024 (hợp OG), nén WebP,
//   host thành URL tuyệt đối rồi lưu vào report.shareCover.
// DELETE → gỡ ảnh bìa (quay về avatar/ảnh nền tảng).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { buildCoverPrompt, generateImageB64, imageProviderAvailable } from '@/lib/ai/images';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { env } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { DEFAULT_IMAGE_CONFIG, getImageConfig } from '@/lib/store/image-config';
import { getSocialReport, updateSocialReport } from '@/lib/store/social-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120; // tạo ảnh AI có thể lâu

const ID_RE = /^sr_[a-f0-9]+$/;
const Body = z.object({
  prompt: z.string().max(1000).optional(), // nội dung/mô tả người dùng muốn cho ảnh bìa
  useSystemDesign: z.boolean().optional(), // dùng phong cách "Cài đặt ảnh AI" (system design) hay không
  provider: z.enum(['', 'openai', 'gemini']).optional(),
  model: z.string().max(120).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const rl = rateLimit(`img:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  if (!(await imageProviderAvailable()))
    return NextResponse.json({ error: 'Cần API key OpenAI hoặc Gemini (hỗ trợ tạo ảnh) ở API Keys & AI.' }, { status: 400 });

  const report = await getSocialReport(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  // System design bật (mặc định) → lấy phong cách từ Cài đặt ảnh AI; tắt → dùng cấu hình trung tính.
  const useSD = parsed.data.useSystemDesign !== false;
  const config = useSD ? await getImageConfig() : DEFAULT_IMAGE_CONFIG;
  const provider = parsed.data.provider ?? config.imageProvider;
  const model = parsed.data.provider ? parsed.data.model ?? '' : config.imageModel;

  const prompt = await buildCoverPrompt({
    title: report.title,
    userBrief: parsed.data.prompt,
    config,
  });

  try {
    // 1536x1024 (ngang) = tỉ lệ hợp ảnh bìa OG.
    const { b64 } = await generateImageB64({ prompt, size: '1536x1024', provider, model });
    // ẢNH BÌA CHIA SẺ dùng JPEG (mozjpeg) + bề rộng 1200 (chuẩn OG) — Facebook/Zalo render ổn định
    // hơn WebP. Ảnh nội dung khác vẫn giữ WebP.
    const rel = await saveGeneratedImage(b64, `og-${report.title}`, { format: 'jpeg', maxWidth: 1200 });
    // OG cần URL TUYỆT ĐỐI. Ưu tiên APP_URL; nếu chưa đặt → suy từ Origin request.
    let base = env.appUrl || '';
    if (!base) {
      try {
        base = new URL(req.url).origin;
      } catch {
        /* bỏ qua */
      }
    }
    const url = base ? `${base}${rel}` : rel;
    await updateSocialReport(params.id, (x) => {
      x.shareCover = url;
    });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tạo ảnh bìa.' },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });
  await updateSocialReport(params.id, (x) => {
    x.shareCover = undefined;
  });
  return NextResponse.json({ ok: true });
}
