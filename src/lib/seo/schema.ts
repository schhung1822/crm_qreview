// Sinh JSON-LD structured data (schema.org) cho bài viết - XƯƠNG SỐNG của AEO/GEO:
// Google AI Overviews, ChatGPT, Perplexity… đọc JSON-LD để hiểu & trích dẫn nội dung.
// Hàm THUẦN, testable. Trích FAQ/HowTo từ HTML do markdownToHtml sinh ra.

export interface JsonLdInput {
  title: string;
  description?: string;
  locale: string; // BCP-47 → inLanguage
  datePublished?: string; // ISO; route truyền vào (giữ hàm thuần, không tự gọi Date)
  dateModified?: string;
  imageUrl?: string; // chỉ nên là http(s) công khai
  authorName?: string;
  organizationName?: string;
  logoUrl?: string;
  faq?: Array<{ q: string; a: string }>;
  howToSteps?: string[];
}

// Bỏ thẻ + giải mã entity cơ bản + gộp khoảng trắng → text sạch cho JSON-LD.
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Trích cặp Q&A từ khối FAQ: tìm heading FAQ → các <h3>câu hỏi</h3> + <p>trả lời</p>
// đứng sau, dừng ở <h2> kế tiếp. Khớp output của markdownToHtml ("## FAQ" → "### Q").
export function extractFaqFromHtml(html: string): Array<{ q: string; a: string }> {
  const head = html.search(
    /<h[23][^>]*>[^<]*(?:faq|câu hỏi thường gặp|hỏi[ -]?đáp|frequently asked)[^<]*<\/h[23]>/i,
  );
  if (head === -1) return [];
  // Bỏ chính heading FAQ, rồi cắt đến <h2> tiếp theo (ranh giới khối FAQ).
  const after = html.slice(head).replace(/^<h[23][^>]*>[\s\S]*?<\/h[23]>/i, '');
  const stop = after.search(/<h2[^>]*>/i);
  const body = stop === -1 ? after : after.slice(0, stop);

  const pairs: Array<{ q: string; a: string }> = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*((?:<p[^>]*>[\s\S]*?<\/p>\s*)+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const q = stripTags(m[1]);
    const a = stripTags(m[2]);
    if (q && a) pairs.push({ q, a });
  }
  return pairs;
}

// Trích các bước How-To - CHỈ khi tiêu đề có chủ đích hướng dẫn (tránh gắn HowTo nhầm
// vào danh sách đánh số bất kỳ, vốn bị Google coi là schema sai). Lấy <ol> đầu tiên.
export function extractHowToSteps(html: string, titleHint: string): string[] {
  if (
    !/how[\s-]?to|cách|hướng dẫn|các bước|từng bước|step[\s-]?by[\s-]?step|tutorial/i.test(
      titleHint,
    )
  ) {
    return [];
  }
  const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
  if (!ol) return [];
  const items = [...ol[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  return items.length >= 3 ? items : [];
}

// Loại field undefined/rỗng để JSON-LD gọn.
function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete obj[k];
  }
  return obj;
}

// Dựng mảng node JSON-LD: luôn có Article; thêm FAQPage / HowTo nếu có dữ liệu.
export function buildJsonLd(input: JsonLdInput): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];

  const article = clean({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title.slice(0, 110), // Google cắt headline ~110 ký tự
    description: input.description,
    inLanguage: input.locale,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    image: input.imageUrl,
    author: input.authorName
      ? { '@type': 'Person', name: input.authorName }
      : undefined,
    publisher: input.organizationName
      ? clean({
          '@type': 'Organization',
          name: input.organizationName,
          logo: input.logoUrl ? { '@type': 'ImageObject', url: input.logoUrl } : undefined,
        })
      : undefined,
  });
  nodes.push(article);

  if (input.faq && input.faq.length) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: input.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  if (input.howToSteps && input.howToSteps.length >= 3) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: input.title,
      step: input.howToSteps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        text: s,
      })),
    });
  }

  return nodes;
}

// Bọc thành thẻ <script type="application/ld+json">. Escape '<' thành < để KHÔNG
// thể phá thẻ </script> (an toàn khi nhúng vào HTML body).
export function jsonLdScript(nodes: Record<string, unknown>[]): string {
  if (!nodes.length) return '';
  const data = nodes.length === 1 ? nodes[0] : nodes;
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `\n<script type="application/ld+json">${json}</script>`;
}
