// Provider keyword bằng AI - AI sinh DANH SÁCH TỪ KHÓA thật (đúng ngôn ngữ/thị trường),
// thay cho danh sách theo quy tắc cứng. Metrics (volume/KD/...) ước lượng → estimated=true.
import type { Locale } from '../../i18n/config';
import { researchKeywordsWithAI } from '../ai/content';
import type { AiOverride } from '../ai/providers';
import { estimateMetrics, opportunityScore } from './metrics';
import { MockKeywordProvider } from './mock';
import type { KeywordProvider, KeywordResearch, KeywordRow } from './types';

export class AiKeywordProvider implements KeywordProvider {
  constructor(private override?: AiOverride) {}

  async research(seed: string, locale: Locale): Promise<KeywordResearch> {
    const ideas = await researchKeywordsWithAI({ seed, locale, override: this.override });
    // AI lỗi / không có key → fallback mock để vẫn có kết quả.
    if (!ideas || ideas.keywords.length === 0) {
      return new MockKeywordProvider().research(seed, locale);
    }

    const seen = new Set<string>();
    const keywords: KeywordRow[] = [];
    for (const k of ideas.keywords) {
      const term = k.term.trim();
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      const m = estimateMetrics(seed, term, k.intent, k.isQuestion);
      keywords.push({
        term,
        ...m,
        opportunity: opportunityScore(m.volume, m.difficulty),
        intent: k.intent,
        cluster: k.cluster || (k.isQuestion ? 'Câu hỏi' : 'General'),
        isQuestion: k.isQuestion,
        type: k.type,
      });
    }

    const clusters = ideas.clusters.length
      ? [...new Set(ideas.clusters)]
      : [...new Set(keywords.map((k) => k.cluster))];

    return { seed, locale, keywords, clusters, estimated: true };
  }
}
