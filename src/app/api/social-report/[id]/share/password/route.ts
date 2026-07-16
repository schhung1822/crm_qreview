// POST /api/social-report/[id]/share/password → đặt/gỡ mật khẩu KHÓA cho link chia sẻ của báo cáo.
//   body { password: string } — chuỗi rỗng = GỠ khóa (công khai). Chỉ chủ (content:write) trong biz.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getSocialReport, updateSocialReport } from '@/lib/store/social-reports';
import { setSharePassword } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ID_RE = /^sr_[a-f0-9]+$/;
const Body = z.object({ password: z.string().max(200) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const report = await getSocialReport(params.id);
  if (!report || !report.share) {
    return NextResponse.json({ error: 'Báo cáo chưa bật chia sẻ.' }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const pw = parsed.data.password.trim();
  const ok = await setSharePassword(g.bizId, params.id, pw || null);
  if (!ok) return NextResponse.json({ error: 'Không cập nhật được (link đã tắt?).' }, { status: 400 });
  // Ghi cờ locked vào record để UI hiển thị trạng thái.
  await updateSocialReport(params.id, (r) => {
    if (r.share) r.share.locked = !!pw;
  });
  return NextResponse.json({ ok: true, locked: !!pw });
}
