// Điểm đến của link rút gọn /<slug> (middleware rewrite /bao-cao-... và /kich-ban-... sang đây).
//  - Bot MXH  → trả trang OG tối giản (ảnh bìa/tiêu đề/mô tả) → hiện preview.
//  - Người thật → chuyển hướng 302 sang trang xem đầy đủ (/share/<token> hoặc /share/video/<token>).
import { NextResponse } from 'next/server';
import { runWithBiz } from '@/lib/biz/context';
import { env } from '@/lib/env';
import { GATE, pickGateLocale } from '@/lib/share/gate-strings';
import { resolveScriptOgFields } from '@/lib/script-analysis/share-og';
import { buildShareOgHtml, resolveOgFields } from '@/lib/social/share-og';
import { getBranding } from '@/lib/store/branding';
import { getScriptAnalysis } from '@/lib/store/script-analyses';
import { resolveShare as resolveScriptShare } from '@/lib/store/script-shares';
import { getShareLink, shareLinkKind } from '@/lib/store/share-links';
import { getSocialReport } from '@/lib/store/social-reports';
import { resolveShare as resolveSocialShare } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OG_BOT_RE =
  /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|Slackbot|LinkedInBot|WhatsApp|TelegramBot|Discordbot|Pinterest|redditbot|Applebot|Google-InspectionTool|SkypeUriPreview|vkShare|Embedly|Iframely|Zalo|zalo/i;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const base = env.appUrl || new URL(req.url).origin;
  const link = await getShareLink(params.slug);
  if (!link) return NextResponse.redirect(base, 302); // link không tồn tại/đã thu hồi → về trang chủ

  const kind = shareLinkKind(link);
  const viewUrl = kind === 'script' ? `${base}/share/video/${link.token}` : `${base}/share/${link.token}`;
  const isBot = OG_BOT_RE.test(req.headers.get('user-agent') || '');

  if (!isBot) {
    // Người dùng thật → sang trang xem đầy đủ (token chết thì trang đó tự hiện 404 gọn).
    return NextResponse.redirect(viewUrl, 302);
  }

  const b = await getBranding();
  const notFound = () => new Response('Not found', { status: 404 });

  // Bot: dựng OG từ đối tượng + override của link, theo loại.
  if (kind === 'script') {
    const s = await resolveScriptShare(link.token);
    if (!s) return notFound();
    const rec = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getScriptAnalysis(s.analysisId));
    if (!rec || rec.status !== 'done' || !rec.analysis) return notFound();
    const { title, description, image } = resolveScriptOgFields(rec, b, {
      title: link.title,
      description: link.description,
      image: link.image,
    });
    const html = buildShareOgHtml({
      locale: rec.locale || 'vi',
      title,
      description: s.locked ? GATE[pickGateLocale(rec.locale)].metaLocked : description,
      image,
      pageUrl: `${base}/${link.slug}`,
      siteName: b.sourceText || undefined,
    });
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const s = await resolveSocialShare(link.token);
  if (!s) return notFound();
  const report = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getSocialReport(s.reportId));
  if (!report || (report.status !== 'done' && report.status !== 'collected')) return notFound();
  const { title, description, image } = resolveOgFields(report, b, {
    title: link.title,
    description: link.description,
    image: link.image,
  });
  const html = buildShareOgHtml({
    locale: report.locale || 'vi',
    title,
    description: s.locked ? GATE[pickGateLocale(report.locale)].metaLocked : description,
    image,
    pageUrl: `${base}/${link.slug}`,
    siteName: b.sourceText || undefined,
  });
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
