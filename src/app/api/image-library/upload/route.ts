// POST /api/image-library/upload → tải ảnh lên thư viện (nén WebP + ghi nhận kind='upload').
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { registerImage } from '@/lib/store/image-library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  dataUri: z.string().min(20).max(12_000_000), // ~12MB base64
  name: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const rl = rateLimit(`imgup:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ảnh không hợp lệ.' }, { status: 400 });

  const m = parsed.data.dataUri.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!m) return NextResponse.json({ error: 'Cần ảnh dạng data URI.' }, { status: 400 });

  try {
    const rel = await saveGeneratedImage(m[1], parsed.data.name || 'upload'); // /generated/<file>.webp
    const file = rel.replace(/^\/generated\//, '');
    // Ghi đè kind = 'upload' (saveGeneratedImage mặc định ghi 'ai').
    await registerImage(file, 'upload', parsed.data.name);
    return NextResponse.json({ url: rel, file });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Tải ảnh lên thất bại.' },
      { status: 502 },
    );
  }
}
