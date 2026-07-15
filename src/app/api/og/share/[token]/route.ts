// Trang OG TỐI GIẢN cho bot mạng xã hội (facebookexternalhit, Zalo, Twitter…). Middleware rewrite
// /share/<token> của BOT sang đây. Trả HTML ~2KB CHỈ gồm thẻ og:/twitter: → bot chắc chắn parse được
// (khác trang /share thật ~124KB render động dễ khiến bot bỏ cuộc). Người dùng thật KHÔNG vào đây.
import { runWithBiz } from '@/lib/biz/context';
import { env } from '@/lib/env';
import type { SocialPlatform, SocialReportRecord } from '@/lib/social/types';
import { getBranding } from '@/lib/store/branding';
import { getSocialReport } from '@/lib/store/social-reports';
import { resolveShare } from '@/lib/store/social-shares';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_RE = /^[a-f0-9]{64}$/;

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  fbgroup: 'Facebook Group',
  fbprofile: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  shopee: 'Shopee',
  shopeeshop: 'Shopee',
  tiktokshop: 'TikTok Shop',
  tiktokshopshop: 'TikTok Shop',
  lazada: 'Lazada',
  lazadashop: 'Lazada',
  overall: 'mạng xã hội',
  ecom: 'sàn thương mại điện tử',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportDescription(r: SocialReportRecord): string {
  const a = r.analysis ?? {};
  const raw =
    a.summary?.summary ||
    a.groupSummary?.summary ||
    a.profileSummary?.summary ||
    a.shopeeSummary?.summary ||
    a.shopSummary?.summary ||
    a.ecomSummary?.summary ||
    '';
  const text = raw.trim();
  if (text) return text.length > 200 ? `${text.slice(0, 197)}…` : text;
  return `Báo cáo phân tích ${PLATFORM_LABEL[r.platform] ?? 'nền tảng'}: nội dung, chiến thuật, điểm mạnh/yếu và gợi ý.`;
}

function reportImage(r: SocialReportRecord, fallback: string): string {
  const ch = r.channels?.[0];
  return r.shareCover || ch?.page?.profilePicture || ch?.product?.images?.[0] || fallback;
}

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
  const platform = PLATFORM_LABEL[report.platform] ?? 'nền tảng';
  const title = `Báo cáo ${report.title} trên ${platform}`;
  const description = reportDescription(report);
  const image = reportImage(report, b.ogImage || b.logoDuongBan);
  // og:url PHẢI là URL công khai. Sau Cloudflare/nginx, req.url = http://0.0.0.0:3000 → dùng APP_URL.
  const base = env.appUrl || new URL(req.url).origin;
  const pageUrl = `${base}/share/${token}`;

  const html =
    `<!doctype html><html lang="${esc(report.locale || 'vi')}"><head><meta charset="utf-8">` +
    `<meta name="robots" content="noindex,nofollow">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(description)}">` +
    `<meta property="og:type" content="article">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(description)}">` +
    `<meta property="og:url" content="${esc(pageUrl)}">` +
    (b.sourceText ? `<meta property="og:site_name" content="${esc(b.sourceText)}">` : '') +
    (image ? `<meta property="og:image" content="${esc(image)}">` : '') +
    (image ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">` : '') +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${esc(title)}">` +
    `<meta name="twitter:description" content="${esc(description)}">` +
    (image ? `<meta name="twitter:image" content="${esc(image)}">` : '') +
    `</head><body><h1>${esc(title)}</h1><p>${esc(description)}</p>` +
    `<p><a href="${esc(pageUrl)}">Xem báo cáo</a></p></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
