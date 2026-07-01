// Provider DataForSEO (Labs / Keyword Data). Cần DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.
// Map locale → location/language code của DataForSEO.
import type { Locale } from '../../i18n/config';
import { env } from '../env';
import { safeFetch } from '../security/safe-fetch';
import { opportunityScore } from './metrics';
import type { Intent, KeywordProvider, KeywordResearch, KeywordRow, Trend } from './types';

const LOCALE_MAP: Record<string, { location: number; language: string }> = {
  vi: { location: 1028581, language: 'vi' }, // Vietnam
  en: { location: 2840, language: 'en' }, // United States
  zh: { location: 2156, language: 'zh' },
  ja: { location: 2392, language: 'ja' },
  ko: { location: 2410, language: 'ko' },
  fr: { location: 2250, language: 'fr' },
  de: { location: 2276, language: 'de' },
  id: { location: 2360, language: 'id' },
  hi: { location: 2356, language: 'hi' },
  th: { location: 2764, language: 'th' },
};

function classifyIntent(term: string): Intent {
  const t = term.toLowerCase();
  if (/(mua|giá|bảng giá|buy|price|order)/.test(t)) return 'transactional';
  if (/(tốt nhất|so sánh|review|best|vs|công cụ)/.test(t)) return 'commercial';
  return 'informational';
}

function isQuestionTerm(term: string): boolean {
  return /(là gì|cách|làm sao|tại sao|khi nào|có nên|how|what|why|when)/i.test(term);
}

export class DataForSeoProvider implements KeywordProvider {
  async research(seed: string, locale: Locale): Promise<KeywordResearch> {
    const auth = Buffer.from(
      `${env.dataForSeoLogin}:${env.dataForSeoPassword}`,
    ).toString('base64');
    const loc = LOCALE_MAP[locale] ?? LOCALE_MAP.en;

    const res = await safeFetch(
      'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            keywords: [seed],
            location_code: loc.location,
            language_code: loc.language,
            limit: 60,
          },
        ]),
      },
    );

    if (!res.ok) {
      throw new Error(`DataForSEO lỗi: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as DataForSeoResponse;
    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];

    const keywords: KeywordRow[] = items.map((it) => {
      const term = it.keyword;
      const question = isQuestionTerm(term);
      const volume = it.keyword_info?.search_volume ?? 0;
      const difficulty = it.keyword_properties?.keyword_difficulty ?? 0;
      const ms = it.keyword_info?.monthly_searches ?? [];
      let trend: Trend = 'flat';
      if (ms.length >= 2) {
        const recent = ms[0]?.search_volume ?? 0;
        const older = ms[ms.length - 1]?.search_volume ?? 0;
        trend = recent > older * 1.1 ? 'up' : recent < older * 0.9 ? 'down' : 'flat';
      }
      return {
        term,
        volume,
        difficulty,
        cpc: it.keyword_info?.cpc ?? 0,
        competition: it.keyword_info?.competition ?? 0,
        trend,
        opportunity: opportunityScore(volume, difficulty),
        intent: classifyIntent(term),
        cluster: 'general',
        isQuestion: question,
        type: question ? 'geo' : 'seo',
      };
    });

    return {
      seed,
      locale,
      keywords,
      clusters: ['general'],
      estimated: false,
    };
  }
}

interface DataForSeoResponse {
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        keyword: string;
        keyword_info?: {
          search_volume?: number;
          cpc?: number;
          competition?: number;
          monthly_searches?: Array<{ search_volume?: number }>;
        };
        keyword_properties?: { keyword_difficulty?: number };
      }>;
    }>;
  }>;
}
