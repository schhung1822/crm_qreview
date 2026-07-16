// Trang OG TỐI GIẢN cho bot mạng xã hội khi truy cập /share/<token> (middleware rewrite sang đây).
import { runWithBiz } from '@/lib/biz/context';
import { env } from '@/lib/env';
import { buildShareOgHtml, resolveOgFields } from '@/lib/social/share-og';
import { getBranding } from '@/lib/store/branding';
import { getSocialReport } from '@/lib/store/social-reports';
import { resolveShare } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!TOKEN_RE.test(token)) return new Response('Not found', { status: 404 });

  const s = await resolveShare(token);
  if (!s) return new Response('Not found', { status: 404 });
  const report = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getSocialReport(s.reportId));
  if (!report || (report.status !== 'done' && report.status !== 'collected')) {
    return new Response('Not found', { status: 404 });
  }

  const b = await getBranding();
  const { title, description, image } = resolveOgFields(report, b);
  const base = env.appUrl || new URL(req.url).origin;
  const html = buildShareOgHtml({
    locale: report.locale || 'vi',
    title,
    description,
    image,
    pageUrl: `${base}/share/${token}`,
    siteName: b.sourceText || undefined,
  });

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
