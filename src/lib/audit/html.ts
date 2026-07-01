// Trích tín hiệu từ HTML 1 trang để chấm + kiểm SEO/AEO/GEO ở cấp site.
import { htmlToMarkdown } from '../content/markdown';

export interface PageSignals {
  title?: string;
  metaDescription?: string;
  canonical?: string;
  robotsMeta?: string;
  lang?: string;
  viewport: boolean;
  h1Count: number;
  headingCount: number;
  ogTitle: boolean;
  ogDescription: boolean;
  ogImage: boolean;
  twitterCard: boolean;
  hreflang: string[];
  jsonLdTypes: string[];
  hasOrganization: boolean;
  hasSameAs: boolean;
  hasAuthor: boolean;
  hasFaq: boolean;
  hasHowTo: boolean;
  hasBreadcrumb: boolean;
  hasDateModified: boolean;
  imgTotal: number;
  imgWithAlt: number;
  internalLinks: number;
  outboundLinks: number;
  textLength: number; // độ dài text hiển thị (cho SPA detection)
  scriptBytes: number; // tổng độ dài <script> (cho SPA detection)
  markdown: string; // body → markdown để chấm điểm
  links: string[]; // href tuyệt đối cùng host (để crawl/kiểm link)
}

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : undefined;
};

function metaContent(html: string, key: string, kind: 'name' | 'property'): string | undefined {
  const re = new RegExp(`<meta[^>]+${kind}=["']${key}["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? attr(m[0], 'content') : undefined;
}

// Gom @type từ mọi khối JSON-LD (cả @graph).
function collectJsonLd(html: string): { types: string[]; blob: string } {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1],
  );
  const types: string[] = [];
  let blob = '';
  for (const b of blocks) {
    blob += ' ' + b;
    try {
      const json = JSON.parse(b.trim());
      const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
      for (const n of nodes) {
        const tt = n && n['@type'];
        if (Array.isArray(tt)) types.push(...tt.map(String));
        else if (tt) types.push(String(tt));
      }
    } catch {
      /* JSON-LD lỗi cú pháp → vẫn dùng blob để dò chuỗi */
    }
  }
  return { types, blob };
}

export function parseHtml(html: string, baseUrl: string): PageSignals {
  const head = html.slice(0, Math.min(html.length, 200_000));
  const htmlTag = html.match(/<html[^>]*>/i)?.[0] ?? '';
  const titleM = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalM = head.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  const robotsM = head.match(/<meta[^>]+name=["']robots["'][^>]*>/i);

  const hreflang = [...head.matchAll(/<link[^>]+rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*>/gi)].map(
    (m) => m[1],
  );
  const { types: jsonLdTypes, blob } = collectJsonLd(html);
  const ldLower = (blob + ' ' + html.slice(0, 50_000)).toLowerCase();

  // Ảnh + alt.
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgWithAlt = imgs.filter((i) => /\balt\s*=\s*["'][^"']+["']/i.test(i)).length;

  // Link nội bộ / ngoài.
  let base: URL | null = null;
  try {
    base = new URL(baseUrl);
  } catch {
    /* ignore */
  }
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  let internalLinks = 0;
  let outboundLinks = 0;
  const links: string[] = [];
  for (const h of hrefs) {
    if (/^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
    try {
      const u = new URL(h, base ?? undefined);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      if (base && u.host === base.host) {
        internalLinks++;
        links.push(u.toString());
      } else {
        outboundLinks++;
      }
    } catch {
      /* href lỗi */
    }
  }

  const scriptBytes = [...html.matchAll(/<script\b[\s\S]*?<\/script>/gi)].reduce((s, m) => s + m[0].length, 0);
  const markdown = htmlToMarkdown(html);

  return {
    title: titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : undefined,
    metaDescription: metaContent(head, 'description', 'name'),
    canonical: canonicalM ? attr(canonicalM[0], 'href') : undefined,
    robotsMeta: robotsM ? attr(robotsM[0], 'content') : undefined,
    lang: attr(htmlTag, 'lang'),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(head),
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    headingCount: (html.match(/<h[1-3]\b/gi) ?? []).length,
    ogTitle: !!metaContent(head, 'og:title', 'property'),
    ogDescription: !!metaContent(head, 'og:description', 'property'),
    ogImage: !!metaContent(head, 'og:image', 'property'),
    twitterCard: /<meta[^>]+name=["']twitter:card["']/i.test(head),
    hreflang,
    jsonLdTypes,
    hasOrganization: /"@type"\s*:\s*"?(organization|newsmediaorganization|localbusiness)/i.test(blob),
    hasSameAs: /"sameas"/i.test(blob),
    hasAuthor: /"author"/i.test(blob) || /"@type"\s*:\s*"?person/i.test(blob),
    hasFaq: /faqpage|qapage/i.test(ldLower),
    hasHowTo: /"@type"\s*:\s*"?howto/i.test(blob),
    hasBreadcrumb: /breadcrumblist/i.test(ldLower),
    hasDateModified: /"datemodified"/i.test(blob),
    imgTotal: imgs.length,
    imgWithAlt,
    internalLinks,
    outboundLinks,
    textLength: markdown.replace(/\s+/g, ' ').trim().length,
    scriptBytes,
    markdown,
    links: Array.from(new Set(links)),
  };
}
