import { describe, expect, it } from 'vitest';
import {
  buildJsonLd,
  extractFaqFromHtml,
  extractHowToSteps,
  jsonLdScript,
} from '@/lib/seo/schema';
import { markdownToHtml } from '@/lib/content/markdown';

const faqMd = [
  '## Tối ưu SEO là gì',
  'Một đoạn nội dung.',
  '',
  '## FAQ',
  '### Tối ưu SEO mất bao lâu?',
  'Thường 3-6 tháng.',
  '### SEO có cần backlink không?',
  'Có, backlink vẫn quan trọng.',
].join('\n');

describe('schema JSON-LD', () => {
  it('extractFaqFromHtml lấy đúng cặp Q&A từ khối FAQ', () => {
    const faq = extractFaqFromHtml(markdownToHtml(faqMd));
    expect(faq).toHaveLength(2);
    expect(faq[0].q).toMatch(/mất bao lâu/i);
    expect(faq[0].a).toMatch(/3-6 tháng/);
  });

  it('không có khối FAQ → mảng rỗng', () => {
    expect(extractFaqFromHtml(markdownToHtml('## Giới thiệu\nNội dung.'))).toEqual([]);
  });

  it('extractHowToSteps chỉ trả bước khi tiêu đề có chủ đích hướng dẫn', () => {
    const html = markdownToHtml('## Bước\n1. Một\n2. Hai\n3. Ba');
    expect(extractHowToSteps(html, 'Hướng dẫn cài đặt')).toHaveLength(3);
    expect(extractHowToSteps(html, 'Đánh giá sản phẩm')).toEqual([]); // không phải how-to
  });

  it('buildJsonLd luôn có Article; thêm FAQPage khi có FAQ', () => {
    const nodes = buildJsonLd({
      title: 'Tối ưu SEO',
      description: 'Mô tả',
      locale: 'vi',
      datePublished: '2026-01-01T00:00:00.000Z',
      authorName: 'Nguyễn A',
      organizationName: 'Acme',
      logoUrl: 'https://acme.com/logo.png',
      faq: [{ q: 'Hỏi?', a: 'Đáp.' }],
    });
    const types = nodes.map((n) => n['@type']);
    expect(types).toContain('Article');
    expect(types).toContain('FAQPage');
    const article = nodes.find((n) => n['@type'] === 'Article')!;
    expect((article.author as { name: string }).name).toBe('Nguyễn A');
    expect((article.publisher as { name: string }).name).toBe('Acme');
    expect(article.dateModified).toBe('2026-01-01T00:00:00.000Z'); // mặc định = datePublished
  });

  it('jsonLdScript escape < để không phá thẻ script', () => {
    const s = jsonLdScript([{ '@type': 'Article', headline: '</script><b>x' }]);
    expect(s).toContain('application/ld+json');
    expect(s).not.toContain('</script><b>'); // đã escape thành \\u003c
    expect(s).toContain('\\u003c');
  });

  it('không truyền author/org → JSON-LD bỏ các field đó', () => {
    const [article] = buildJsonLd({ title: 'X', locale: 'en', datePublished: '2026-01-01T00:00:00.000Z' });
    expect(article.author).toBeUndefined();
    expect(article.publisher).toBeUndefined();
  });
});
