// POST /api/admin/branding/og-image → nhận ảnh (data URI) từ superadmin, LƯU thành file tĩnh
// /generated/og-*.webp rồi trả URL TUYỆT ĐỐI (kèm APP_URL). Vì OG image PHẢI là URL http(s) công
// khai (Facebook/Zalo không đọc data URI) nên upload ảnh bìa phải host thành URL, khác với logo.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { saveGeneratedImage } from '@/lib/ai/image-store';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({ dataUri: z.string().min(20).max(8_000_000) });

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ảnh không hợp lệ.' }, { status: 400 });

  // Tách base64 khỏi "data:image/...;base64,....". Nếu không phải data URI ảnh → từ chối.
  const m = parsed.data.dataUri.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!m) return NextResponse.json({ error: 'Cần ảnh (data URI). Hoặc dán URL trực tiếp.' }, { status: 400 });

  const rel = await saveGeneratedImage(m[1], 'og-cover'); // → /generated/og-cover-xxxx.webp
  // OG cần URL TUYỆT ĐỐI. Ưu tiên APP_URL; nếu chưa đặt, suy từ Origin của request.
  let base = env.appUrl || '';
  if (!base) {
    try {
      base = new URL(req.url).origin;
    } catch {
      /* bỏ qua */
    }
  }
  return NextResponse.json({ url: base ? `${base}${rel}` : rel });
}
