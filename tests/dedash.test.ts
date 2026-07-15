import { describe, expect, it } from 'vitest';
import { dedash, decodeEntities } from '@/lib/content/dedash';

describe('dedash', () => {
  it('đổi em dash "—" thành "-"', () => {
    expect(dedash('SEO — GEO')).toBe('SEO - GEO');
    expect(dedash('nhanh—gọn')).toBe('nhanh-gọn');
  });

  it('đổi en dash "–" và các gạch dài khác thành "-"', () => {
    expect(dedash('2020–2024')).toBe('2020-2024'); // en dash
    expect(dedash('a ― b')).toBe('a - b'); // horizontal bar
    expect(dedash('−5°C')).toBe('-5°C'); // minus sign
    expect(dedash('x ⸺ y')).toBe('x - y'); // two-em dash
  });

  it('đổi cả hyphen U+2010 (‐) và non-breaking hyphen U+2011 (‑)', () => {
    expect(dedash('co‑operate')).toBe('co-operate'); // U+2011
    expect(dedash('e‐mail')).toBe('e-mail'); // U+2010
  });

  it('giữ nguyên gạch nối thường và khoảng trắng xung quanh', () => {
    expect(dedash('ca-phe-sua-da')).toBe('ca-phe-sua-da');
    expect(dedash('a — b')).toBe('a - b');
    expect(dedash('không có gạch')).toBe('không có gạch');
  });

  it('xử lý nhiều gạch dài trong một chuỗi', () => {
    expect(dedash('A—B–C―D')).toBe('A-B-C-D');
  });

  it('chuỗi rỗng trả về rỗng', () => {
    expect(dedash('')).toBe('');
  });

  it('giải mã entity &#8230; (…) và các entity typographic', () => {
    expect(dedash('Đang tải&#8230;')).toBe('Đang tải…');
    expect(dedash('&#x2026;')).toBe('…'); // hex
    expect(dedash('&hellip;')).toBe('…'); // tên
    expect(dedash('a&nbsp;b')).toBe('a b'); // nbsp → space
  });

  it('gỡ ESCAPE HAI LẦN &amp;#8230; → …', () => {
    expect(dedash('Xong&amp;#8230;')).toBe('Xong…');
    expect(dedash('&amp;hellip;')).toBe('…');
  });

  it('entity gạch dài (&mdash;/&ndash;) → "-"', () => {
    expect(dedash('A&mdash;B')).toBe('A-B');
    expect(dedash('2020&ndash;2024')).toBe('2020-2024');
  });
});

describe('decodeEntities — KHÔNG đụng ký tự cấu trúc HTML', () => {
  it('giữ nguyên &amp; &lt; &gt; &quot; và &amp; trong URL/văn bản', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom &amp; Jerry');
    expect(decodeEntities('?a=1&amp;utm=x')).toBe('?a=1&amp;utm=x');
    expect(decodeEntities('&lt;script&gt;')).toBe('&lt;script&gt;');
    expect(decodeEntities('&#60;')).toBe('&#60;'); // codepoint "<" bị bỏ qua (an toàn)
  });
  it('bỏ qua entity không rõ', () => {
    expect(decodeEntities('&khongbiet;')).toBe('&khongbiet;');
  });
});
