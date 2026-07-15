import { describe, expect, it } from 'vitest';
import { diffWords } from '@/lib/content/diff';

describe('diffWords', () => {
  it('không thay đổi → toàn bộ là same', () => {
    expect(diffWords('a b c', 'a b c')).toEqual([{ type: 'same', text: 'a b c' }]);
  });

  it('chuỗi rỗng → mảng rỗng', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('thêm từ → có segment add, ghép lại ra chuỗi sau', () => {
    const segs = diffWords('con mèo', 'con mèo đen');
    expect(segs.filter((s) => s.type === 'add').length).toBeGreaterThan(0);
    expect(segs.filter((s) => s.type !== 'del').map((s) => s.text).join('')).toBe('con mèo đen');
  });

  it('xóa từ → có segment del, phần không-del ghép ra chuỗi sau', () => {
    const segs = diffWords('con mèo đen', 'con mèo');
    expect(segs.some((s) => s.type === 'del')).toBe(true);
    expect(segs.filter((s) => s.type !== 'del').map((s) => s.text).join('')).toBe('con mèo');
  });

  it('ghép segment cùng loại liên tiếp (không vụn)', () => {
    const segs = diffWords('x', 'hoàn toàn khác');
    // không có 2 segment add liền nhau
    for (let i = 1; i < segs.length; i++) expect(segs[i].type).not.toBe(segs[i - 1].type);
  });

  it('phần "same" + "add" luôn tái tạo đúng văn bản sau', () => {
    const before = 'Giá sản phẩm là 100 đồng mỗi cái';
    const after = 'Giá sản phẩm là 120 đồng mỗi hộp';
    const segs = diffWords(before, after);
    expect(segs.filter((s) => s.type !== 'del').map((s) => s.text).join('')).toBe(after);
    expect(segs.filter((s) => s.type !== 'add').map((s) => s.text).join('')).toBe(before);
  });
});
