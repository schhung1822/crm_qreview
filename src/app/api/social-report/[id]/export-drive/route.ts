import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { entitlementsForBiz } from '@/lib/billing/entitlement';
import {
  DRIVE_FOLDER_NAME,
  ensureFolder,
  refreshAccessToken,
  uploadFile,
} from '@/lib/drive/client';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { socialGate } from '@/lib/social/gating';
import { buildSocialReportHtml, socialReportFileName } from '@/lib/social/report-html';
import { getBranding } from '@/lib/store/branding';
import { getDriveCreds, getFolderId, getRefreshToken, setFolderId } from '@/lib/store/drive';
import { getSocialReport } from '@/lib/store/social-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ID_RE = /^sr_[a-f0-9]+$/;

// Nhãn tiêu đề mục do client gửi (từ i18n socialReport.view) - chỉ chuỗi hiển thị, được escape khi dựng HTML.
const BodySchema = z.object({
  labels: z.record(z.string().max(300)).refine((r) => Object.keys(r).length <= 150),
});

// POST /api/social-report/[id]/export-drive → dựng HTML báo cáo, tải lên Drive dạng .doc
// (Word/Google Docs mở được, giống cơ chế xuất bài viết hiện có).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard('content:write');
  if ('response' in g) return g.response;
  if (!ID_RE.test(params.id))
    return NextResponse.json({ error: 'Id không hợp lệ.' }, { status: 400 });

  const creds = await getDriveCreds();
  if (creds.source === 'none')
    return NextResponse.json({ error: 'Chưa cấu hình Google Drive.' }, { status: 400 });

  const rl = rateLimit(`driveup:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Thử lại sau ${rl.retryAfter}s.` }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });

  const report = await getSocialReport(params.id);
  if (!report) return NextResponse.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });

  // Gói FREE không được xuất file (chốt SERVER, không chỉ ẩn nút ở client).
  const { planId } = await entitlementsForBiz(g.bizId);
  if (socialGate(planId, report).exportLocked)
    return NextResponse.json(
      { error: 'Gói FREE không xuất được báo cáo. Nâng cấp gói để xuất PDF/DOC/Drive.', planLimited: true },
      { status: 403 },
    );

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return NextResponse.json({ needsConnect: true }, { status: 200 });

  // Logo + dòng nguồn + bộ màu Báo cáo Social từ Thông tin hệ thống (Quản trị nền tảng).
  const b = await getBranding();
  const html = buildSocialReportHtml(report, parsed.data.labels, {
    brand: { logo: b.logoDuongBan, sourceText: b.sourceText, sourceUrl: b.sourceUrl },
    theme: {
      accent: b.colorSocialAccent || undefined,
      strength: b.colorSocialStrength || undefined,
      weakness: b.colorSocialWeakness || undefined,
    },
  });
  const name = socialReportFileName(report, 'doc');

  try {
    const accessToken = await refreshAccessToken(creds, refreshToken);
    const folderId = await ensureFolder(accessToken, DRIVE_FOLDER_NAME, await getFolderId());
    await setFolderId(folderId);
    const file = await uploadFile(accessToken, {
      name,
      mimeType: 'application/msword',
      content: html,
      folderId,
    });
    return NextResponse.json({ ok: true, name, webViewLink: file.webViewLink, folder: DRIVE_FOLDER_NAME });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi tải lên Google Drive.' },
      { status: 502 },
    );
  }
}
