import { describe, expect, it } from 'vitest';
import { coverImageHtml, htmlToMarkdown, markdownToHtml } from '@/lib/content/markdown';

describe('markdownToHtml — chống XSS', () => {
  it('vô hiệu hóa link javascript:', () => {
    const html = markdownToHtml('[bấm](javascript:alert(document.cookie))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('vô hiệu hóa link data: và vbscript:', () => {
    expect(markdownToHtml('[x](data:text/html,<script>1</script>)')).not.toContain('data:text/html');
    expect(markdownToHtml('[x](VBScript:msgbox)')).not.toContain('VBScript:');
  });

  it('giữ link http/https hợp lệ', () => {
    expect(markdownToHtml('[ok](https://example.com)')).toContain('href="https://example.com"');
  });

  it('chặn ảnh protocol-relative //evil.com (không tạo <img>)', () => {
    const html = markdownToHtml('![x](//evil.com/track.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('md-img-ph'); // placeholder
  });

  it('cho phép ảnh nội bộ /generated/...', () => {
    expect(markdownToHtml('![x](/generated/a.webp)')).toContain('<img src="/generated/a.webp"');
  });

  it('escape thẻ HTML thô trong nội dung', () => {
    const html = markdownToHtml('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img');
  });
});

describe('coverImageHtml', () => {
  it('trả rỗng cho URL không an toàn', () => {
    expect(coverImageHtml('javascript:alert(1)')).toBe('');
    expect(coverImageHtml('//evil.com/x.png')).toBe('');
    expect(coverImageHtml('')).toBe('');
  });
  it('escape & dựng <img> cho URL hợp lệ', () => {
    expect(coverImageHtml('https://cdn.test/a.png')).toBe('<img src="https://cdn.test/a.png" alt="cover" />');
  });
  it('không thể thoát thuộc tính qua dấu ngoặc kép', () => {
    const out = coverImageHtml('/g.png"><script>alert(1)</script>');
    // dấu " và < bị escape → không tạo được thẻ script
    expect(out).not.toContain('<script>');
  });
});

describe('htmlToMarkdown', () => {
  it('chuyển heading/link/đậm về markdown', () => {
    const md = htmlToMarkdown('<h2>Tiêu đề</h2><p>Xem <a href="https://a.b">đây</a> và <strong>đậm</strong></p>');
    expect(md).toContain('## Tiêu đề');
    expect(md).toContain('[đây](https://a.b)');
    expect(md).toContain('**đậm**');
  });

  it('GIỮ link bài viết liên quan trong danh sách (<li><a>)', () => {
    const md = htmlToMarkdown(
      '<h3>Bài liên quan</h3><ul>' +
        '<li><a href="https://site.com/a">Bài A</a></li>' +
        '<li><a href="https://site.com/b">Bài B</a></li></ul>',
    );
    expect(md).toContain('[Bài A](https://site.com/a)');
    expect(md).toContain('[Bài B](https://site.com/b)');
  });

  it('GIỮ link trong heading', () => {
    const md = htmlToMarkdown('<h2><a href="https://x.y">Tiêu đề có link</a></h2>');
    expect(md).toContain('[Tiêu đề có link](https://x.y)');
  });
});
