import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import {
  buildIllustrationPrompt,
  generateImageB64,
  imageProviderAvailable,
} from '@/lib/ai/images';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { getImageConfig } from '@/lib/store/image-config';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  markdown: z.string().min(1).max(400_000),
  imageProvider: z.enum(['', 'openai', 'gemini']).optional(),
  imageModel: z.string().max(120).optional(),
  max: z.number().min(1).max(6).default(3),
});

// Tìm ảnh placeholder: ![alt](src) với src KHÔNG phải http và chưa phải /generated.
const PLACEHOLDER = /!\[([^\]]*)\]\((?!https?:\/\/|\/generated\/)([^)]*)\)/g;

// POST /api/images/illustrate → tạo ảnh cho các vị trí placeholder trong bài, thay URL.
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

  const matches = [...parsed.data.markdown.matchAll(PLACEHOLDER)].slice(0, parsed.data.max);
  if (matches.length === 0) {
    return NextResponse.json({ ok: true, images: [], count: 0 });
  }

  const config = await getImageConfig();
  const provider = parsed.data.imageProvider ?? config.imageProvider;
  const model = parsed.data.imageProvider ? (parsed.data.imageModel ?? '') : config.imageModel;
  // KHÔNG tự sửa markdown - trả danh sách ảnh (alt + url) để người dùng tích chọn ở editor.
  const images: Array<{ alt: string; url: string }> = [];
  try {
    for (const m of matches) {
      const alt = (m[1] || 'minh họa').trim();
      const prompt = buildIllustrationPrompt(alt, config);
      const { b64 } = await generateImageB64({ prompt, size: '1536x1024', provider, model });
      const url = await saveGeneratedImage(b64, alt);
      images.push({ alt, url });
    }
    return NextResponse.json({ ok: true, images, count: images.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Lỗi tạo ảnh', images, count: images.length },
      { status: 502 },
    );
  }
}
