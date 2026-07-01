// Provider ước lượng - dùng khi chưa cấu hình DataForSEO. estimated=true.
// KHÔNG phải số liệu thật; mô hình heuristic minh bạch (volume giảm theo độ dài/đuôi từ,
// KD/CPC/cạnh tranh theo intent, trend theo tín hiệu "2026"/"mới").
import type { Locale } from '../../i18n/config';
import type { Intent, KeywordProvider, KeywordResearch, KeywordRow, Trend } from './types';
import { opportunityScore } from './metrics';

const QUESTION_PREFIXES = ['cách', 'làm sao', 'tại sao', 'là gì', 'có nên', 'khi nào'];
const CLUSTERS = ['Khái niệm', 'So sánh', 'Hướng dẫn', 'Công cụ', 'Kỹ thuật', 'Câu hỏi'];

function hash(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function classifyIntent(term: string): Intent {
  const t = term.toLowerCase();
  if (/(mua|giá|bảng giá|đăng ký|buy|price|order)/.test(t)) return 'transactional';
  if (/(tốt nhất|so sánh|review|vs|công cụ|dịch vụ)/.test(t)) return 'commercial';
  if (/(đăng nhập|trang chủ|tải|login|download)/.test(t)) return 'navigational';
  return 'informational';
}

export class MockKeywordProvider implements KeywordProvider {
  async research(seed: string, locale: Locale): Promise<KeywordResearch> {
    const base = seed.trim().toLowerCase();
    const variants: string[] = [
      base,
      `${base} là gì`,
      `cách ${base}`,
      `${base} hiệu quả`,
      `công cụ ${base}`,
      `${base} cho người mới`,
      `làm sao để ${base}`,
      `so sánh ${base}`,
      `${base} 2026`,
      `tại sao cần ${base}`,
      `${base} tốt nhất`,
      `${base} miễn phí`,
      `${base} chuyên nghiệp`,
      `dịch vụ ${base}`,
      `${base} cho doanh nghiệp`,
      `hướng dẫn ${base} chi tiết`,
    ];

    const keywords: KeywordRow[] = variants.map((term, i) => {
      const r = hash(`${base}|${term}|${i}`);
      const words = term.split(/\s+/).length;
      const isQuestion =
        QUESTION_PREFIXES.some((p) => term.startsWith(p)) || term.includes('là gì');

      // Volume: head term cao, long-tail/câu hỏi thấp dần theo số từ.
      const headBoost = term === base ? 6 : 1;
      const lengthPenalty = Math.max(0.25, 1 - (words - 2) * 0.14);
      const volume = Math.round(((180 + (r % 5200)) * lengthPenalty * headBoost) / 10) * 10;

      const intent = classifyIntent(term);
      // KD: transactional/commercial khó hơn; long-tail dễ hơn.
      const intentKd = intent === 'transactional' ? 22 : intent === 'commercial' ? 14 : 0;
      const difficulty = Math.min(
        95,
        Math.max(5, 18 + (r % 45) + intentKd - (words - 2) * 6),
      );

      // CPC: cao với transactional/commercial.
      const cpcBase = intent === 'transactional' ? 1.2 : intent === 'commercial' ? 0.8 : 0.2;
      const cpc = Number((cpcBase + (r % 380) / 100).toFixed(2));

      const competition = Number(Math.min(1, (difficulty / 100) * 0.7 + (r % 40) / 100).toFixed(2));

      const trend: Trend =
        /2026|mới|xu hướng|ai/i.test(term) ? 'up' : r % 5 === 0 ? 'down' : 'flat';

      return {
        term,
        volume,
        difficulty,
        cpc,
        competition,
        trend,
        opportunity: opportunityScore(volume, difficulty),
        intent,
        cluster: isQuestion ? 'Câu hỏi' : CLUSTERS[r % (CLUSTERS.length - 1)],
        isQuestion,
        type: isQuestion ? 'geo' : 'seo',
      };
    });

    return { seed, locale, keywords, clusters: CLUSTERS, estimated: true };
  }
}
