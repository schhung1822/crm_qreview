import { describe, expect, it } from 'vitest';
import { estimateMetrics, opportunityScore } from '@/lib/keywords/metrics';

describe('estimateMetrics', () => {
  it('trả chỉ số trong khoảng hợp lệ', () => {
    const m = estimateMetrics('tối ưu seo', 'cách tối ưu seo cho người mới', 'informational', false);
    expect(m.volume).toBeGreaterThan(0);
    expect(m.difficulty).toBeGreaterThanOrEqual(5);
    expect(m.difficulty).toBeLessThanOrEqual(95);
    expect(m.cpc).toBeGreaterThan(0);
    expect(m.competition).toBeGreaterThanOrEqual(0);
    expect(m.competition).toBeLessThanOrEqual(1);
    expect(['up', 'flat', 'down']).toContain(m.trend);
  });

  it('xác định (cùng input → cùng output)', () => {
    const a = estimateMetrics('seo', 'seo onpage', 'commercial', false);
    const b = estimateMetrics('seo', 'seo onpage', 'commercial', false);
    expect(a).toEqual(b);
  });

  it('intent transactional khó/CPC cao hơn informational (cùng term)', () => {
    const t = estimateMetrics('khoa hoc', 'mua khoa hoc seo', 'transactional', false);
    const i = estimateMetrics('khoa hoc', 'mua khoa hoc seo', 'informational', false);
    expect(t.difficulty).toBeGreaterThan(i.difficulty);
    expect(t.cpc).toBeGreaterThan(i.cpc);
  });

  it('opportunityScore: volume cao + KD thấp → điểm cao hơn', () => {
    expect(opportunityScore(5000, 10)).toBeGreaterThan(opportunityScore(200, 80));
  });
});
