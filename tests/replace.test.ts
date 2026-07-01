import { describe, expect, it } from 'vitest';
import { applyReplacements } from '@/lib/content/replace';

describe('applyReplacements', () => {
  it('thay ký tự đơn giản (— → -)', () => {
    expect(applyReplacements('A — B — C', [{ from: '—', to: '-' }])).toBe('A - B - C');
  });

  it('wholeWord: thay "ai" → "AI" nhưng KHÔNG đụng "available"', () => {
    const out = applyReplacements('ai và available và Ai', [
      { from: 'ai', to: 'AI', wholeWord: true },
    ]);
    expect(out).toBe('AI và available và AI'); // "Ai" cũng khớp vì mặc định không phân biệt hoa/thường
    expect(out).toContain('available');
  });

  it('không wholeWord: thay cả bên trong từ', () => {
    expect(applyReplacements('available', [{ from: 'ai', to: 'AI' }])).toBe('avAIlable');
  });

  it('caseSensitive: chỉ thay đúng hoa/thường', () => {
    expect(
      applyReplacements('ai Ai AI', [{ from: 'ai', to: 'X', caseSensitive: true, wholeWord: true }]),
    ).toBe('X Ai AI');
  });

  it('to chứa ký tự đặc biệt $ được chèn nguyên văn', () => {
    expect(applyReplacements('giá tiền', [{ from: 'tiền', to: '$100' }])).toBe('giá $100');
  });

  it('bỏ qua rule from rỗng, giữ nguyên khi không có rule', () => {
    expect(applyReplacements('abc', [{ from: '', to: 'x' }])).toBe('abc');
    expect(applyReplacements('abc', [])).toBe('abc');
  });

  it('áp nhiều rule tuần tự', () => {
    expect(
      applyReplacements('ai — ok', [
        { from: '—', to: '-' },
        { from: 'ai', to: 'AI', wholeWord: true },
      ]),
    ).toBe('AI - ok');
  });
});
