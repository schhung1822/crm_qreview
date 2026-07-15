import { describe, expect, it } from 'vitest';
import { htmlToRicos } from '@/lib/cms/ricos';

describe('htmlToRicos', () => {
  it('heading → HEADING node với đúng level', () => {
    const { nodes } = htmlToRicos('<h2>Tiêu đề</h2>');
    expect(nodes[0].type).toBe('HEADING');
    expect((nodes[0] as unknown as { headingData: { level: number } }).headingData.level).toBe(2);
  });

  it('đoạn văn có <strong> và <a> → TEXT có decoration BOLD / LINK', () => {
    const { nodes } = htmlToRicos('<p>Xin <strong>chào</strong> <a href="https://x.com">link</a></p>');
    expect(nodes[0].type).toBe('PARAGRAPH');
    const texts = (nodes[0].nodes as Array<{ textData: { text: string; decorations: Array<{ type: string }> } }>);
    const joined = texts.map((t) => t.textData.text).join('');
    expect(joined).toContain('chào');
    const types = texts.flatMap((t) => t.textData.decorations.map((d) => d.type));
    expect(types).toContain('BOLD');
    expect(types).toContain('LINK');
  });

  it('danh sách → BULLETED_LIST với LIST_ITEM', () => {
    const { nodes } = htmlToRicos('<ul><li>Một</li><li>Hai</li></ul>');
    expect(nodes[0].type).toBe('BULLETED_LIST');
    expect(nodes[0].nodes).toHaveLength(2);
    expect((nodes[0].nodes as Array<{ type: string }>)[0].type).toBe('LIST_ITEM');
  });

  it('ảnh http → IMAGE node; ảnh không phải URL thật thì bỏ', () => {
    const ok = htmlToRicos('<img src="https://cdn.x/a.webp" alt="mô tả" />');
    expect(ok.nodes[0].type).toBe('IMAGE');
    expect(
      (ok.nodes[0] as unknown as { imageData: { image: { src: { url: string } } } }).imageData.image.src.url,
    ).toBe('https://cdn.x/a.webp');
    const ph = htmlToRicos('<p><img src="/generated/x.webp" alt="a"></p>');
    // /generated/ chưa đổi sang URL công khai ⇒ không phải http ⇒ bỏ (còn 0 IMAGE)
    expect(ph.nodes.every((n) => n.type !== 'IMAGE')).toBe(true);
  });

  it('bỏ script (JSON-LD) và link (hreflang); rỗng → 1 đoạn', () => {
    const { nodes } = htmlToRicos('<script>{"@type":"Article"}</script><link rel="alternate">');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('PARAGRAPH');
  });

  it('luôn trả document hợp lệ có mảng nodes', () => {
    const r = htmlToRicos('');
    expect(Array.isArray(r.nodes)).toBe(true);
    expect(r.nodes.length).toBeGreaterThan(0);
  });
});
