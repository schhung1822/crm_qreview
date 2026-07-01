import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getImageConfig, saveImageConfig } from '@/lib/store/image-config';

export const dynamic = 'force-dynamic';

// GET /api/image-config → cấu hình ảnh AI toàn cục.
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json({ config: await getImageConfig() });
}

const PatchSchema = z.object({
  systemDesign: z.string().optional(),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(),
  imageProvider: z.enum(['', 'openai', 'gemini']).optional(),
  imageModel: z.string().optional(),
});

// POST /api/image-config → lưu cấu hình (cần content:write).
export async function POST(req: Request) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  return NextResponse.json({ config: await saveImageConfig(parsed.data) });
}
