// Helper dựng thẻ OG cho trang chia sẻ báo cáo (dùng chung: /api/og/share và link rút gọn /api/link).
// Trả về title/description/image (có thể override) + hàm dựng HTML OG tối giản cho bot MXH.
import type { SocialPlatform, SocialReportRecord } from './types';
import type { Branding } from '../store/branding';

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
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
  taobao: 'Taobao',
  taobaoshop: 'Taobao',
  overall: 'mạng xã hội',
  ecom: 'sàn thương mại điện tử',
};

export function escHtml(s: string): string {
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

export interface OgOverrides {
  title?: string;
  description?: string;
  image?: string;
}

// Tính title/description/image cuối cùng: override (nếu có) > dữ liệu báo cáo/branding.
export function resolveOgFields(
  report: SocialReportRecord,
  branding: Branding,
  ov?: OgOverrides,
): { title: string; description: string; image: string } {
  const platform = PLATFORM_LABEL[report.platform] ?? 'nền tảng';
  return {
    title: ov?.title?.trim() || `Báo cáo ${report.title} trên ${platform}`,
    description: ov?.description?.trim() || reportDescription(report),
    image: ov?.image?.trim() || reportImage(report, branding.ogImage || branding.logoDuongBan),
  };
}

// HTML OG tối giản (~2KB) cho bot MXH: thẻ nằm ngay đầu <head> → bot chắc chắn parse được.
export function buildShareOgHtml(opts: {
  locale: string;
  title: string;
  description: string;
  image: string;
  pageUrl: string;
  siteName?: string;
}): string {
  const { locale, title, description, image, pageUrl, siteName } = opts;
  return (
    `<!doctype html><html lang="${escHtml(locale || 'vi')}"><head><meta charset="utf-8">` +
    `<meta name="robots" content="noindex,nofollow">` +
    `<title>${escHtml(title)}</title>` +
    `<meta name="description" content="${escHtml(description)}">` +
    `<meta property="og:type" content="article">` +
    `<meta property="og:title" content="${escHtml(title)}">` +
    `<meta property="og:description" content="${escHtml(description)}">` +
    `<meta property="og:url" content="${escHtml(pageUrl)}">` +
    (siteName ? `<meta property="og:site_name" content="${escHtml(siteName)}">` : '') +
    (image ? `<meta property="og:image" content="${escHtml(image)}">` : '') +
    (image ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">` : '') +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${escHtml(title)}">` +
    `<meta name="twitter:description" content="${escHtml(description)}">` +
    (image ? `<meta name="twitter:image" content="${escHtml(image)}">` : '') +
    `</head><body><h1>${escHtml(title)}</h1><p>${escHtml(description)}</p>` +
    `<p><a href="${escHtml(pageUrl)}">Xem báo cáo</a></p></body></html>`
  );
}

// slug dạng blog: bao-cao-<ten-khong-dau>-... (không kèm timestamp — caller tự thêm phần duy nhất).
export function slugifyTitle(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}
