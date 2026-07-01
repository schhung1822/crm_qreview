// Sinh "bản vá" copy-paste cho các lỗi audit ở cấp hạ tầng/site (app KHÔNG ghi lên site,
// chỉ tạo nội dung đúng chuẩn để người dùng dán vào server/theme). Nội dung là CODE nên
// không dịch; tiêu đề bản vá lấy qua i18n audit.patch.<id>.
import { AI_BOTS } from './robots';

export interface AuditPatch {
  id: string; // khóa i18n: audit.patch.<id>
  lang: string; // nhãn ngôn ngữ code (txt/html/nginx/apache…)
  content: string;
}

const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function generatePatches(ctx: {
  origin: string;
  host: string;
  finalUrl: string;
  title?: string;
  metaDescription?: string;
  samplePages: Array<{ url: string; title?: string; score?: number; desc?: string }>;
  // Bài THẬT từ CMS (đã chấm điểm) - ưu tiên dùng cho llms.txt nếu có.
  llmsArticles?: Array<{ url: string; title?: string; score: number; desc?: string }>;
  llmsMinScore?: number; // ngưỡng điểm tối thiểu để đưa bài vào llms.txt (mặc định 55)
  failing: Set<string>;
}): AuditPatch[] {
  const out: AuditPatch[] = [];
  const title = ctx.title || ctx.host;
  const desc = ctx.metaDescription || '';
  const ogImg = `${ctx.origin}/og-image.jpg`;

  // 1) robots.txt - mở các bot AI (nhóm UA riêng sẽ ghi đè nhóm * cho bot đó).
  if (ctx.failing.has('ai_bots')) {
    const block = AI_BOTS.map((b) => `User-agent: ${b.id}\nAllow: /`).join('\n\n');
    out.push({
      id: 'robots_ai',
      lang: 'robots.txt',
      content: `# Cho phép bot AI đọc & trích dẫn nội dung (thêm vào robots.txt)\n${block}\n\nSitemap: ${ctx.origin}/sitemap.xml\n`,
    });
  }

  // 2) llms.txt - ưu tiên BÀI THẬT từ CMS (đã chấm điểm); lọc bài đạt chất lượng, sắp giảm dần.
  if (ctx.failing.has('ai_llms')) {
    const minScore = ctx.llmsMinScore ?? 55;
    const pool = (ctx.llmsArticles?.length ? ctx.llmsArticles : ctx.samplePages).filter((p) => p.title);
    const good = pool
      .filter((p) => (p.score ?? 0) >= minScore) // chỉ giữ bài đạt ngưỡng
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 50);
    const chosen = good.length ? good : pool.slice(0, 15);
    const pages = chosen
      .map((p) => `- [${p.title}](${p.url})${p.desc ? `: ${p.desc}` : ''}`)
      .join('\n');
    out.push({
      id: 'llms',
      lang: 'llms.txt',
      content: `# ${title}\n${desc ? `> ${desc}\n` : ''}\n## Nội dung nổi bật\n${pages || `- [${title}](${ctx.origin})`}\n`,
    });
  }

  // 3) JSON-LD Organization (+ sameAs) - tín hiệu thực thể cho AI.
  if (ctx.failing.has('ai_jsonld') || ctx.failing.has('ai_entity')) {
    const org = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: title,
      url: ctx.origin,
      logo: `${ctx.origin}/logo.png`,
      sameAs: ['https://www.facebook.com/your-page', 'https://x.com/your-handle', 'https://www.linkedin.com/company/your-company'],
    };
    out.push({
      id: 'jsonld_org',
      lang: 'html',
      content: `<script type="application/ld+json">\n${JSON.stringify(org, null, 2)}\n</script>`,
    });
  }

  // 4) Redirect http→https + thống nhất host (Apache + Nginx).
  if (ctx.failing.has('seo_http_redirect') || ctx.failing.has('seo_canonical_host')) {
    const isWww = ctx.host.startsWith('www.');
    const bare = isWww ? ctx.host.slice(4) : ctx.host;
    const canonical = ctx.host; // giữ host hiện tại làm bản chính
    const apache = isWww
      ? `RewriteEngine On\n# http -> https\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\n# non-www -> www\nRewriteCond %{HTTP_HOST} ^${bare.replace(/\./g, '\\.')}$ [NC]\nRewriteRule ^ https://${canonical}%{REQUEST_URI} [L,R=301]`
      : `RewriteEngine On\n# http -> https\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\n# www -> non-www\nRewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]\nRewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]`;
    const nginx = `# http -> https + canonical host\nserver {\n  listen 80;\n  server_name ${bare} www.${bare};\n  return 301 https://${canonical}$request_uri;\n}`;
    out.push({ id: 'redirect', lang: 'apache / nginx', content: `# Apache (.htaccess)\n${apache}\n\n# Nginx\n${nginx}` });
  }

  // 5) Open Graph.
  if (ctx.failing.has('aeo_og')) {
    out.push({
      id: 'og',
      lang: 'html',
      content: [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(desc)}" />`,
        `<meta property="og:image" content="${ogImg}" />`,
        `<meta property="og:url" content="${ctx.finalUrl}" />`,
      ].join('\n'),
    });
  }

  // 6) Twitter Card.
  if (ctx.failing.has('aeo_twitter')) {
    out.push({
      id: 'twitter',
      lang: 'html',
      content: [
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(desc)}" />`,
        `<meta name="twitter:image" content="${ogImg}" />`,
      ].join('\n'),
    });
  }

  return out;
}
