import { describe, expect, it } from 'vitest';
import { buildDoc, buildTxt, exportFileName } from '@/lib/export/article-file';

const article = {
  title: 'UTM Tracking cho Facebook Ads',
  metaDescription: 'Hướng dẫn UTM.',
  slug: 'utm-tracking',
  targetKeyword: 'utm tracking',
  tags: ['utm', 'quảng cáo'],
  markdown: '## Mở đầu\n\nNội dung **đậm** ở đây.',
};

describe('exportFileName', () => {
  it('bỏ dấu + kebab-case + đuôi đúng', () => {
    expect(exportFileName('UTM Tracking cho Facebook Ads', 'txt')).toBe('utm-tracking-cho-facebook-ads.txt');
    expect(exportFileName('Đường dẫn', 'doc')).toBe('duong-dan.doc');
  });
  it('rỗng → tên mặc định', () => {
    expect(exportFileName('', 'txt')).toBe('bai-viet.txt');
  });
});

describe('buildTxt', () => {
  it('có tiêu đề, metadata và thân bài', () => {
    const txt = buildTxt(article);
    expect(txt).toContain('UTM Tracking cho Facebook Ads');
    expect(txt).toContain('Từ khóa: utm tracking');
    expect(txt).toContain('Thẻ: utm, quảng cáo');
    expect(txt).toContain('## Mở đầu');
    expect(txt.endsWith('\n')).toBe(true);
  });
});

describe('buildDoc', () => {
  it('là HTML Word hợp lệ, có tiêu đề + body render từ markdown', () => {
    const doc = buildDoc(article);
    expect(doc).toContain('urn:schemas-microsoft-com:office:word');
    expect(doc).toContain('<h1>UTM Tracking cho Facebook Ads</h1>');
    expect(doc).toContain('<strong>đậm</strong>');
  });
  it('escape ký tự HTML trong metadata', () => {
    const doc = buildDoc({ ...article, title: 'A < B & "C"' });
    expect(doc).toContain('A &lt; B &amp; &quot;C&quot;');
  });
});
