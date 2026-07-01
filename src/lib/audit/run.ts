// Orchestrator audit website: tải trang chủ + robots + sitemap, lấy mẫu N trang, chấm
// SEO/AEO/GEO, kiểm bot AI + render-không-JS + kỹ thuật + on-page + (tùy chọn) CWV.
import { scoreAeo } from '../aeo/score';
import { describeArticles } from '../ai/content';
import { aiReady, type AiOverride } from '../ai/providers';
import { extractKeywordHeuristic } from '../content/keyword-extract';
import { htmlToMarkdown } from '../content/markdown';
import { scoreGeo } from '../geo/score';
import { safeFetch } from '../security/safe-fetch';
import { buildScoreInput } from '../scoring/types';
import { scoreSeo } from '../seo/score';
import { adapterFromConnection, listConnections } from '../store/connections';
import { getIntegrationKey } from '../store/integrations';
import { generatePatches } from './fix';
import { parseHtml, type PageSignals } from './html';
import { pageSpeed, type PageSpeedResult } from './pagespeed';
import { AI_BOTS, aiBotStatus, isAllowed, parseRobots, type ParsedRobots } from './robots';
import type { AuditCheck, AuditReport, CheckState, SampledPage } from './types';

function hostOf(u: string): string {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

const UA = 'Mozilla/5.0 (compatible; SEO-GEO-Audit/1.0; +https://noti.vn)';
const MAX_HTML = 3_000_000;

interface Fetched {
  status: number;
  finalUrl: string;
  html: string;
  headers: Headers;
}

async function fetchText(url: string): Promise<Fetched | null> {
  try {
    const res = await safeFetch(url, { headers: { 'user-agent': UA } });
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl && cl > MAX_HTML) {
      await res.body?.cancel().catch(() => {});
      return { status: res.status, finalUrl: res.url || url, html: '', headers: res.headers };
    }
    const html = (await res.text()).slice(0, MAX_HTML);
    return { status: res.status, finalUrl: res.url || url, html, headers: res.headers };
  } catch {
    return null;
  }
}

async function statusOf(url: string, method: 'HEAD' | 'GET' = 'HEAD'): Promise<number | null> {
  try {
    const res = await safeFetch(url, { method, headers: { 'user-agent': UA } });
    await res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    return null;
  }
}

// Chạy tuần tự theo lô để lễ độ với server đích.
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

function normalizeInput(raw: string): string {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// Lấy URL từ sitemap (xử lý sitemap index 1 cấp). Trả tối đa `limit` URL.
async function sitemapUrls(sitemapUrl: string, limit: number): Promise<string[]> {
  const f = await fetchText(sitemapUrl);
  if (!f || !f.html) return [];
  const isIndex = /<sitemapindex/i.test(f.html);
  const locs = [...f.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (!isIndex) return locs.slice(0, limit);
  // Sitemap index → lấy vài sitemap con.
  const out: string[] = [];
  for (const sub of locs.slice(0, 5)) {
    const subF = await fetchText(sub);
    if (subF?.html) {
      out.push(...[...subF.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim()));
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

const norm = (s?: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export async function runAudit(input: {
  url: string;
  maxPages?: number;
  performance?: boolean;
  llmsMinScore?: number; // ngưỡng chất lượng đưa bài vào llms.txt (mặc định 55)
  aiProvider?: string; // '' = tự động · 'none' = không dùng AI · tên provider
  aiModel?: string;
}): Promise<AuditReport> {
  const startUrl = normalizeInput(input.url);
  const maxPages = Math.min(Math.max(input.maxPages ?? 12, 1), 25);
  const checks: AuditCheck[] = [];
  const notes: string[] = [];
  let performance: { mobile?: PageSpeedResult; desktop?: PageSpeedResult } | undefined;
  const add = (id: string, group: AuditCheck['group'], state: CheckState, value?: string) =>
    checks.push({ id, group, state, value });

  // 1) Trang chủ.
  const home = await fetchText(startUrl);
  if (!home || !home.html) {
    throw new Error('Không tải được trang. Kiểm tra URL có truy cập công khai không.');
  }
  const finalUrl = home.finalUrl;
  const origin = new URL(finalUrl).origin;
  const host = new URL(finalUrl).host;
  const homeSig = parseHtml(home.html, finalUrl);

  // 2) robots.txt.
  const robotsF = await fetchText(`${origin}/robots.txt`);
  const robots: ParsedRobots = robotsF?.html && robotsF.status < 400 ? parseRobots(robotsF.html) : { groups: [], sitemaps: [], raw: '' };

  // ── GROUP ai: AI đọc & trích dẫn ──
  const bots = aiBotStatus(robots);
  const blocked = bots.filter((b) => !b.allowed);
  const critical = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot', 'Google-Extended', 'OAI-SearchBot'];
  const blockedCritical = blocked.filter((b) => critical.includes(b.id));
  add(
    'ai_bots',
    'ai',
    blockedCritical.length ? 'fail' : blocked.length ? 'warn' : 'pass',
    blocked.length ? `${blocked.length}/${AI_BOTS.length}: ${blocked.map((b) => b.id).join(', ')}` : `${AI_BOTS.length}/${AI_BOTS.length} OK`,
  );

  // Render-không-JS: nội dung phải có trong HTML thô (bot AI thường không chạy JS).
  const spaRoot = /<div[^>]+id=["'](root|app|__next|__nuxt|q-app)["']/i.test(home.html);
  const textRatio = homeSig.textLength / Math.max(1, home.html.length);
  const noRender = homeSig.textLength < 600 && (spaRoot || homeSig.scriptBytes > homeSig.textLength * 4);
  add(
    'ai_norender',
    'ai',
    noRender ? 'fail' : homeSig.textLength < 1500 && textRatio < 0.05 ? 'warn' : 'pass',
    `${homeSig.textLength} ký tự text`,
  );

  add(
    'ai_jsonld',
    'ai',
    homeSig.jsonLdTypes.length ? 'pass' : 'fail',
    homeSig.jsonLdTypes.length ? Array.from(new Set(homeSig.jsonLdTypes)).slice(0, 6).join(', ') : undefined,
  );
  add('ai_entity', 'ai', homeSig.hasOrganization && homeSig.hasSameAs ? 'pass' : homeSig.hasOrganization ? 'warn' : 'fail');
  add('ai_author', 'ai', homeSig.hasAuthor ? 'pass' : 'warn');
  add('ai_freshness', 'ai', homeSig.hasDateModified ? 'pass' : 'warn');

  const llms = await fetchText(`${origin}/llms.txt`);
  add('ai_llms', 'ai', llms && llms.status === 200 && llms.html.trim() ? 'pass' : 'warn');

  const rssInline = /<link[^>]+type=["']application\/(rss|atom)\+xml["']/i.test(home.html);
  let rssOk = rssInline;
  if (!rssOk) {
    const feed = await statusOf(`${origin}/feed`, 'GET');
    rssOk = feed === 200;
  }
  add('ai_rss', 'ai', rssOk ? 'pass' : 'warn');

  // ── GROUP seo: kỹ thuật ──
  add('seo_https', 'seo', finalUrl.startsWith('https://') ? 'pass' : 'fail');

  // http → https redirect.
  if (finalUrl.startsWith('https://')) {
    const httpProbe = await fetchText(`http://${host}`);
    add('seo_http_redirect', 'seo', !httpProbe ? 'warn' : httpProbe.finalUrl.startsWith('https://') ? 'pass' : 'fail');
  } else {
    add('seo_http_redirect', 'seo', 'fail');
  }

  // www / non-www canonical: bản còn lại nên redirect về bản chính.
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const altProbe = await fetchText(`https://${altHost}`);
  add(
    'seo_canonical_host',
    'seo',
    !altProbe ? 'info' : new URL(altProbe.finalUrl).host === host ? 'pass' : 'warn',
  );

  add('seo_robots', 'seo', !robotsF || robotsF.status >= 400 ? 'warn' : isAllowed(robots, 'Googlebot', '/') ? 'pass' : 'fail');

  // sitemap.
  const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
  let sampleUrls: string[] = [];
  let sitemapCount = 0;
  for (const sm of sitemapCandidates.slice(0, 3)) {
    const urls = await sitemapUrls(sm, 200);
    if (urls.length) {
      sitemapCount += urls.length;
      sampleUrls.push(...urls);
    }
  }
  add('seo_sitemap', 'seo', sitemapCount ? 'pass' : 'fail', sitemapCount ? `${sitemapCount}+ URL` : undefined);

  // 404 thật.
  const probe404 = await statusOf(`${origin}/__seo-geo-audit-404-probe__`, 'GET');
  add('seo_404', 'seo', probe404 === 404 ? 'pass' : probe404 === 410 ? 'pass' : 'warn', probe404 ? `HTTP ${probe404}` : undefined);

  // Header bảo mật/SEO.
  const hsts = home.headers.get('strict-transport-security');
  const enc = home.headers.get('content-encoding');
  add('seo_headers', 'seo', hsts && enc ? 'pass' : hsts || enc ? 'warn' : 'fail');

  const xRobots = home.headers.get('x-robots-tag') ?? '';
  const noindex = /noindex/i.test(xRobots) || /noindex/i.test(homeSig.robotsMeta ?? '');
  add('seo_noindex', 'seo', noindex ? 'fail' : 'pass');

  add('seo_canonical', 'seo', homeSig.canonical ? 'pass' : 'warn');
  add('seo_viewport', 'seo', homeSig.viewport ? 'pass' : 'fail');
  add('seo_hreflang', 'seo', homeSig.hreflang.length ? 'pass' : 'info');

  // ── Lấy mẫu trang để chấm điểm + on-page ──
  const seen = new Set<string>([finalUrl]);
  const pickUrls = [finalUrl];
  for (const u of sampleUrls.length ? sampleUrls : homeSig.links) {
    if (pickUrls.length >= maxPages) break;
    try {
      const uu = new URL(u);
      if (uu.host !== host) continue;
      const key = uu.toString().split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      pickUrls.push(key);
    } catch {
      /* ignore */
    }
  }
  if (!sampleUrls.length) notes.push('noSitemapSample');

  const sampled = await pool(pickUrls, 4, async (u) => {
    const f = u === finalUrl ? home : await fetchText(u);
    if (!f || !f.html || f.status >= 400) return null;
    const sig = parseHtml(f.html, f.finalUrl);
    const kw = extractKeywordHeuristic(sig.title ?? '', sig.markdown);
    const si = buildScoreInput({
      title: sig.title ?? '',
      metaDescription: sig.metaDescription,
      slug: new URL(f.finalUrl).pathname,
      markdown: sig.markdown,
      locale: sig.lang?.split('-')[0] || 'en',
      targetKeyword: kw,
    });
    return {
      url: f.finalUrl,
      sig,
      page: { url: f.finalUrl, seo: scoreSeo(si).score, aeo: scoreAeo(si).score, geo: scoreGeo(si).score } as SampledPage,
    };
  });
  const ok = sampled.filter(Boolean) as Array<{ url: string; sig: PageSignals; page: SampledPage }>;

  // AI để PHÂN TÍCH (sinh mô tả cho trang đã chấm điểm + llms.txt). Người dùng chọn ở form.
  const aiLocale = homeSig.lang?.split('-')[0] || 'en';
  const override: AiOverride | undefined =
    input.aiProvider && input.aiProvider !== 'none'
      ? { provider: input.aiProvider as AiOverride['provider'], model: input.aiModel || undefined }
      : undefined;
  const useAi = input.aiProvider !== 'none' && (await aiReady());

  let pageDesc: Record<string, string> = {};
  if (useAi && ok.length) {
    pageDesc = await describeArticles(
      ok.map((x) => ({
        id: x.url,
        title: x.sig.title || x.url,
        context: x.sig.metaDescription || x.sig.markdown.slice(0, 160),
      })),
      aiLocale,
      override,
    );
  }
  const pages = ok.map((x) => ({ ...x.page, desc: pageDesc[x.url] }));
  const avg = (sel: (p: SampledPage) => number) => (pages.length ? Math.round(pages.reduce((s, p) => s + sel(p), 0) / pages.length) : 0);
  const scores = { seo: avg((p) => p.seo), aeo: avg((p) => p.aeo), geo: avg((p) => p.geo) };

  // ── GROUP onpage (tổng hợp mẫu) ──
  const sigs = ok.map((x) => x.sig);
  const withTitle = sigs.filter((s) => s.title && s.title.length > 0);
  add('op_title', 'onpage', withTitle.length === sigs.length ? 'pass' : 'warn', `${withTitle.length}/${sigs.length}`);
  const titleKeys = withTitle.map((s) => norm(s.title));
  const dupTitles = titleKeys.length - new Set(titleKeys).size;
  add('op_title_dup', 'onpage', dupTitles === 0 ? 'pass' : 'warn', dupTitles ? `${dupTitles}` : undefined);
  const withMeta = sigs.filter((s) => (s.metaDescription ?? '').trim().length > 0);
  add('op_meta', 'onpage', withMeta.length === sigs.length ? 'pass' : withMeta.length ? 'warn' : 'fail', `${withMeta.length}/${sigs.length}`);
  const metaKeys = withMeta.map((s) => norm(s.metaDescription));
  const dupMeta = metaKeys.length - new Set(metaKeys).size;
  add('op_meta_dup', 'onpage', dupMeta === 0 ? 'pass' : 'warn', dupMeta ? `${dupMeta}` : undefined);
  const oneH1 = sigs.filter((s) => s.h1Count === 1).length;
  add('op_h1', 'onpage', oneH1 === sigs.length ? 'pass' : 'warn', `${oneH1}/${sigs.length}`);
  const imgTot = sigs.reduce((s, x) => s + x.imgTotal, 0);
  const imgAlt = sigs.reduce((s, x) => s + x.imgWithAlt, 0);
  add('op_images_alt', 'onpage', imgTot === 0 ? 'info' : imgAlt / imgTot >= 0.9 ? 'pass' : imgAlt / imgTot >= 0.6 ? 'warn' : 'fail', imgTot ? `${Math.round((imgAlt / imgTot) * 100)}%` : undefined);

  // Link gãy nội bộ (mẫu từ trang chủ).
  const linkSample = homeSig.links.slice(0, 15);
  const linkStatus = await pool(linkSample, 4, (u) => statusOf(u, 'HEAD'));
  const broken = linkStatus.filter((s) => s !== null && s >= 400).length;
  add('op_broken_links', 'onpage', broken === 0 ? 'pass' : broken <= 2 ? 'warn' : 'fail', broken ? `${broken}/${linkSample.length}` : undefined);

  // ── GROUP aeo ──
  const faqCount = sigs.filter((s) => s.hasFaq).length;
  add('aeo_faq', 'aeo', faqCount ? 'pass' : 'warn', faqCount ? `${faqCount}/${sigs.length}` : undefined);
  add('aeo_howto', 'aeo', sigs.some((s) => s.hasHowTo) ? 'pass' : 'info');
  add('aeo_breadcrumb', 'aeo', sigs.some((s) => s.hasBreadcrumb) ? 'pass' : 'warn');
  add('aeo_og', 'aeo', homeSig.ogTitle && homeSig.ogDescription && homeSig.ogImage ? 'pass' : homeSig.ogTitle ? 'warn' : 'fail');
  add('aeo_twitter', 'aeo', homeSig.twitterCard ? 'pass' : 'warn');

  // ── GROUP perf (tùy chọn) ──
  if (input.performance) {
    // Đo CẢ di động lẫn máy tính (PSI 2 strategy) - lấy đầy đủ điểm + chỉ số + CrUX.
    const [mob, desk] = await Promise.all([
      pageSpeed(finalUrl, 'mobile'),
      pageSpeed(finalUrl, 'desktop'),
    ]);
    if (mob?.scores.performance != null || desk?.scores.performance != null) {
      performance = { mobile: mob ?? undefined, desktop: desk ?? undefined };
      if (!mob?.field?.category && !desk?.field?.category) notes.push('cruxUnavailable');
    } else {
      // Không key → PageSpeed hay bị giới hạn/từ chối → gợi ý thêm key.
      const hasPsiKey = !!(await getIntegrationKey('pagespeed'));
      notes.push(hasPsiKey ? 'psiUnavailable' : 'psiNeedKey');
    }
  }

  const failing = new Set(checks.filter((c) => c.state === 'fail' || c.state === 'warn').map((c) => c.id));

  // Site này có trùng 1 kết nối CMS đã lưu không (→ "Sửa bằng AI" + llms.txt lấy bài thật).
  let connection: AuditReport['connection'];
  try {
    const h = hostOf(finalUrl);
    const conn = (await listConnections()).find((c) => hostOf(c.baseUrl) === h);
    if (conn) connection = { id: conn.id, label: conn.label, provider: conn.provider };
  } catch {
    /* bỏ qua nếu không đọc được kết nối */
  }

  // llms.txt: nếu đã kết nối CMS → QUÉT BÀI THẬT, chấm điểm, lọc bài đạt chất lượng.
  let llmsArticles:
    | Array<{ url: string; title?: string; score: number; desc?: string }>
    | undefined;
  if (connection && failing.has('ai_llms')) {
    try {
      const loaded = await adapterFromConnection(connection.id);
      if (loaded) {
        const posts = (await loaded.adapter.listPosts({ status: 'publish', all: true })).slice(0, 500);
        const arts = posts.map((p) => {
          const md = htmlToMarkdown(p.contentHtml ?? '');
          const si = buildScoreInput({
            title: p.title,
            metaDescription: p.metaDescription,
            slug: p.slug,
            markdown: md,
            locale: loaded.record.locale,
            targetKeyword: extractKeywordHeuristic(p.title, md),
          });
          return {
            url: p.url || `${origin}/${p.slug}`,
            title: p.title,
            excerpt: p.metaDescription || md.slice(0, 160),
            score: Math.round((scoreSeo(si).score + scoreAeo(si).score + scoreGeo(si).score) / 3),
            desc: undefined as string | undefined,
          };
        });
        // AI mô tả các bài điểm cao nhất → llms.txt dạng "- [Tiêu đề](url): mô tả".
        if (useAi) {
          const top = arts
            .filter((a) => a.title)
            .sort((a, b) => b.score - a.score)
            .slice(0, 40);
          const d = await describeArticles(
            top.map((a) => ({ id: a.url, title: a.title as string, context: a.excerpt })),
            loaded.record.locale,
            override,
          );
          for (const a of arts) if (d[a.url]) a.desc = d[a.url];
        }
        llmsArticles = arts.map(({ url, title, score, desc }) => ({ url, title, score, desc }));
      }
    } catch {
      /* lỗi tải bài → dùng trang đã crawl làm fallback */
    }
  }

  // Bản vá copy-paste cho các check fail/warn ở cấp hạ tầng/site.
  const fixes = generatePatches({
    origin,
    host,
    finalUrl,
    title: homeSig.title,
    metaDescription: homeSig.metaDescription,
    samplePages: ok.map((x) => ({
      url: x.url,
      title: x.sig.title,
      score: Math.round((x.page.seo + x.page.aeo + x.page.geo) / 3),
      desc: pageDesc[x.url],
    })),
    llmsArticles,
    llmsMinScore: input.llmsMinScore,
    failing,
  });

  return {
    url: input.url,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    checks,
    scores,
    pages,
    pagesScanned: pages.length,
    notes,
    fixes,
    connection,
    performance,
  };
}
