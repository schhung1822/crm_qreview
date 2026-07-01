import { describe, expect, it } from 'vitest';
import { metaDescriptionOf } from '@/lib/cms/wordpress';

describe('metaDescriptionOf — lấy meta khi nhập lại bài WordPress', () => {
  it('ưu tiên field Yoast đã ghi (_yoast_wpseo_metadesc)', () => {
    expect(
      metaDescriptionOf({
        meta: { _yoast_wpseo_metadesc: 'Meta Yoast chuẩn SEO' },
        yoast_head_json: { description: 'khác' },
        excerpt: { rendered: '<p>excerpt</p>' },
      }),
    ).toBe('Meta Yoast chuẩn SEO');
  });

  it('lấy field RankMath khi không có Yoast meta', () => {
    expect(metaDescriptionOf({ meta: { rank_math_description: 'Meta RankMath' } })).toBe(
      'Meta RankMath',
    );
  });

  it('rơi về yoast_head_json.description khi meta field rỗng', () => {
    expect(
      metaDescriptionOf({ meta: {}, yoast_head_json: { description: 'Mô tả từ Yoast head' } }),
    ).toBe('Mô tả từ Yoast head');
  });

  it('cuối cùng rơi về excerpt (đã strip HTML & entity)', () => {
    expect(metaDescriptionOf({ excerpt: { rendered: '<p>Tóm tắt &amp; mô tả</p>\n' } })).toBe(
      'Tóm tắt & mô tả',
    );
  });

  it('trả undefined khi không có gì', () => {
    expect(metaDescriptionOf({})).toBeUndefined();
    expect(metaDescriptionOf({ meta: { _yoast_wpseo_metadesc: '   ' } })).toBeUndefined();
  });
});
