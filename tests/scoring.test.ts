import { describe, expect, it } from 'vitest';
import { scoreSeo } from '@/lib/seo/score';
import { scoreGeo } from '@/lib/geo/score';
import { buildScoreInput } from '@/lib/scoring/types';

const weakArticle = buildScoreInput({
  title: 'x',
  markdown: 'ngắn quá',
  locale: 'vi',
});

const strongArticle = buildScoreInput({
  title: 'Hướng dẫn tối ưu SEO cho người mới bắt đầu chi tiết',
  metaDescription:
    'Bài hướng dẫn tối ưu SEO đầy đủ: nghiên cứu từ khóa, cấu trúc bài, internal link và đo lường hiệu quả cho người mới.',
  slug: 'huong-dan-toi-uu-seo',
  targetKeyword: 'tối ưu seo',
  markdown: [
    '**Trả lời nhanh:** tối ưu SEO là quá trình cải thiện thứ hạng trên Google.',
    '',
    '## Tối ưu SEO là gì',
    'Tối ưu SEO giúp trang web xuất hiện cao hơn. Theo nghiên cứu 2024, 75% người dùng không qua trang 2.',
    'Xem thêm [bài liên quan](/seo-co-ban) và [nguồn ngoài](https://moz.com/seo).',
    '',
    '## Các bước tối ưu seo',
    '1. Nghiên cứu từ khóa\n2. Viết nội dung\n3. Internal link',
    '![minh hoa](/generated/seo.webp)',
    '',
    '## FAQ',
    '### Tối ưu SEO mất bao lâu?',
    'Thường 3-6 tháng tùy độ cạnh tranh.',
  ].join('\n'),
  locale: 'vi',
});

describe('scoreSeo / scoreGeo', () => {
  it('trả điểm 0..100', () => {
    for (const r of [scoreSeo(weakArticle), scoreGeo(weakArticle), scoreSeo(strongArticle), scoreGeo(strongArticle)]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(r.checks)).toBe(true);
      expect(r.checks.length).toBeGreaterThan(0);
    }
  });

  it('bài đầy đủ điểm CAO hơn bài sơ sài', () => {
    expect(scoreSeo(strongArticle).score).toBeGreaterThan(scoreSeo(weakArticle).score);
    expect(scoreGeo(strongArticle).score).toBeGreaterThan(scoreGeo(weakArticle).score);
  });

  it('mỗi check có state hợp lệ', () => {
    for (const c of scoreSeo(strongArticle).checks) {
      expect(['pass', 'warn', 'fail']).toContain(c.state);
    }
  });

  it('buildScoreInput đếm internal link & phát hiện FAQ', () => {
    expect(strongArticle.internalLinkCount).toBeGreaterThanOrEqual(1);
    expect(strongArticle.hasFaqSchema).toBe(true);
  });

  it('GEO: năm trần KHÔNG được tính là freshness hay số liệu', () => {
    const a = buildScoreInput({
      title: 'Giới thiệu công ty',
      markdown:
        '## Về chúng tôi\nCông ty thành lập năm 2010 và phát triển không ngừng.\n\n## Dịch vụ\nChúng tôi cung cấp nhiều dịch vụ.',
      locale: 'vi',
    });
    const by = Object.fromEntries(scoreGeo(a).checks.map((c) => [c.id, c.state]));
    expect(by.freshness).not.toBe('pass'); // "2010" trần ≠ tín hiệu cập nhật
    expect(by.stats).not.toBe('pass'); // "2010" trần ≠ số liệu
  });

  it('SEO: khớp keyword bỏ dấu (đồng bộ với AEO)', () => {
    const a = buildScoreInput({
      title: 'Hướng dẫn TỐI ƯU nội dung',
      slug: 'huong-dan-toi-uu',
      metaDescription: 'x'.repeat(130),
      markdown: '## toi uu\nNội dung tối ưu rõ ràng ngay trong 100 từ đầu để khớp keyword.',
      targetKeyword: 'toi uu', // không dấu, vẫn khớp "TỐI ƯU" trong title sau khi fold
      locale: 'vi',
    });
    const by = Object.fromEntries(scoreSeo(a).checks.map((c) => [c.id, c.state]));
    expect(by.title).toBe('pass');
  });
});
