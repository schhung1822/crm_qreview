import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { readAnnouncements, saveAnnouncements } from '@/lib/store/announcements';

export const dynamic = 'force-dynamic';

// GET → cấu hình đầy đủ cho superadmin sửa.
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await readAnnouncements());
}

const Schema = z.object({
  enabled: z.boolean(),
  speed: z.number().min(10).max(300),
  items: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        text: z.string().max(300),
        url: z.string().max(500).optional(),
        enabled: z.boolean(),
      }),
    )
    .max(30),
});

// POST → lưu toàn bộ cấu hình thanh thông báo.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  return NextResponse.json(await saveAnnouncements(parsed.data));
}
