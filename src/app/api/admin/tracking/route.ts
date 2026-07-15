import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuper } from '@/lib/admin/guard';
import { getTrackingConfigAdmin, saveTrackingConfig } from '@/lib/store/tracking-config';

export const dynamic = 'force-dynamic';

// GET → cấu hình pixel/CAPI cho superadmin sửa (KHÔNG trả token, chỉ báo đã đặt hay chưa).
export async function GET() {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  return NextResponse.json(await getTrackingConfigAdmin());
}

const FbItem = z.object({
  id: z.string().max(40).optional(),
  pixelId: z.string().max(64).optional(),
  accessToken: z.string().max(1000).optional(), // rỗng = giữ token cũ theo id
  testCode: z.string().max(64).optional(),
  enabled: z.boolean().optional(),
});
const TtItem = z.object({
  id: z.string().max(40).optional(),
  pixelCode: z.string().max(64).optional(),
  accessToken: z.string().max(1000).optional(),
  testCode: z.string().max(64).optional(),
  enabled: z.boolean().optional(),
});
const Schema = z.object({
  fb: z.array(FbItem).max(30).optional(),
  tt: z.array(TtItem).max(30).optional(),
  ga4Enabled: z.boolean().optional(),
  ga4MeasurementId: z.string().max(64).optional(),
  ga4ApiSecret: z.string().max(200).optional(),
  gtmEnabled: z.boolean().optional(),
  gtmContainerId: z.string().max(64).optional(),
});

// POST → lưu cấu hình. Token rỗng thì giữ nguyên token đang lưu.
export async function POST(req: Request) {
  const chk = await requireSuper();
  if ('error' in chk) return chk.error;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'errInvalidParams' }, { status: 400 });
  await saveTrackingConfig(parsed.data);
  return NextResponse.json({ ok: true, config: await getTrackingConfigAdmin() });
}
