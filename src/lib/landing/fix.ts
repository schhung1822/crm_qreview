// Sinh "bản vá" copy-paste cho các lỗi landing (dán vào <head> của file HTML). Nội dung là CODE
// nên KHÔNG dịch; tiêu đề bản vá lấy qua i18n landingAudit.patch.<id>.

export interface LandingPatch {
  id: string; // khóa i18n: landingAudit.patch.<id>
  lang: string; // nhãn ngôn ngữ code
  content: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function generateLandingPatches(ctx: {
  title?: string;
  metaDescription?: string;
  lang?: string;
  failing: Set<string>;
  baseUrl?: string; // khi kiểm bằng LINK: dùng luôn URL đó thay cho "yourdomain.com"
}): LandingPatch[] {
  const out: LandingPatch[] = [];
  const title = ctx.title || 'Your landing page title';
  const desc = ctx.metaDescription || 'A concise, benefit-driven description of your landing page (80–160 characters).';
  const f = ctx.failing;

  // Kiểm bằng link → URL trang thật (page) + gốc site (origin) để chèn vào bản vá. Tải file HTML →
  // giữ placeholder "yourdomain.com" (chưa biết tên miền thật).
  const site = ctx.baseUrl?.trim();
  let origin = 'https://yourdomain.com';
  if (site) {
    try {
      origin = new URL(site).origin;
    } catch {
      /* URL hỏng → giữ placeholder mặc định */
    }
  }
  const page = site || 'https://yourdomain.com/your-landing';

  // 1) Thẻ head cơ bản (charset, title, meta description, viewport, canonical).
  if (f.has('lp_charset') || f.has('lp_title') || f.has('lp_meta') || f.has('lp_viewport') || f.has('lp_canonical')) {
    const lines: string[] = [];
    if (f.has('lp_charset')) lines.push(`<meta charset="utf-8" />`);
    if (f.has('lp_viewport')) lines.push(`<meta name="viewport" content="width=device-width, initial-scale=1" />`);
    if (f.has('lp_title')) lines.push(`<title>${esc(title)}</title>`);
    if (f.has('lp_meta')) lines.push(`<meta name="description" content="${esc(desc)}" />`);
    if (f.has('lp_canonical')) lines.push(`<link rel="canonical" href="${esc(page)}" />`);
    out.push({ id: 'head_basic', lang: 'html', content: `<!-- Đặt trong <head> -->\n${lines.join('\n')}` });
  }

  // 1b) Cho phép lập chỉ mục (khi trang đang bị noindex) — XÓA thẻ noindex cũ rồi dùng dòng này.
  if (f.has('lp_noindex')) {
    out.push({
      id: 'robots_index',
      lang: 'html',
      content: `<!-- Xóa mọi thẻ <meta name="robots" ... noindex ...> hiện có, rồi để: -->\n<meta name="robots" content="index, follow" />`,
    });
  }

  // 2) Open Graph + Twitter Card (chia sẻ đẹp trên mạng xã hội).
  if (f.has('lp_og') || f.has('lp_twitter')) {
    out.push({
      id: 'social',
      lang: 'html',
      content: [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(desc)}" />`,
        `<meta property="og:image" content="${esc(origin)}/og-image.jpg" />`,
        `<meta property="og:url" content="${esc(page)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(desc)}" />`,
        `<meta name="twitter:image" content="${esc(origin)}/og-image.jpg" />`,
      ].join('\n'),
    });
  }

  // 3) JSON-LD Organization (+ sameAs) — tín hiệu thực thể cho AI.
  if (f.has('lp_jsonld') || f.has('lp_entity')) {
    const org = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: title,
      url: origin,
      logo: `${origin}/logo.png`,
      sameAs: [
        'https://www.facebook.com/your-page',
        'https://x.com/your-handle',
        'https://www.linkedin.com/company/your-company',
      ],
    };
    out.push({ id: 'jsonld_org', lang: 'html', content: `<script type="application/ld+json">\n${JSON.stringify(org, null, 2)}\n</script>` });
  }

  // 3b) Schema Product + Offer + AggregateRating (landing bán hàng → rich result + AI hiểu chào hàng).
  if (f.has('lp_schema_rich') || f.has('lp_review')) {
    const product = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description: desc,
      image: `${origin}/product.jpg`,
      brand: { '@type': 'Brand', name: 'Your brand' },
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: page,
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '128' },
    };
    out.push({ id: 'schema_product', lang: 'html', content: `<script type="application/ld+json">\n${JSON.stringify(product, null, 2)}\n</script>` });
  }

  // 3c) Schema BreadcrumbList — ngữ cảnh điều hướng.
  if (f.has('lp_breadcrumb')) {
    const bc = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
        { '@type': 'ListItem', position: 2, name: title, item: page },
      ],
    };
    out.push({ id: 'schema_breadcrumb', lang: 'html', content: `<script type="application/ld+json">\n${JSON.stringify(bc, null, 2)}\n</script>` });
  }

  // 3d) Schema VideoObject — khi landing có video giới thiệu.
  if (f.has('lp_video')) {
    const video = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: title,
      description: desc,
      thumbnailUrl: `${origin}/video-thumb.jpg`,
      uploadDate: '2024-01-01',
      contentUrl: `${origin}/video.mp4`,
    };
    out.push({ id: 'schema_video', lang: 'html', content: `<script type="application/ld+json">\n${JSON.stringify(video, null, 2)}\n</script>` });
  }

  // 3e) Tác giả + ngày cập nhật (E-E-A-T + độ mới) — WebPage kèm author (Person) & ngày.
  if (f.has('lp_author') || f.has('lp_freshness')) {
    const page = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      author: { '@type': 'Person', name: 'Author name', url: `${origin}/about` },
      datePublished: '2024-01-01',
      dateModified: '2024-06-01',
    };
    out.push({ id: 'schema_author_date', lang: 'html', content: `<script type="application/ld+json">\n${JSON.stringify(page, null, 2)}\n</script>` });
  }

  // 4) Favicon.
  if (f.has('lp_favicon')) {
    out.push({
      id: 'favicon',
      lang: 'html',
      content: [
        `<link rel="icon" href="/favicon.ico" sizes="any" />`,
        `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
        `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
      ].join('\n'),
    });
  }

  return out;
}
