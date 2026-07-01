import { describe, expect, it } from 'vitest';
import { pickBestKeyword } from '@/lib/scoring/keyword';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput } from '@/lib/scoring/types';

const article = {
  title: 'Hướng dẫn tối ưu AEO cho website',
  metaDescription: 'Cách tối ưu AEO để xuất hiện trong featured snippet và People Also Ask.',
  slug: 'huong-dan-toi-uu-aeo',
  locale: 'vi',
  markdown: [
    '**Trả lời nhanh:** tối ưu AEO là làm nội dung được chọn làm câu trả lời trực tiếp.',
    '## Tối ưu AEO là gì?',
    'Tối ưu AEO giúp nội dung xuất hiện trong featured snippet.',
    '## Các bước tối ưu AEO',
    '1. Nghiên cứu câu hỏi\n2. Viết câu trả lời súc tích\n3. Thêm FAQ',
    '## FAQ',
    '### Tối ưu AEO mất bao lâu?\nThường vài tuần.',
  ].join('\n\n'),
};

const total = (kw: string) => {
  const si = buildScoreInput({ ...article, targetKeyword: kw });
  return scoreSeo(si).score + scoreAeo(si).score + scoreGeo(si).score;
};

describe('pickBestKeyword', () => {
  it('chọn keyword bám nội dung, KHÔNG fix cứng keyword rác', () => {
    const irrelevant = 'xyz không liên quan';
    const picked = pickBestKeyword({ ...article, current: irrelevant });
    expect(picked).not.toBe(irrelevant);
    // Keyword được chọn cho tổng điểm ≥ keyword rác ban đầu.
    expect(total(picked)).toBeGreaterThanOrEqual(total(irrelevant));
  });

  it('keyword được chọn xuất hiện trong nội dung bài', () => {
    const picked = pickBestKeyword({ ...article, current: '' });
    expect(article.markdown.toLowerCase()).toContain(picked.toLowerCase());
    expect(picked.length).toBeGreaterThanOrEqual(2);
  });

  it('không kém hơn keyword hiện tại đã tốt sẵn', () => {
    const good = 'tối ưu aeo';
    const picked = pickBestKeyword({ ...article, current: good });
    expect(total(picked)).toBeGreaterThanOrEqual(total(good));
  });
});
