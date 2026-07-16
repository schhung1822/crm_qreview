// POST /api/script-analysis/[id]/share/password → đặt/gỡ mật khẩu KHÓA cho link chia sẻ.
//   body { password: string } — chuỗi rỗng = GỠ khóa (công khai). Chỉ chủ (content:write) trong biz.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getScriptAnalysis, updateScriptAnalysis } from '@/lib/store/script-analyses';
import { setSharePassword } from '@/lib/store/script-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ID_RE = /^vsa_[a-f0-9]+$/;
const Body = z.object({ password: z.string().max(200) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const rec = await getScriptAnalysis(params.id);
  if (!rec || !rec.share) {
    return NextResponse.json({ error: 'Bản phân tích chưa bật chia sẻ.' }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const pw = parsed.data.password.trim();
  const ok = await setSharePassword(g.bizId, params.id, pw || null);
  if (!ok) return NextResponse.json({ error: 'Không cập nhật được (link đã tắt?).' }, { status: 400 });
  await updateScriptAnalysis(params.id, {
    share: { ...rec.share, locked: !!pw },
  });
  return NextResponse.json({ ok: true, locked: !!pw });
}
