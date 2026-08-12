// Trang OG TỐI GIẢN cho bot mạng xã hội khi truy cập /share/video/<token> (middleware rewrite sang đây).
import { runWithBiz } from '@/lib/biz/context';
import { requestBaseUrl } from '@/lib/base-url';
import { buildShareOgHtml } from '@/lib/social/share-og';
import { resolveScriptOgFields } from '@/lib/script-analysis/share-og';
import { getBranding } from '@/lib/store/branding';
import { getScriptAnalysis } from '@/lib/store/script-analyses';
import { GATE, pickGateLocale } from '@/lib/share/gate-strings';
import { resolveShare } from '@/lib/store/script-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = params.token;
  if (!TOKEN_RE.test(token)) return new Response('Not found', { status: 404 });

  const s = await resolveShare(token);
  if (!s) return new Response('Not found', { status: 404 });
  const rec = await runWithBiz({ userId: s.ownerId, bizId: s.bizId }, () => getScriptAnalysis(s.analysisId));
  if (!rec || rec.status !== 'done' || !rec.analysis) return new Response('Not found', { status: 404 });

  const b = await getBranding();
  const { title, description, image } = resolveScriptOgFields(rec, b);
  const base = requestBaseUrl(req);
  const html = buildShareOgHtml({
    locale: rec.locale || 'vi',
    title,
    // Khóa → KHÔNG lộ tóm tắt ra thẻ mô tả.
    description: s.locked ? GATE[pickGateLocale(rec.locale)].metaLocked : description,
    image,
    pageUrl: `${base}/share/video/${token}`,
    siteName: b.sourceText || undefined,
  });

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
