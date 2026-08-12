import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/current';
import { getBranding } from '@/lib/store/branding';
import { deleteSocialReport, getSocialReport } from '@/lib/store/social-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ID_RE = /^sr_[a-f0-9]+$/;

// GET /api/social-report/[id] → báo cáo đầy đủ (dữ liệu + chỉ số + phân tích).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard();
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id))
    return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });
  const report = await getSocialReport(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });

  // Giới hạn theo GÓI CƯỚC: FREE + fanpage → ẨN phần phân tích sâu (không gửi về client);
  // FREE → chặn xuất file. gated báo cho client hiện thẻ khóa + nút nâng cấp.
  // Kèm thương hiệu (Thông tin hệ thống): logo + dòng nguồn cho bản xuất PDF/.doc,
  // và bộ màu riêng của Báo cáo Social (rỗng = client dùng màu mặc định).
  const b = await getBranding();
  return NextResponse.json({
    report,
    branding: { logo: b.logoDuongBan, sourceText: b.sourceText, sourceUrl: b.sourceUrl },
    socialTheme: {
      accent: b.colorSocialAccent || undefined,
      strength: b.colorSocialStrength || undefined,
      weakness: b.colorSocialWeakness || undefined,
    },
  });
}

// DELETE /api/social-report/[id] → xóa báo cáo.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id))
    return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });
  const ok = await deleteSocialReport(params.id);
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
