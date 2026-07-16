import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { entitlementsForBiz } from '@/lib/billing/entitlement';
import { env } from '@/lib/env';
import { createShareLink, revokeShareLinksForReport } from '@/lib/store/share-links';
import { getSocialReport, updateSocialReport } from '@/lib/store/social-reports';
import { createShare, revokeShareForReport } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ID_RE = /^sr_[a-f0-9]+$/;
const BodySchema = z.object({ action: z.enum(['enable', 'disable']) });

function shareUrl(req: Request, token: string): string {
  const base = env.appUrl || new URL(req.url).origin;
  return `${base}/share/${token}`;
}

// POST /api/social-report/[id]/share → bật/tắt link chia sẻ công khai (trang chỉ-xem).
// Nội dung trang công khai vẫn bị giới hạn theo GÓI của CHỦ báo cáo (gating áp ở trang /share).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id)) return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const report = await getSocialReport(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });

  if (parsed.data.action === 'disable') {
    await revokeShareForReport(g.bizId, params.id);
    await revokeShareLinksForReport(g.bizId, params.id);
    await updateSocialReport(params.id, (r) => {
      r.share = undefined;
    });
    return NextResponse.json({ ok: true, enabled: false });
  }

  // enable: sinh token mới (thu hồi link cũ), lưu token vào record để chủ copy lại được.
  const { ownerId } = await entitlementsForBiz(g.bizId);
  await revokeShareLinksForReport(g.bizId, params.id); // dọn link rút gọn cũ (token cũ chết)
  const token = await createShare({ bizId: g.bizId, reportId: params.id, ownerId, createdBy: g.user.id });
  // Tự tạo LINK RÚT GỌN dạng blog (bao-cao-<ten>-<timestamp>) trỏ tới token này.
  const link = await createShareLink({
    bizId: g.bizId,
    reportId: params.id,
    ownerId,
    token,
    reportTitle: report.title,
    createdBy: g.user.id,
  });
  await updateSocialReport(params.id, (r) => {
    r.share = { token, createdAt: new Date().toISOString(), slug: link.slug };
  });
  const base = env.appUrl || new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    enabled: true,
    url: shareUrl(req, token),
    prettyUrl: `${base}/${link.slug}`,
    slug: link.slug,
  });
}
