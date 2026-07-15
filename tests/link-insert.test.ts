import { describe, expect, it } from 'vitest';
import { insertContextualLink } from '@/lib/content/link-insert';
import { safeUrl, utmHost, withUtm } from '@/lib/content/utm';

const HREF = 'https://siteb.com/bai-x?utm_source=sitea';

describe('insertContextualLink', () => {
  it('bọc cụm từ trong đoạn văn, giữ nguyên hoa/thường', () => {
    const html = '<p>Bài này nói về marketing nội dung rất kỹ.</p>';
    const r = insertContextualLink(html, 'marketing nội dung', HREF);
    expect(r.inserted).toBe(true);
    expect(r.html).toContain(`<a href="${HREF.replace(/&/g, '&amp;')}">marketing nội dung</a>`);
    // Escape & trong href attribute.
    expect(r.html).toContain('utm_source=sitea');
  });

  it('KHÔNG chèn vào bên trong <a> có sẵn', () => {
    const html = '<p>Xem <a href="https://x.com">marketing nội dung</a> ở đây.</p>';
    const r = insertContextualLink(html, 'marketing nội dung', HREF);
    expect(r.inserted).toBe(false);
    expect(r.html).toBe(html);
  });

  it('KHÔNG chèn trong tiêu đề <h2>', () => {
    const html = '<h2>marketing nội dung</h2><p>đoạn thân bài khác</p>';
    const r = insertContextualLink(html, 'marketing nội dung', HREF);
    expect(r.inserted).toBe(false);
  });

  it('chỉ chèn 1 lần (lần xuất hiện đầu)', () => {
    const html = '<p>seo và seo và seo</p>';
    const r = insertContextualLink(html, 'seo', HREF);
    expect(r.inserted).toBe(true);
    expect((r.html.match(/<a /g) || []).length).toBe(1);
  });

  it('khớp không phân biệt hoa/thường + linh hoạt khoảng trắng', () => {
    const html = '<p>Tối ưu   Nội  Dung là việc quan trọng.</p>';
    const r = insertContextualLink(html, 'tối ưu nội dung', HREF);
    expect(r.inserted).toBe(true);
    expect(r.html).toContain('>Tối ưu   Nội  Dung</a>');
  });

  it('KHÔNG khớp khi cụm từ là một phần của từ dài hơn', () => {
    const html = '<p>superseo la mot cong cu</p>';
    const r = insertContextualLink(html, 'seo', HREF);
    expect(r.inserted).toBe(false);
  });

  it('trả inserted=false khi không thấy cụm từ', () => {
    const html = '<p>nội dung không liên quan</p>';
    const r = insertContextualLink(html, 'không tồn tại ở đây', HREF);
    expect(r.inserted).toBe(false);
    expect(r.html).toBe(html);
  });

  it('từ chối href không phải http/https (chống javascript:)', () => {
    const html = '<p>marketing nội dung</p>';
    const r = insertContextualLink(html, 'marketing nội dung', 'javascript:alert(1)');
    expect(r.inserted).toBe(false);
  });

  it('bỏ qua cụm quá ngắn', () => {
    const r = insertContextualLink('<p>ab</p>', 'ab', HREF);
    expect(r.inserted).toBe(false);
  });
});

describe('utm helpers', () => {
  it('utmHost slugify + bỏ www', () => {
    expect(utmHost('https://www.noti.vn/blog')).toBe('noti_vn');
    expect(utmHost('https://geo.done.vn')).toBe('geo_done_vn');
  });
  it('withUtm nối + không nhân đôi', () => {
    expect(withUtm('https://x.com/a', 'noti_vn')).toBe('https://x.com/a?utm_source=noti_vn');
    expect(withUtm('https://x.com/a?p=1', 'noti_vn')).toBe('https://x.com/a?p=1&utm_source=noti_vn');
    expect(withUtm('https://x.com/a?utm_source=old', 'noti_vn')).toBe('https://x.com/a?utm_source=old');
    expect(withUtm('https://x.com/a', '')).toBe('https://x.com/a');
  });
  it('safeUrl chặn scheme nguy hiểm', () => {
    expect(safeUrl('https://x.com')).toBe('https://x.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
});
