// Lõi ĐĂNG bài lên CMS - dùng chung cho: route /api/publish (đăng ngay) và worker chạy
// job lịch đăng (/api/jobs/run). Tách khỏi route để 2 đường đi cùng một logic.
// Bao gồm: thay {{website}} (utm), upload ảnh bìa + ảnh trong bài, chèn JSON-LD,
// snapshot Revision trước khi update, rồi create/update. Server-only.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildHreflang } from '../cms';
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

async function uploadOneLocal(
  adapter: CmsAdapter,
  url: string,
): Promise<{ id: string; url: string } | null> {
  const m = url.match(/\/generated\/[A-Za-z0-9_.-]+/);
  if (!m) return null;
  try {
    const data = await fs.readFile(path.join(process.cwd(), 'public', m[0]));
    return await adapter.uploadMedia({ data, filename: path.basename(m[0]) });
  } catch {
    return null;
  }
}

async function uploadLocalImages(
  adapter: CmsAdapter,
  html: string,
): Promise<{ html: string; failed: number }> {
  const urls = Array.from(
    new Set([...html.matchAll(/\/generated\/[A-Za-z0-9_.-]+/g)].map((m) => m[0])),
  );
  let out = html;
  let failed = 0;
  for (const u of urls) {
    try {
      const data = await fs.readFile(path.join(process.cwd(), 'public', u));
      const media = await adapter.uploadMedia({ data, filename: path.basename(u) });
      out = out.split(u).join(media.url);
    } catch {
      failed++;
    }
  }
  return { html: out, failed };
}

// Đăng/ cập nhật 1 bài lên CMS. Ném PublishError nếu kết nối lỗi / CMS lỗi.
export async function runPublish(input: RunPublishInput): Promise<RunPublishResult> {
  const { connectionId, article } = input;
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
  const contentWithSite = article.contentHtml.split('{{website}}').join(utmSite);

  let imagesNotUploaded = 0;
  const isLocalGen = (u: string) => /\/generated\/[A-Za-z0-9_.-]+/.test(u);

  // Ảnh bìa.
  let featuredMediaId: string | undefined;
  let coverInline = '';
  if (article.coverImageUrl) {
    const up = await uploadOneLocal(loaded.adapter, article.coverImageUrl);
    if (up) {
      if (loaded.record.provider === 'wordpress') featuredMediaId = up.id;
      else coverInline = `<img src="${up.url}" alt="${article.title.replace(/"/g, '&quot;')}" />\n`;
    } else if (/^https?:\/\//.test(article.coverImageUrl)) {
      coverInline = `<img src="${article.coverImageUrl}" alt="${article.title.replace(/"/g, '&quot;')}" />\n`;
    } else if (isLocalGen(article.coverImageUrl)) {
      imagesNotUploaded++;
    }
  }

  // Ảnh trong bài.
  const uploaded = await uploadLocalImages(
    loaded.adapter,
    coverInline + contentWithSite + (hreflang ? `\n<!-- hreflang -->\n${hreflang}` : ''),
  );
  let finalHtml = uploaded.html;
  imagesNotUploaded += uploaded.failed;

  // JSON-LD structured data.
  const cfg = await getArticleConfig();
  if (cfg.jsonLd.enabled) {
    const now = new Date().toISOString();
    const imageUrl =
      article.coverImageUrl && /^https?:\/\//i.test(article.coverImageUrl)
        ? article.coverImageUrl
        : undefined;
    const nodes = buildJsonLd({
      title: article.title,
      description: article.metaDescription,
      locale: loaded.record.locale,
      datePublished: now,
      dateModified: now,
      imageUrl,
      authorName: cfg.jsonLd.authorName,
      organizationName: cfg.jsonLd.organizationName,
      logoUrl: cfg.jsonLd.logoUrl,
      faq: extractFaqFromHtml(uploaded.html),
      howToSteps: extractHowToSteps(uploaded.html, article.title),
    });
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
  };

  // Snapshot Revision trước khi update (CLAUDE.md §5).
  if (article.cmsPostId) {
    try {
      const before = await loaded.adapter.getPost(article.cmsPostId);
      await saveRevision({
        connectionId,
        cmsPostId: article.cmsPostId,
        title: before.title,
        contentHtml: before.contentHtml,
        metaDescription: before.metaDescription ?? before.excerpt,
        snapshotOk: true,
        reason: 'pre-update',
      });
    } catch (e) {
      console.error('[publish] không tải được bản cũ để snapshot Revision:', e);
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
