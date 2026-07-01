import { describe, expect, it } from 'vitest';
import { aiBotStatus, isAllowed, parseRobots } from '@/lib/audit/robots';

describe('robots.txt parse + isAllowed', () => {
  it('chặn GPTBot cụ thể, các bot khác vẫn được phép', () => {
    const r = parseRobots(
      ['User-agent: GPTBot', 'Disallow: /', '', 'User-agent: *', 'Disallow: /admin', 'Sitemap: https://x.com/sitemap.xml'].join('\n'),
    );
    expect(isAllowed(r, 'GPTBot', '/')).toBe(false);
    expect(isAllowed(r, 'ClaudeBot', '/')).toBe(true); // rơi vào nhóm *
    expect(isAllowed(r, 'ClaudeBot', '/admin')).toBe(false);
    expect(r.sitemaps).toContain('https://x.com/sitemap.xml');
  });

  it('Allow thắng Disallow khi longest-match dài hơn', () => {
    const r = parseRobots(['User-agent: *', 'Disallow: /blog', 'Allow: /blog/public'].join('\n'));
    expect(isAllowed(r, 'Googlebot', '/blog/private')).toBe(false);
    expect(isAllowed(r, 'Googlebot', '/blog/public/post')).toBe(true);
  });

  it('không có luật → cho phép tất cả; aiBotStatus liệt kê đủ bot', () => {
    const r = parseRobots('');
    expect(isAllowed(r, 'GPTBot', '/')).toBe(true);
    const st = aiBotStatus(r);
    expect(st.length).toBeGreaterThanOrEqual(10);
    expect(st.every((b) => b.allowed)).toBe(true);
  });
});
