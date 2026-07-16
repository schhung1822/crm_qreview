// POST /api/script-analysis/[id]/cover → ẢNH BÌA chia sẻ (OG) cho phân tích kịch bản.
//   - Có dataUri → TẢI ẢNH TỪ NGOÀI (nén + JPEG), không cần AI key.
//   - Không → tạo bằng AI (1536x1024 → JPEG 1200).
// Lưu URL tuyệt đối vào rec.shareCover. DELETE → gỡ ảnh bìa.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { buildCoverPrompt, generateImageB64, imageProviderAvailable } from '@/lib/ai/images';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { env } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { DEFAULT_IMAGE_CONFIG, getImageConfig } from '@/lib/store/image-config';
import { getScriptAnalysis, updateScriptAnalysis } from '@/lib/store/script-analyses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const ID_RE = /^vsa_[a-f0-9]+$/;
const Body = z.object({
  dataUri: z.string().max(20_000_000).optional(), // có → tải ảnh từ ngoài (bỏ qua AI)
  prompt: z.string().max(1000).optional(),
  useSystemDesign: z.boolean().optional(),
  provider: z.enum(['', 'openai', 'gemini']).optional(),
  model: z.string().max(120).optional(),
});

function absoluteUrl(rel: string, req: Request): string {
  let base = env.appUrl || '';
  if (!base) {
    try {
      base = new URL(req.url).origin;
    } catch {
      /* bỏ qua */
    }
  }
  return base ? `${base}${rel}` : rel;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const rec = await getScriptAnalysis(params.id);
  if (!rec) return NextResponse.json({ error: 'Không tìm thấy bản phân tích.' }, { status: 404 });
  const coverHint = `og-${rec.title || rec.url}`;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  // ── Chế độ TẢI ẢNH TỪ NGOÀI: nén + chuyển JPEG (thân thiện MXH), không cần AI key ──
  if (parsed.data.dataUri) {
    const rlUp = rateLimit(`imgup:${clientIp(req)}`, 20, 60_000);
    if (!rlUp.ok)
      return NextResponse.json(
        { error: `Thử lại sau ${rlUp.retryAfter}s.` },
        { status: 429, headers: { 'Retry-After': String(rlUp.retryAfter) } },
      );
    const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(parsed.data.dataUri.trim());
    if (!m) return NextResponse.json({ error: 'Ảnh không hợp lệ (cần ảnh PNG/JPEG/WebP).' }, { status: 400 });
    try {
      const rel = await saveGeneratedImage(m[1], coverHint, { format: 'jpeg', maxWidth: 1200 });
      const url = absoluteUrl(rel, req);
      await updateScriptAnalysis(params.id, { shareCover: url });
      return NextResponse.json({ url });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Lỗi xử lý ảnh tải lên.' },
        { status: 500 },
      );
    }
  }

  // ── Chế độ TẠO BẰNG AI ──
  const rl = rateLimit(`img:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok)
    return NextResponse.json(
      { error: `Thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  if (!(await imageProviderAvailable()))
    return NextResponse.json({ error: 'Cần API key OpenAI hoặc Gemini (hỗ trợ tạo ảnh) ở API Keys & AI.' }, { status: 400 });

  const useSD = parsed.data.useSystemDesign !== false;
  const config = useSD ? await getImageConfig() : DEFAULT_IMAGE_CONFIG;
  const provider = parsed.data.provider ?? config.imageProvider;
  const model = parsed.data.provider ? parsed.data.model ?? '' : config.imageModel;

  const prompt = await buildCoverPrompt({
    title: rec.title || rec.url,
    userBrief: parsed.data.prompt,
    config,
  });

  try {
    const { b64 } = await generateImageB64({ prompt, size: '1536x1024', provider, model });
    const rel = await saveGeneratedImage(b64, coverHint, { format: 'jpeg', maxWidth: 1200 });
    const url = absoluteUrl(rel, req);
    await updateScriptAnalysis(params.id, { shareCover: url });
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
  await updateScriptAnalysis(params.id, { shareCover: undefined });
  return NextResponse.json({ ok: true });
}
