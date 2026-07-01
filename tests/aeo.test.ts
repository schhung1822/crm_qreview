import { describe, expect, it } from 'vitest';
import { scoreAeo } from '@/lib/aeo/score';
import { buildScoreInput } from '@/lib/scoring/types';

const weak = buildScoreInput({ title: 'x', markdown: 'một câu ngắn.', locale: 'vi' });

const strong = buildScoreInput({
  title: 'Cách tối ưu AEO cho website',
  targetKeyword: 'tối ưu aeo',
  markdown: [
    '**Trả lời nhanh:** Tối ưu AEO là làm cho nội dung được chọn làm câu trả lời trực tiếp. ' +
      'Hãy trả lời thẳng câu hỏi ngay đầu bài, dùng heading dạng câu hỏi và FAQ để answer engine dễ rút trích nội dung.',
    '',
    '## Tối ưu AEO là gì?',
    'Tối ưu AEO là quá trình giúp nội dung xuất hiện trong featured snippet và People Also Ask.',
    '',
    '## Làm thế nào để tối ưu AEO?',
    'Trả lời ngắn gọn ngay dưới mỗi câu hỏi và thêm dữ liệu cụ thể.',
    '',
    '## Các bước tối ưu AEO',
    '1. Nghiên cứu câu hỏi người dùng\n2. Viết câu trả lời súc tích\n3. Thêm FAQ và schema',
    '',
    '| Tiêu chí | Mục tiêu |',
    '| --- | --- |',
    '| Độ dài snippet | 40–60 từ |',
    '',
    '## Tóm tắt',
    '- Trả lời thẳng\n- Heading câu hỏi\n- FAQ rõ ràng',
    '',
    '## FAQ',
    '### Tối ưu AEO mất bao lâu?',
    'Thường vài tuần để có kết quả ban đầu.',
  ].join('\n'),
  locale: 'vi',
});

describe('scoreAeo', () => {
  it('điểm trong [0,100] và có checks', () => {
    for (const r of [scoreAeo(weak), scoreAeo(strong)]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.checks.length).toBe(10);
    }
  });

  it('bài chuẩn AEO điểm cao hơn bài sơ sài', () => {
    expect(scoreAeo(strong).score).toBeGreaterThan(scoreAeo(weak).score);
  });

  it('phát hiện heading câu hỏi, How-To, FAQ, tóm tắt', () => {
    const by = Object.fromEntries(scoreAeo(strong).checks.map((c) => [c.id, c.state]));
    expect(by.questionHeadings).toBe('pass'); // ≥2 heading câu hỏi
    expect(by.howto).toBe('pass'); // ≥3 bước đánh số
    expect(by.faq).toBe('pass'); // có FAQ heading
    expect(by.listOrTable).toBe('pass'); // có list + bảng
    expect(by.answerUpfront).toBe('pass'); // có trả lời nhanh đầu bài
    expect(by.queryMatch).toBe('pass'); // keyword ở heading
  });

  it('state mỗi check hợp lệ', () => {
    for (const c of scoreAeo(strong).checks) expect(['pass', 'warn', 'fail']).toContain(c.state);
  });
});
