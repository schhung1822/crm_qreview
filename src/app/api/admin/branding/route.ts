import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { getBranding, resetBranding, saveBranding } from '@/lib/store/branding';

export const dynamic = 'force-dynamic';

export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await getBranding());
}

// Ảnh có thể là URL hoặc data URI (base64) → cho phép dài. Chuỗi rỗng = trở về mặc định.
const img = z.string().max(1_500_000);
// Màu: HEX (#rgb / #rrggbb) hoặc rỗng (= mặc định). Chặn giá trị lạ → không chèn CSS vào <style>.
const color = z
  .string()
  .max(9)
  .refine((v) => v === '' || /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v.trim()), 'màu không hợp lệ');
const Schema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(600).optional(),
  favicon: img.optional(),
  logoAmBan: img.optional(),
  logoDuongBan: img.optional(),
  bizLogo: img.optional(),
  ogImage: z.string().max(2000).optional(), // URL ảnh bìa OG (không nhận data URI — upload host thành URL)
  sourceText: z.string().max(120).optional(),
  sourceUrl: z.string().max(600).optional(),
  colorPrimary: color.optional(),
  colorHeader: color.optional(),
  colorButtonBorder: color.optional(),
  colorBorder: color.optional(),
  colorHome: color.optional(),
  colorHomeGradient: color.optional(),
  colorSocialAccent: color.optional(),
  colorSocialStrength: color.optional(),
  colorSocialWeakness: color.optional(),
  colorShareButton: color.optional(),
  colorShareBadge: color.optional(),
  reset: z.boolean().optional(),
});

export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });

  if (parsed.data.reset) return NextResponse.json(await resetBranding());

  const { reset: _r, ...patch } = parsed.data;
  return NextResponse.json(await saveBranding(patch));
}
