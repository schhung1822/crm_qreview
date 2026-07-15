// Chấm SEO/AEO/GEO cho MỘT landing page tải lên (file HTML gồm cả CSS/JS inline).
// Thuần TĨNH: phân tích đúng HTML nguồn — thứ bot AI (GPTBot, Googlebot…) thực sự đọc khi
// KHÔNG chạy JS. Không fetch mạng. Rubric RIÊNG cho landing (khác bài blog: không ép ≥900 từ,
// không ép mục FAQ dài) — tập trung vào value proposition rõ, CTA, meta/social, structured data.
import { parseHtml } from '../audit/html';
import { computeScore, type ScoreCheck } from '../scoring/types';
import { generateLandingPatches, type LandingPatch } from './fix';

export type CheckState = 'pass' | 'warn' | 'fail' | 'info';
export type LandingGroup = 'seo' | 'aeo' | 'geo';

export interface LandingCheck {
  id: string; // khóa i18n nhãn: landingAudit.c.<id> / fix.<id>
  group: LandingGroup;
  state: CheckState;
  value?: string; // dữ liệu động (không dịch): số, danh sách…
}

export interface LandingReport {
  fetchedAt: string; // ISO
  fileName?: string;
  htmlBytes: number;
  checks: LandingCheck[];
  scores: { seo: number; aeo: number; geo: number };
  fixes: LandingPatch[];
  title?: string;
  metaDescription?: string;
}

// Trọng số quy đổi state→điểm (pass=1, warn=0.5, fail=0). 'info' KHÔNG tính điểm (bỏ khỏi phép chia).
const WEIGHT: Record<string, number> = {
  // SEO
  lp_title: 9,
  lp_meta: 8,
  lp_h1: 9,
  lp_heading_order: 5,
  lp_viewport: 7,
  lp_lang: 4,
  lp_canonical: 5,
  lp_charset: 4,
  lp_favicon: 3,
  lp_img_alt: 6,
  lp_img_opt: 4,
  lp_semantic: 4,
  lp_noindex: 10,
  lp_mixed: 6,
  // AEO
  lp_og: 7,
  lp_twitter: 4,
  lp_cta: 9,
  lp_contact: 5,
  lp_breadcrumb: 3,
  lp_schema_rich: 5,
  lp_review: 4,
  lp_video: 3,
  lp_lists: 4,
  // GEO
  lp_norender: 9,
  lp_depth: 5,
  lp_jsonld: 7,
  lp_jsonld_valid: 5,
  lp_entity: 7,
  lp_author: 6,
  lp_freshness: 5,
  lp_faq: 4,
  lp_citations: 4,
  lp_facts: 5,
};

// Điểm 1 nhóm = quy đổi theo trọng số các check của nhóm (info bị loại khỏi phép tính).
function pillarScore(checks: LandingCheck[], group: LandingGroup): number {
  const scored: ScoreCheck[] = checks
    .filter((c) => c.group === group && c.state !== 'info')
    .map((c) => ({ id: c.id, label: c.id, weight: WEIGHT[c.id] ?? 5, state: c.state as ScoreCheck['state'] }));
  return computeScore(scored).score;
}

// Đếm token số (kể cả %, 1.000, 12,5) trong text hiển thị → tín hiệu "có dữ kiện cụ thể".
function countNumbers(text: string): number {
  return (text.match(/\b\d[\d.,]*%?\b/g) ?? []).length;
}

// Có nút kêu gọi hành động rõ ràng? <button>, input submit/button, <a> có class/id btn|button|cta,
// hoặc role="button". Landing tốt luôn có CTA.
function hasCta(html: string): boolean {
  if (/<button[\s>]/i.test(html)) return true;
  if (/<input\b[^>]*\btype\s*=\s*["'](?:submit|button)["']/i.test(html)) return true;
  if (/<a\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:btn|button|cta|call-to-action)/i.test(html)) return true;
  if (/\brole\s*=\s*["']button["']/i.test(html)) return true;
  return false;
}

// Có thông tin liên hệ (email/điện thoại)?
function hasContact(html: string): boolean {
  return /href\s*=\s*["'](?:mailto:|tel:)/i.test(html);
}

// Có favicon khai báo?
function hasFavicon(html: string): boolean {
  return /<link\b[^>]*\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html);
}

// Tài nguyên nạp qua http:// trần trên trang (mixed content khi trang chạy https). Bỏ qua các
// namespace/vocab không phải tài nguyên tải về (w3.org, schema.org, purl.org, xmlns…).
function mixedContent(html: string): string[] {
  const hits: string[] = [];
  // src/srcset/action = tài nguyên ĐƯỢC TẢI (img, script, iframe, source, video, form) → mixed content.
  for (const m of html.matchAll(/\b(?:src|srcset|action)\s*=\s*["']http:\/\/([^"'\s]+)/gi)) hits.push(m[1]);
  // href http:// CHỈ tính trên <link> (stylesheet/preload…). KHÔNG tính <a href> — đó là link
  // ĐIỀU HƯỚNG ra ngoài, không phải subresource → không phải mixed content.
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']http:\/\/([^"'\s]+)/gi)) hits.push(m[1]);
  const out = hits.filter((h) => !/^(?:www\.)?(?:w3\.org|schema\.org|purl\.org|ogp\.me|json-ld\.org)/i.test(h));
  return Array.from(new Set(out));
}

// Có khai báo bảng mã ký tự? (<meta charset> hoặc http-equiv=content-type kèm charset)
function hasCharset(html: string): boolean {
  return /<meta\b[^>]*\bcharset\s*=/i.test(html) || /<meta\b[^>]*http-equiv\s*=\s*["']content-type["'][^>]*charset/i.test(html);
}

// Bị đặt noindex? (meta robots hoặc googlebot chứa "noindex" → trang bị loại khỏi cả Google lẫn AI)
function isNoindex(robotsMeta?: string): boolean {
  return /\bnoindex\b/i.test(robotsMeta ?? '');
}

// Cấu trúc heading hợp lý: có ≥1 H2 (phân mục) VÀ không nhảy cấp khi đi sâu (vd H1→H3).
function headingOrderOk(html: string): boolean {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  if (!levels.length || !levels.includes(2)) return false;
  let prev = 0;
  for (const l of levels) {
    if (prev && l > prev + 1) return false; // nhảy cấp sâu hơn 1 bậc
    prev = l;
  }
  return true;
}

// Landmark ngữ nghĩa: nên có <main> (mốc nội dung chính) + ít nhất 1 <header>/<footer>/<nav>.
function semanticState(html: string): CheckState {
  const hasMain = /<main[\s>]/i.test(html);
  const hasOther = /<(?:header|footer|nav)[\s>]/i.test(html);
  return hasMain && hasOther ? 'pass' : hasMain || hasOther ? 'warn' : 'fail';
}

// Ảnh tối ưu chưa? kích thước (width+height chống CLS) + lazy-load + định dạng hiện đại (webp/avif).
function imageOptState(html: string, imgTotal: number): { state: CheckState; value?: string } {
  if (imgTotal === 0) return { state: 'info' };
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const withDims = imgs.filter((i) => /\bwidth\s*=/i.test(i) && /\bheight\s*=/i.test(i)).length;
  const anyLazy = imgs.some((i) => /\bloading\s*=\s*["']lazy["']/i.test(i));
  const anyModern =
    /<img\b[^>]*\bsrc(?:set)?\s*=\s*["'][^"']*\.(?:webp|avif)/i.test(html) ||
    /<source\b[^>]*\btype\s*=\s*["']image\/(?:webp|avif)["']/i.test(html) ||
    /<picture[\s>]/i.test(html);
  const dimsOk = withDims / imgs.length >= 0.8;
  const good = dimsOk && (anyModern || anyLazy || imgs.length <= 1);
  return { state: good ? 'pass' : 'warn', value: `${Math.round((withDims / imgs.length) * 100)}%` };
}

// Có danh sách hoặc bảng — định dạng dễ trích cho featured snippet & engine AI.
function hasListOrTable(html: string): boolean {
  return /<(?:ul|ol|table)\b/i.test(html);
}

// Trang có video (thẻ <video> hoặc nhúng YouTube/Vimeo)?
function hasVideo(html: string): boolean {
  return /<video[\s>]|youtube\.com\/embed|youtube-nocookie\.com|player\.vimeo\.com|<iframe\b[^>]*(?:youtube|vimeo)/i.test(html);
}

// Đọc mọi khối JSON-LD: đếm số khối, số khối LỖI cú pháp, và gộp text (thường hóa) để dò @type
// lồng nhau (Offer/AggregateRating/Review… thường nằm bên trong Product).
function readJsonLd(html: string): { count: number; invalid: number; blob: string } {
  // Bỏ qua khối RỖNG (template CMS hay chèn <script ld+json></script> trống) — không tính là
  // "có schema" cũng không coi là lỗi cú pháp.
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  let invalid = 0;
  for (const b of blocks) {
    try {
      JSON.parse(b);
    } catch {
      invalid++;
    }
  }
  return { count: blocks.length, invalid, blob: blocks.join(' ').toLowerCase() };
}

export function auditLanding(input: { html: string; fileName?: string; baseUrl?: string }): LandingReport {
  const html = input.html;
  // baseUrl giả để parseHtml phân giải link tương đối (không dùng cho chấm điểm hạ tầng).
  const sig = parseHtml(html, 'https://landing.local/');
  const checks: LandingCheck[] = [];
  const add = (id: string, group: LandingGroup, state: CheckState, value?: string) =>
    checks.push({ id, group, state, value });

  const ld = readJsonLd(html);

  // ── SEO / kỹ thuật on-page ──
  const title = (sig.title ?? '').trim();
  add('lp_title', 'seo', !title ? 'fail' : title.length > 60 || title.length < 10 ? 'warn' : 'pass', title ? `${title.length}` : undefined);

  const meta = (sig.metaDescription ?? '').trim();
  add('lp_meta', 'seo', !meta ? 'fail' : meta.length > 160 || meta.length < 80 ? 'warn' : 'pass', meta ? `${meta.length}` : undefined);

  add('lp_h1', 'seo', sig.h1Count === 1 ? 'pass' : sig.h1Count === 0 ? 'fail' : 'warn', `${sig.h1Count}`);
  add('lp_heading_order', 'seo', headingOrderOk(html) ? 'pass' : 'warn');
  add('lp_viewport', 'seo', sig.viewport ? 'pass' : 'fail');
  add('lp_lang', 'seo', sig.lang ? 'pass' : 'warn', sig.lang);
  add('lp_canonical', 'seo', sig.canonical ? 'pass' : 'warn');
  add('lp_charset', 'seo', hasCharset(html) ? 'pass' : 'fail');
  add('lp_favicon', 'seo', hasFavicon(html) ? 'pass' : 'warn');

  if (sig.imgTotal === 0) add('lp_img_alt', 'seo', 'info', '0');
  else {
    const ratio = sig.imgWithAlt / sig.imgTotal;
    add('lp_img_alt', 'seo', ratio >= 0.9 ? 'pass' : ratio >= 0.6 ? 'warn' : 'fail', `${Math.round(ratio * 100)}%`);
  }
  const imgOpt = imageOptState(html, sig.imgTotal);
  add('lp_img_opt', 'seo', imgOpt.state, imgOpt.value);

  add('lp_semantic', 'seo', semanticState(html));
  // noindex là lỗi NGHIÊM TRỌNG: trang bị ẩn khỏi cả Google lẫn engine AI.
  add('lp_noindex', 'seo', isNoindex(sig.robotsMeta) ? 'fail' : 'pass', isNoindex(sig.robotsMeta) ? sig.robotsMeta : undefined);

  const mixed = mixedContent(html);
  add('lp_mixed', 'seo', mixed.length === 0 ? 'pass' : 'fail', mixed.length ? `${mixed.length}` : undefined);

  // ── AEO / trải nghiệm & chia sẻ ──
  add('lp_og', 'aeo', sig.ogTitle && sig.ogDescription && sig.ogImage ? 'pass' : sig.ogTitle ? 'warn' : 'fail');
  add('lp_twitter', 'aeo', sig.twitterCard ? 'pass' : 'warn');
  add('lp_cta', 'aeo', hasCta(html) ? 'pass' : 'warn');
  add('lp_contact', 'aeo', hasContact(html) ? 'pass' : 'warn');
  add('lp_breadcrumb', 'aeo', sig.hasBreadcrumb || ld.blob.includes('breadcrumblist') ? 'pass' : 'warn');
  // Schema thương mại: Product/Service/Offer — cho rich result + AI hiểu chào hàng.
  const hasRich = /"@type"\s*:\s*"?(?:product|service|offer)/i.test(ld.blob) || ld.blob.includes('"offers"');
  add('lp_schema_rich', 'aeo', hasRich ? 'pass' : 'warn');
  add('lp_review', 'aeo', ld.blob.includes('aggregaterating') || /"@type"\s*:\s*"?review/i.test(ld.blob) ? 'pass' : 'warn');
  add('lp_video', 'aeo', !hasVideo(html) ? 'info' : ld.blob.includes('videoobject') ? 'pass' : 'warn');
  add('lp_lists', 'aeo', hasListOrTable(html) ? 'pass' : 'warn');

  // ── GEO / để AI đọc & trích dẫn ──
  const textLen = sig.textLength;
  const spaRoot = /<div[^>]+id=["'](?:root|app|__next|__nuxt|q-app)["']/i.test(html);
  const noRender = textLen < 300 && (spaRoot || sig.scriptBytes > textLen * 4);
  // Chỉ xét "đọc được khi không JS" (SPA rỗng → fail). Độ dài nội dung để lp_depth lo — tránh
  // phạt hai lần cùng một tín hiệu độ dài.
  add('lp_norender', 'geo', noRender ? 'fail' : 'pass', `${textLen}`);
  add('lp_depth', 'geo', textLen >= 800 ? 'pass' : 'warn', `${textLen}`);

  add('lp_jsonld', 'geo', sig.jsonLdTypes.length ? 'pass' : 'fail', sig.jsonLdTypes.length ? Array.from(new Set(sig.jsonLdTypes)).slice(0, 6).join(', ') : undefined);
  // JSON-LD có khối nào lỗi cú pháp không (khối hỏng → engine bỏ qua toàn bộ schema).
  add('lp_jsonld_valid', 'geo', ld.count === 0 ? 'info' : ld.invalid > 0 ? 'fail' : 'pass', ld.invalid ? `${ld.invalid}/${ld.count}` : undefined);
  add('lp_entity', 'geo', sig.hasOrganization && sig.hasSameAs ? 'pass' : sig.hasOrganization ? 'warn' : 'fail');
  add('lp_author', 'geo', sig.hasAuthor ? 'pass' : 'warn');
  const hasFreshness = sig.hasDateModified || /"datepublished"/i.test(ld.blob) || /<time\b[^>]*\bdatetime\s*=/i.test(html);
  add('lp_freshness', 'geo', hasFreshness ? 'pass' : 'warn');
  add('lp_faq', 'geo', sig.hasFaq ? 'pass' : 'info');
  add('lp_citations', 'geo', sig.outboundLinks >= 1 ? 'pass' : 'warn', sig.outboundLinks ? `${sig.outboundLinks}` : undefined);

  const nums = countNumbers(sig.markdown.replace(/\s+/g, ' '));
  add('lp_facts', 'geo', nums >= 2 ? 'pass' : 'warn', `${nums}`);

  const scores = {
    seo: pillarScore(checks, 'seo'),
    aeo: pillarScore(checks, 'aeo'),
    geo: pillarScore(checks, 'geo'),
  };

  const failing = new Set(checks.filter((c) => c.state === 'fail' || c.state === 'warn').map((c) => c.id));
  const fixes = generateLandingPatches({ title, metaDescription: meta, lang: sig.lang, failing, baseUrl: input.baseUrl });

  return {
    fetchedAt: new Date().toISOString(),
    fileName: input.fileName,
    htmlBytes: html.length,
    checks,
    scores,
    fixes,
    title: title || undefined,
    metaDescription: meta || undefined,
  };
}
