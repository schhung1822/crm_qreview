import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { locales } from '@/i18n/config';
import { assertPublicUrl } from '@/lib/security/ssrf';
import { testConnectionInput } from '@/lib/store/connections';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  provider: z.enum(['wordpress', 'wix', 'shopify', 'haravan', 'sapo']),
  baseUrl: z.string().min(1),
  locale: z.enum(locales),
  seoPlugin: z.string().optional(),
  credentials: z.record(z.string()),
});

// POST /api/connections/test → kiểm tra credential trước khi lưu.
export async function POST(req: Request) {
  const g = await guard('connections:manage');
  if ('response' in g) return g.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tham số không hợp lệ' }, { status: 400 });
  }
  try {
    assertPublicUrl(parsed.data.baseUrl);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'URL bị chặn' },
      { status: 400 },
    );
  }
  return NextResponse.json(await testConnectionInput(parsed.data));
}
