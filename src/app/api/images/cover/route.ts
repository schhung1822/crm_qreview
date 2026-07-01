import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { describeImageScene } from '@/lib/ai/content';
import { buildCoverPrompt, generateImageB64, imageProviderAvailable } from '@/lib/ai/images';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { getImageConfig } from '@/lib/store/image-config';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(2000).optional(),
  // Trích đoạn nội dung bài (plain text) để ảnh bám đúng chủ đề.
  content: z.string().max(20000).optional(),
  // Override tỉ lệ (tùy chọn) - style nền lấy từ Cài đặt ảnh AI. Ảnh luôn không chữ.
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(),
  // Override AI tạo ảnh ngay tại editor (tùy chọn).
  imageProvider: z.enum(['', 'openai', 'gemini']).optional(),
  imageModel: z.string().max(120).optional(),
});

// POST /api/images/cover → tạo ảnh bìa dùng cấu hình đã lưu (system design) + override.
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  if (!(await imageProviderAvailable())) {
    return NextResponse.json({ ok: false, needsImageKey: true });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }

  const config = await getImageConfig();
  const size = parsed.data.size ?? config.size;
  // Override AI từ editor (nếu có) ưu tiên hơn cấu hình lưu.
  const provider = parsed.data.imageProvider ?? config.imageProvider;
  const model = parsed.data.imageProvider ? (parsed.data.imageModel ?? '') : config.imageModel;

  // Bước 1: AI text ĐỌC nội dung bài → rút mô tả cảnh để ảnh bám sát nội dung.
  // Lỗi/không có key text → bỏ qua, vẫn tạo ảnh theo tiêu đề + trích đoạn.
  const sceneBrief = await describeImageScene({
    title: parsed.data.title,
    content: parsed.data.content,
  });

  const prompt = buildCoverPrompt({
    title: parsed.data.title,
    summary: parsed.data.summary,
    content: parsed.data.content,
    sceneBrief: sceneBrief ?? undefined,
    config,
  });

  try {
    const { b64 } = await generateImageB64({ prompt, size, provider, model });
    // Tên file ảnh bìa theo chủ đề bài (SEO ảnh).
    const url = await saveGeneratedImage(b64, parsed.data.title);
    return NextResponse.json({ ok: true, url, prompt });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Lỗi tạo ảnh' },
      { status: 502 },
    );
  }
}
