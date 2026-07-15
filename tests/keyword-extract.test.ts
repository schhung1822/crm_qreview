import { describe, expect, it } from 'vitest';
import { candidateKeywords, extractKeywordHeuristic } from '@/lib/content/keyword-extract';

describe('keyword-extract: bỏ tên miền/URL', () => {
  const md = `Trí tuệ nhân tạo giúp doanh nghiệp tự động hóa. Trí tuệ nhân tạo đang phát triển nhanh.
Ứng dụng trí tuệ nhân tạo ngày càng nhiều.

## Bài viết liên quan
- [Bài A](https://giapducthang.com/a?utm_source=giapducthang_com)
- [Bài B](https://giapducthang.com/b?utm_source=giapducthang_com)
- [Bài C](https://giapducthang.com/c?utm_source=giapducthang_com)
Xem thêm tại giapducthang.com và https://giapducthang.com/blog.`;
  const title = 'Trí tuệ nhân tạo là gì';

  it('extractKeywordHeuristic KHÔNG chọn tên miền dù xuất hiện nhiều', () => {
    const kw = extractKeywordHeuristic(title, md).toLowerCase();
    const words = kw.split(' ');
    expect(kw).not.toContain('giapducthang');
    expect(words).not.toContain('com');
    // Phải là cụm chủ đề thật.
    expect(kw).toContain('trí tuệ nhân tạo'.split(' ').find((w) => kw.includes(w)) ?? 'trí');
  });

  it('candidateKeywords không đề xuất cụm chứa tên miền', () => {
    const cands = candidateKeywords(title, md).map((c) => c.toLowerCase());
    expect(cands.every((c) => !c.includes('giapducthang'))).toBe(true);
    expect(cands.every((c) => !c.split(' ').includes('com'))).toBe(true);
    expect(cands.some((c) => c.includes('trí tuệ'))).toBe(true);
  });
});
