import { describe, expect, it } from 'vitest';
import {
  altFromFilename,
  countMissingAltMarkdown,
  fillMissingAltHtml,
  fillMissingAltMarkdown,
} from '@/lib/content/alt';

describe('altFromFilename', () => {
  it('suy alt có nghĩa từ tên file gạch nối', () => {
    expect(altFromFilename('https://x.com/img/ca-phe-sua-da.jpg')).toBe('Ca phe sua da');
  });
  it('bỏ token nhiễu (IMG_1234, screenshot…)', () => {
    expect(altFromFilename('/uploads/IMG_20240102.png')).toBe('');
    expect(altFromFilename('/a/screenshot.png')).toBe('');
  });
  it('coi hash/uuid là vô nghĩa → rỗng', () => {
    expect(altFromFilename('/generated/9f8c2a1b4d5e6f7a.png')).toBe('');
  });
  it('giải mã %20 và bỏ query', () => {
    expect(altFromFilename('/media/bosch%20drill.jpg?w=800')).toBe('Bosch drill');
  });
});

describe('fillMissingAltMarkdown', () => {
  it('điền alt cho ảnh rỗng alt theo tên file', () => {
    const { markdown, fixed } = fillMissingAltMarkdown('![](/img/may-loc-nuoc.jpg)');
    expect(fixed).toBe(1);
    expect(markdown).toBe('![May loc nuoc](/img/may-loc-nuoc.jpg)');
  });

  it('KHÔNG đụng ảnh đã có alt', () => {
    const src = '![Ảnh có sẵn](/a.jpg)';
    const { markdown, fixed } = fillMissingAltMarkdown(src);
    expect(fixed).toBe(0);
    expect(markdown).toBe(src);
  });

  it('dùng tiêu đề mục gần nhất khi tên file vô nghĩa', () => {
    const md = '## Cách pha trà sen\n\nNội dung.\n\n![](/generated/9f8c2a1b4d5e6f7a.png)';
    const { markdown, fixed } = fillMissingAltMarkdown(md);
    expect(fixed).toBe(1);
    expect(markdown).toContain('![Cách pha trà sen](/generated/9f8c2a1b4d5e6f7a.png)');
  });

  it('fallback về keyword rồi title khi không có gì khác', () => {
    const { markdown } = fillMissingAltMarkdown('![](/generated/x123456789.png)', {
      keyword: 'máy pha cà phê',
      title: 'Bài viết',
    });
    expect(markdown).toContain('![máy pha cà phê]');
  });

  it('giữ nguyên phần title trong ngoặc: ![](url "t")', () => {
    const { markdown } = fillMissingAltMarkdown('![](/img/xe-dap.jpg "chú thích")');
    expect(markdown).toBe('![Xe dap](/img/xe-dap.jpg "chú thích")');
  });

  it('đếm đúng số ảnh thiếu alt', () => {
    expect(countMissingAltMarkdown('![](a.jpg) ![có](b.jpg) ![ ](c.jpg)')).toBe(2);
  });
});

describe('fillMissingAltHtml', () => {
  it('chèn alt cho <img> chưa có thuộc tính alt', () => {
    const { html, fixed } = fillMissingAltHtml('<img src="/img/hoa-hong.jpg" loading="lazy" />');
    expect(fixed).toBe(1);
    expect(html).toContain('alt="Hoa hong"');
  });

  it('thay alt="" rỗng bằng alt có nội dung', () => {
    const { html, fixed } = fillMissingAltHtml('<img alt="" src="/img/con-meo.png">');
    expect(fixed).toBe(1);
    expect(html).toContain('alt="Con meo"');
    expect(html).not.toContain('alt=""');
  });

  it('KHÔNG đụng <img> đã có alt có nghĩa', () => {
    const src = '<img src="/a.jpg" alt="Đã có mô tả" />';
    const { html, fixed } = fillMissingAltHtml(src);
    expect(fixed).toBe(0);
    expect(html).toBe(src);
  });

  it('alt suy ra không phá vỡ thuộc tính (dấu nháy kép bị loại)', () => {
    const { html } = fillMissingAltHtml('<img src="/x.png">', { title: 'A "B" C' });
    // normalizeAlt bỏ hẳn dấu " → alt an toàn, không thể chèn thuộc tính lạ.
    expect(html).toContain('alt="A B C"');
    expect(html).not.toContain('"B"');
  });
});
