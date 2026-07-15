// Provider DataForSEO (Labs / Keyword Data). Credential lấy từ store (UI) → env (fallback).
// Map locale → location/language code của DataForSEO.
import type { Locale } from '../../i18n/config';
import { dfsPost, localeToDfs } from '../dataforseo/client';
import { opportunityScore } from './metrics';
import type { Intent, KeywordProvider, KeywordResearch, KeywordRow, Trend } from './types';

function classifyIntent(term: string): Intent {
  const t = term.toLowerCase();
  if (/(mua|giá|bảng giá|buy|price|order)/.test(t)) return 'transactional';
  if (/(tốt nhất|so sánh|review|best|vs|công cụ)/.test(t)) return 'commercial';
  return 'informational';
}

function isQuestionTerm(term: string): boolean {
  return /(là gì|cách|làm sao|tại sao|khi nào|có nên|how|what|why|when)/i.test(term);
}

// Có đủ suggestions liên quan thì thôi, không cần bổ sung ideas.
const MIN_SUGGESTIONS = 25;

// Từ dừng + địa danh phổ biến gây nhiễu khi lọc liên quan (chia sẻ token nhưng lạc chủ đề,
// ví dụ seed "... việt nam" kéo theo "u23 việt nam", "xskt miền nam"...).
const STOP = new Set([
  'việt', 'nam', 'viet', 'vietnam', 'vn', 'và', 'của', 'cho', 'các', 'những', 'một', 'là', 'gì',
  'the', 'and', 'for', 'with', 'best', 'top', 'vs', 'tại', 'miền', 'in', 'on', 'of',
]);

// Token đặc trưng của seed (bỏ từ dừng/địa danh, giữ từ >= 3 ký tự) để đánh giá liên quan.
function significantTokens(seed: string): string[] {
  return Array.from(
    new Set(
      seed
        .toLowerCase()
        .split(/[\s,;:/|()[\]{}."'’“”\-–—]+/)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  );
}

// Từ khóa được xem là liên quan nếu chứa ít nhất 1 token đặc trưng của seed.
function isRelevant(keywordLower: string, tokens: string[]): boolean {
  return tokens.some((tok) => keywordLower.includes(tok));
}

type DfsItem = NonNullable<DataForSeoResult['items']>[number];

export class DataForSeoProvider implements KeywordProvider {
  async research(seed: string, locale: Locale): Promise<KeywordResearch> {
    const loc = localeToDfs(locale);
    const base = { location_code: loc.location, language_code: loc.language, limit: 60 };

    // 1) keyword_suggestions: trả về từ khóa CHỨA cụm seed → liên quan theo cấu trúc (chính xác).
    const sugg = await dfsPost<DataForSeoResult>('/dataforseo_labs/google/keyword_suggestions/live', [
      { keyword: seed, ...base },
    ]);
    const collected: DfsItem[] = [...(sugg[0]?.items ?? [])];

    // 2) Nếu quá ít → bổ sung keyword_ideas (rộng hơn) nhưng LỌC theo token đặc trưng của seed,
    //    loại bỏ những từ chỉ trùng token địa danh (sex việt, u23 việt nam, xskt miền nam...).
    const tokens = significantTokens(seed);
    if (collected.length < MIN_SUGGESTIONS && tokens.length > 0) {
      try {
        const ideas = await dfsPost<DataForSeoResult>('/dataforseo_labs/google/keyword_ideas/live', [
          { keywords: [seed], ...base },
        ]);
        const seen = new Set(collected.map((it) => it.keyword.toLowerCase()));
        for (const it of ideas[0]?.items ?? []) {
          const k = it.keyword?.toLowerCase();
          if (k && !seen.has(k) && isRelevant(k, tokens)) {
            seen.add(k);
            collected.push(it);
          }
        }
      } catch {
        /* ideas lỗi → dùng suggestions đang có */
      }
    }

    // Không có dữ liệu THẬT liên quan → ném lỗi để route hạ cấp sang AI (từ khóa liên quan, ước lượng).
    if (collected.length === 0) {
      throw new Error('DataForSEO không có đủ dữ liệu liên quan cho cụm này.');
    }

    const keywords: KeywordRow[] = collected.map((it) => {
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

interface DataForSeoResult {
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
}
