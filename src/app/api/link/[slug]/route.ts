// Điểm đến của link rút gọn /<slug> (middleware rewrite /bao-cao-... sang đây).
//  - Bot MXH  → trả trang OG tối giản (ảnh bìa/tiêu đề/mô tả) → hiện preview.
//  - Người thật → chuyển hướng 302 sang /share/<token> (trang báo cáo đầy đủ).
import { NextResponse } from 'next/server';
import { runWithBiz } from '@/lib/biz/context';
import { env } from '@/lib/env';
import { buildShareOgHtml, resolveOgFields } from '@/lib/social/share-og';
import { getBranding } from '@/lib/store/branding';
import { getShareLink } from '@/lib/store/share-links';
import { getSocialReport } from '@/lib/store/social-reports';
import { resolveShare } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OG_BOT_RE =
  /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|Slackbot|LinkedInBot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|Google-InspectionTool|SkypeUriPreview|vkShare|Embedly|Iframely|Zalo|zalo/i;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const base = env.appUrl || new URL(req.url).origin;
  const link = await getShareLink(params.slug);
  if (!link) return NextResponse.redirect(base, 302); // link không tồn tại/đã thu hồi → về trang chủ

  // Token phải còn hiệu lực (share chưa bị tắt) thì trang /share mới xem được.
  const s = await resolveShare(link.token);
  const shareUrl = `${base}/share/${link.token}`;
  const isBot = OG_BOT_RE.test(req.headers.get('user-agent') || '');

  if (!isBot) {
    // Người dùng thật → sang trang báo cáo đầy đủ (nếu token chết thì vẫn về /share để hiện 404 gọn).
    return NextResponse.redirect(shareUrl, 302);
  }

  // Bot: dựng OG từ báo cáo + override của link.
  if (!s) return new Response('Not found', { status: 404 });
  const report = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getSocialReport(s.reportId));
  if (!report || (report.status !== 'done' && report.status !== 'collected')) {
    return new Response('Not found', { status: 404 });
  }
  const b = await getBranding();
  const { title, description, image } = resolveOgFields(report, b, {
    title: link.title,
    description: link.description,
    image: link.image,
  });
  const html = buildShareOgHtml({
    locale: report.locale || 'vi',
    title,
    description: s.locked ? 'Báo cáo được bảo vệ bằng mật khẩu — cần mật khẩu để xem.' : description,
    image,
    pageUrl: `${base}/${link.slug}`,
    siteName: b.sourceText || undefined,
  });
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
