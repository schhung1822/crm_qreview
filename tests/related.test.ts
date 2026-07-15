import { describe, expect, it } from 'vitest';
import { mergeRelated, normHref, relatedHrefs } from '@/lib/content/related';

const sec = (inner: string) => `<h2>Bài viết liên quan</h2>\n<ul>${inner}</ul>\n`;
const li = (href: string, text = 'x') => `<li><a href="${href}">${text}</a></li>`;

describe('normHref', () => {
  it('bỏ query/hash và dấu / cuối', () => {
    expect(normHref('https://a.com/bai/?utm_source=x#top')).toBe('https://a.com/bai');
    expect(normHref('https://a.com/bai//')).toBe('https://a.com/bai');
  });
});

describe('mergeRelated', () => {
  it('không có mục nào → không đổi', () => {
    const r = mergeRelated('<p>xin chào</p>');
    expect(r.changed).toBe(false);
  });

  it('gộp 2 mục thành 1 và bỏ href trùng (kể cả khác utm/dấu /)', () => {
    const html =
      '<p>A</p>' +
      sec(li('https://s.com/x')) +
      '<p>B</p>' +
      sec(li('https://s.com/x/?utm_source=s') + li('https://s.com/y'));
    const r = mergeRelated(html);
    expect(r.changed).toBe(true);
    // chỉ còn 1 mục
    expect((r.html.match(/Bài viết liên quan/g) || []).length).toBe(1);
    // 2 link duy nhất (x giữ bản đầu, y)
    expect((r.html.match(/<li/g) || []).length).toBe(2);
    expect(r.html).toContain('https://s.com/x"');
    expect(r.html).toContain('https://s.com/y');
  });

  it('bỏ dòng text suông (không có link)', () => {
    const html = sec(li('https://s.com/x') + '<li>chỉ là chữ, không link</li>');
    const r = mergeRelated(html);
    expect(r.changed).toBe(true);
    expect((r.html.match(/<li/g) || []).length).toBe(1);
    expect(r.html).not.toContain('chỉ là chữ');
  });

  it('nếu mọi dòng đều là text suông → bỏ luôn cả mục', () => {
    const html = '<p>A</p>' + sec('<li>chữ 1</li><li>chữ 2</li>');
    const r = mergeRelated(html);
    expect(r.changed).toBe(true);
    expect(r.html).not.toContain('Bài viết liên quan');
  });
});

describe('relatedHrefs', () => {
  it('trả về href chuẩn hóa của các mục liên quan', () => {
    const html = sec(li('https://s.com/x/?utm_source=s') + li('https://s.com/y'));
    const set = relatedHrefs(html);
    expect(set.has('https://s.com/x')).toBe(true);
    expect(set.has('https://s.com/y')).toBe(true);
    expect(set.size).toBe(2);
  });
});
