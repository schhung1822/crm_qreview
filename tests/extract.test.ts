import { describe, expect, it } from 'vitest';
import { extractFromBuffer } from '@/lib/ingest/extract';

describe('extractFromBuffer', () => {
  it('đọc file .txt và chuẩn hóa khoảng trắng', async () => {
    const r = await extractFromBuffer('note.txt', Buffer.from('Xin chào   thế giới\n\n\n\nĐoạn 2'));
    expect(r.text).toContain('Xin chào');
    expect(r.text).toContain('Đoạn 2');
    expect(r.text).not.toMatch(/\n{3,}/); // gộp dòng trống thừa
  });

  it('bóc text từ .html: bỏ script/nav, lấy title', async () => {
    const html =
      '<html><head><title>Tiêu đề bài</title></head><body>' +
      '<nav>menu trên</nav><p>Nội dung <b>quan trọng</b> ở đây.</p>' +
      '<script>doEvil()</script><footer>chân trang</footer></body></html>';
    const r = await extractFromBuffer('page.html', Buffer.from(html));
    expect(r.text).toContain('Nội dung quan trọng ở đây');
    expect(r.text).not.toContain('doEvil');
    expect(r.text).not.toContain('menu trên');
    expect(r.title).toBe('Tiêu đề bài');
  });

  it('.doc (Word cũ) báo lỗi rõ ràng', async () => {
    await expect(extractFromBuffer('old.doc', Buffer.from('x'))).rejects.toThrow(/\.docx|\.pdf|\.txt/);
  });
});
