import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { bizHasFeature, entitlementsForBiz } from '@/lib/billing/entitlement';
import { env } from '@/lib/env';
import { createShareLink, revokeShareLinksForReport } from '@/lib/store/share-links';
import { getScriptAnalysis, updateScriptAnalysis } from '@/lib/store/script-analyses';
import { createShare, revokeShareForAnalysis } from '@/lib/store/script-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ action: z.enum(['enable', 'disable']) });

function shareUrl(req: Request, token: string): string {
  const base = env.appUrl || new URL(req.url).origin;
  return `${base}/share/video/${token}`;
}

// POST /api/script-analysis/[id]/share → bật/tắt link chia sẻ công khai (trang chỉ-xem).
// Trang công khai tự kiểm lại gói của CHỦ (mất quyền videoScriptAnalysis → khóa link).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;

  const rec = await getScriptAnalysis(params.id);
  if (!rec) return NextResponse.json({ error: 'Không tìm thấy bản phân tích.' }, { status: 404 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ' }, { status: 400 });

  if (parsed.data.action === 'disable') {
    await revokeShareForAnalysis(g.bizId, params.id);
    await revokeShareLinksForReport(g.bizId, params.id);
    await updateScriptAnalysis(params.id, { share: undefined });
    return NextResponse.json({ ok: true, enabled: false });
  }

  // enable: yêu cầu gói còn quyền phân tích kịch bản (đồng bộ với quyền tạo).
  if (g.bizId && !(await bizHasFeature(g.bizId, 'videoScriptAnalysis'))) {
    return NextResponse.json({ error: 'Gói của bạn không có quyền chia sẻ phân tích kịch bản.' }, { status: 403 });
  }
  const { ownerId } = await entitlementsForBiz(g.bizId);
  await revokeShareLinksForReport(g.bizId, params.id); // dọn link rút gọn cũ (token cũ chết)
  const token = await createShare({ bizId: g.bizId, analysisId: params.id, ownerId, createdBy: g.user.id });
  // Tự tạo LINK RÚT GỌN dạng blog (kich-ban-<ten>-<timestamp>) trỏ tới token này.
  const link = await createShareLink({
    bizId: g.bizId,
    reportId: params.id,
    ownerId,
    token,
    reportTitle: rec.title || rec.url,
    createdBy: g.user.id,
    kind: 'script',
  });
  await updateScriptAnalysis(params.id, {
    share: { token, createdAt: new Date().toISOString(), slug: link.slug },
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
