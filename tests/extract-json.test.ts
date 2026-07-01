import { describe, expect, it } from 'vitest';
import { extractJson } from '@/lib/ai/json';

describe('extractJson — chịu được nhiều kiểu output AI', () => {
  it('JSON thuần', () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('bọc trong code fence ```json', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('có prose dẫn/đuôi quanh JSON', () => {
    expect(extractJson('Đây là kết quả:\n{"a":1}\nHy vọng giúp được bạn.')).toEqual({ a: 1 });
  });

  it('mảng top-level', () => {
    expect(extractJson('[{"x":1},{"x":2}]')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('dấu phẩy thừa trước } hoặc ]', () => {
    expect(extractJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('JSON bị CẮT CỤT (hết token) vẫn cứu được phần hợp lệ', () => {
    // markdown dài bị cắt giữa chuỗi
    const out = extractJson('{"title":"T","markdown":"Mở đầu bài viết bị cắt') as {
      title?: string;
      markdown?: string;
    };
    expect(out?.title).toBe('T');
    expect(typeof out?.markdown).toBe('string');
    expect(out?.markdown).toContain('Mở đầu');
  });

  it('cắt cụt giữa object lồng nhau', () => {
    const out = extractJson('{"a":{"b":1,"c":[1,2') as { a?: { b?: number; c?: number[] } };
    expect(out?.a?.b).toBe(1);
    expect(Array.isArray(out?.a?.c)).toBe(true);
  });

  it('XUỐNG DÒNG THẬT trong chuỗi markdown (model quên escape) vẫn parse được', () => {
    // Nguyên nhân phổ biến của lỗi "AI trả về không đúng định dạng": markdown nhiều dòng
    // bị chèn newline thật thay vì "\\n" → JSON.parse gốc hỏng.
    const raw = '{"title":"T","markdown":"## Tiêu đề\n\nĐoạn 1 có tab\tở đây\nĐoạn 2"}';
    const out = extractJson(raw) as { title?: string; markdown?: string };
    expect(out?.title).toBe('T');
    expect(out?.markdown).toContain('## Tiêu đề');
    expect(out?.markdown).toContain('Đoạn 2');
  });

  it('xuống dòng thật + bị cắt cụt (kết hợp) vẫn cứu được', () => {
    const raw = '{"title":"T","markdown":"Dòng 1\nDòng 2 chưa kết thúc';
    const out = extractJson(raw) as { title?: string; markdown?: string };
    expect(out?.title).toBe('T');
    expect(out?.markdown).toContain('Dòng 1');
  });

  it('rỗng / không có JSON → null', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson('không có json ở đây')).toBeNull();
  });
});
