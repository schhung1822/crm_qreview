// Lõi ĐĂNG bài lên CMS - dùng chung cho: route /api/publish (đăng ngay) và worker chạy
// job lịch đăng (/api/jobs/run). Tách khỏi route để 2 đường đi cùng một logic.
// Bao gồm: thay {{website}} (utm), upload ảnh bìa + ảnh trong bài, chèn JSON-LD,
// snapshot Revision trước khi update, rồi create/update. Server-only.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildHreflang } from '../cms';
import { fillMissingAltHtml } from '../content/alt';
import { dedash } from '../content/dedash';
import { env } from '../env';
import type { CmsAdapter, CmsPost } from '../cms/types';
import {
  buildJsonLd,
  extractFaqFromHtml,
  extractHowToSteps,
  jsonLdScript,
} from '../seo/schema';
import { getArticleConfig } from '../store/article-config';
import { adapterFromConnection, setConnectionStatus } from '../store/connections';
import { saveRevision } from '../store/revisions';

export interface PublishArticle {
  cmsPostId?: string; // có → update; không → create
  title: string;
  slug: string;
  contentHtml: string;
  metaDescription?: string;
  status?: 'draft' | 'publish' | 'scheduled';
  scheduledAt?: string;
  categories?: string[];
  tags?: string[];
  coverImageUrl?: string;
}

export interface RunPublishInput {
  connectionId: string;
  article: PublishArticle;
  alternates?: Array<{ locale: string; url: string }>;
}

export interface RunPublishResult {
  post: CmsPost;
  imagesNotUploaded: number;
}

// Lỗi có mã để route map sang HTTP code phù hợp (404 kết nối, 502 lỗi CMS).
export class PublishError extends Error {
  constructor(
    message: string,
    readonly code: 'connection_not_found' | 'cms_error',
  ) {
    super(message);
  }
}

// Đưa 1 ảnh app tự sinh (/generated/...) LÊN CMS qua uploadMedia (Shopify Files / Wix Media /
// WordPress). Thất bại (chưa đủ quyền, API lỗi...) → FALLBACK URL công khai {APP_URL}/generated/... .
// Ảnh đã là http(s) → giữ nguyên. Không cách nào công khai được → null (đếm là chưa lên).
async function resolveLocalImage(
  adapter: CmsAdapter,
  url: string,
  appBase?: string,
): Promise<{ id?: string; url: string } | null> {
  if (/^https?:\/\//i.test(url)) return { url };
  const m = url.match(/\/generated\/[A-Za-z0-9_.-]+/);
  if (!m) return null;
  try {
    const data = await fs.readFile(path.join(process.cwd(), 'public', m[0]));
    return await adapter.uploadMedia({ data, filename: path.basename(m[0]) });
  } catch {
    return appBase ? { url: appBase + m[0] } : null;
  }
}

// Thay MỌI ảnh local trong HTML bằng URL đã resolve (upload CMS hoặc fallback APP_URL).
async function resolveInlineImages(
  adapter: CmsAdapter,
  html: string,
  appBase?: string,
): Promise<{ html: string; failed: number }> {
  const urls = Array.from(
    new Set([...html.matchAll(/\/generated\/[A-Za-z0-9_.-]+/g)].map((m) => m[0])),
  );
  let out = html;
  let failed = 0;
  for (const u of urls) {
    const r = await resolveLocalImage(adapter, u, appBase);
    if (r) out = out.split(u).join(r.url);
    else failed++;
  }
  return { html: out, failed };
}

// APP_URL có phải host công khai (CMS ngoài tải được)? localhost/IP nội bộ → không.
function isPublicBase(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return false;
    if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

// Đăng/ cập nhật 1 bài lên CMS. Ném PublishError nếu kết nối lỗi / CMS lỗi.
export async function runPublish(input: RunPublishInput): Promise<RunPublishResult> {
  const { connectionId } = input;
  // Guard cuối cùng: đổi mọi gạch dài "—/–" → "-" trên nội dung đăng lên (kể cả bài dán/import/
  // sửa tay không qua bước sinh AI). Xử lý dứt điểm, không để lọt lên CMS.
  const article: PublishArticle = {
    ...input.article,
    title: dedash(input.article.title),
    contentHtml: dedash(input.article.contentHtml),
    metaDescription: input.article.metaDescription ? dedash(input.article.metaDescription) : input.article.metaDescription,
    tags: input.article.tags?.map(dedash),
  };
  const alternates = input.alternates ?? [];
  const hreflang = buildHreflang(alternates);

  const loaded = await adapterFromConnection(connectionId);
  if (!loaded) throw new PublishError('Không tìm thấy kết nối', 'connection_not_found');

  // {{website}} → dạng utm_source theo domain site đích.
  const siteHost = (() => {
    try {
      return new URL(loaded.record.baseUrl).host;
    } catch {
      return loaded.record.baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }
  })();
  const utmSite = siteHost
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  // Chốt chặn trợ năng/SEO: đảm bảo mọi <img> trong bài có alt trước khi đẩy lên CMS
  // (bù cho trường hợp bài đăng thẳng không qua nút "Tự điền alt" trong trình soạn).
  const { html: contentWithAlt } = fillMissingAltHtml(article.contentHtml, { title: article.title });
  const contentWithSite = contentWithAlt.split('{{website}}').join(utmSite);

  let imagesNotUploaded = 0;
  const esc = (s: string) => s.replace(/"/g, '&quot;');
  const appBase = env.appUrl && isPublicBase(env.appUrl) ? env.appUrl : undefined;

  // Ảnh bìa: ưu tiên UPLOAD lên CMS; thất bại → URL công khai APP_URL.
  let featuredMediaId: string | undefined;
  let coverInline = '';
  let coverPublicUrl: string | undefined;
  if (article.coverImageUrl) {
    const r = await resolveLocalImage(loaded.adapter, article.coverImageUrl, appBase);
    if (r) {
      coverPublicUrl = r.url;
      // WordPress dùng featured media (id); CMS khác chèn ảnh vào đầu bài.
      if (loaded.record.provider === 'wordpress' && r.id) featuredMediaId = r.id;
      else coverInline = `<img src="${esc(r.url)}" alt="${esc(article.title)}" />\n`;
    } else imagesNotUploaded++;
  }

  // Ảnh trong bài.
  const combinedHtml =
    coverInline + contentWithSite + (hreflang ? `\n<!-- hreflang -->\n${hreflang}` : '');
  const uploaded = await resolveInlineImages(loaded.adapter, combinedHtml, appBase);
  let finalHtml = uploaded.html;
  imagesNotUploaded += uploaded.failed;

  // UPDATE: tải bản cũ MỘT LẦN — dùng cho cả ngày xuất bản gốc (JSON-LD) lẫn snapshot Revision.
  let beforePost: CmsPost | null = null;
  if (article.cmsPostId) {
    try {
      beforePost = await loaded.adapter.getPost(article.cmsPostId);
    } catch (e) {
      console.error('[publish] không tải được bản cũ (dùng cho datePublished + Revision):', e);
    }
  }

  // JSON-LD structured data.
  const cfg = await getArticleConfig();
  let jsonLdRaw: string | undefined;
  if (cfg.jsonLd.enabled) {
    const now = new Date().toISOString();
    const imageUrl = coverPublicUrl;
    const nodes = buildJsonLd({
      title: article.title,
      description: article.metaDescription,
      locale: loaded.record.locale,
      // Update: GIỮ ngày xuất bản gốc (tránh ghi đè = hôm nay). Bài mới: dùng thời điểm hiện tại.
      datePublished: beforePost?.date || now,
      dateModified: now,
      imageUrl,
      authorName: cfg.jsonLd.authorName,
      organizationName: cfg.jsonLd.organizationName,
      logoUrl: cfg.jsonLd.logoUrl,
      faq: extractFaqFromHtml(uploaded.html),
      howToSteps: extractHowToSteps(uploaded.html, article.title),
    });
    jsonLdRaw = JSON.stringify(nodes); // để provider strip <script> (Wix) gắn qua seoData
    finalHtml += jsonLdScript(nodes);
  }

  // Tag: WordPress cần ID (chuyển tên → id qua ensureTags). Shopify/Wix nhận thẳng TÊN.
  let tags: string[] | undefined;
  if (article.tags?.length) {
    if (loaded.adapter.ensureTags) {
      try {
        tags = await loaded.adapter.ensureTags(article.tags);
      } catch {
        tags = undefined; // WP lỗi tạo tag → KHÔNG gửi tên (sẽ thành rỗng & xóa tag)
      }
    } else {
      tags = article.tags; // Shopify/Wix nhận thẳng tên
    }
  }

  const cmsInput = {
    title: article.title,
    slug: article.slug,
    contentHtml: finalHtml,
    featuredMediaId,
    metaDescription: article.metaDescription,
    status: article.status,
    scheduledAt: article.scheduledAt,
    categories: article.categories,
    tags,
    alternates,
    jsonLd: jsonLdRaw, // provider strip <script> khỏi content (Wix) gắn qua seoData; WP/Shopify bỏ qua
  };

  // Snapshot Revision trước khi update (CLAUDE.md §5) — dùng lại bản cũ đã tải ở trên.
  if (article.cmsPostId) {
    if (beforePost) {
      await saveRevision({
        connectionId,
        cmsPostId: article.cmsPostId,
        title: beforePost.title,
        contentHtml: beforePost.contentHtml,
        metaDescription: beforePost.metaDescription ?? beforePost.excerpt,
        // Provider không đọc lại được nội dung cũ (vd Wix trả '') → snapshot KHÔNG đủ để rollback.
        snapshotOk: !!beforePost.contentHtml,
        reason: beforePost.contentHtml ? 'pre-update' : 'pre-update (không đọc được nội dung cũ)',
      });
    } else {
      await saveRevision({
        connectionId,
        cmsPostId: article.cmsPostId,
        title: article.title,
        contentHtml: '',
        snapshotOk: false,
        reason: 'pre-update (không tải được bản cũ)',
      });
    }
  }

  try {
    const post = article.cmsPostId
      ? await loaded.adapter.updatePost(article.cmsPostId, cmsInput)
      : await loaded.adapter.createPost(cmsInput);
    await setConnectionStatus(connectionId, 'active');
    return { post, imagesNotUploaded };
  } catch (err) {
    await setConnectionStatus(connectionId, 'error');
    throw new PublishError(err instanceof Error ? err.message : 'Lỗi khi đăng', 'cms_error');
  }
}
