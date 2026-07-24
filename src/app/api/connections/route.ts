import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { runWithBiz } from '@/lib/biz/context';
import {
  createConnection,
  deleteConnection,
  listConnections,
} from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

// GET /api/connections → danh sách (đã ẩn credential).
export async function GET() {
  const g = await guard();
  if ('response' in g) return g.response;
  return NextResponse.json({ connections: await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listConnections()) });
}

const CreateSchema = z.object({
  provider: z.enum(['wordpress', 'wix', 'shopify', 'haravan', 'sapo']),
  label: z.string().min(1).max(120),
  baseUrl: z.string().min(1).max(2000),
  locale: z.enum(locales),
  pathStrategy: z.enum(['subdir', 'subdomain']).optional(),
  seoPlugin: z.string().max(40).optional(),
  // Giới hạn số lượng + độ dài credential để tránh nhồi dữ liệu lớn vào kho mã hóa.
  credentials: z.record(z.string().max(120), z.string().max(8000)),
});

// POST /api/connections → tạo kết nối mới (credential lưu mã hóa).
export async function POST(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  try {
    assertPublicUrl(parsed.data.baseUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'URL bị chặn' },
      { status: 400 },
    );
  }
  const created = await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => createConnection(parsed.data));
  return NextResponse.json({ connection: created });
}

// DELETE /api/connections?id=conn_xxx
export async function DELETE(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'thiếu id' }, { status: 400 });
  await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => deleteConnection(id));
  return NextResponse.json({ connections: await runWithBiz({ userId: g.user.id, bizId: g.bizId }, () => listConnections()) });
}
