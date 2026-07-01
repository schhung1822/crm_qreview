// Interface chung cho nhà cung cấp dữ liệu từ khóa. Đổi provider không đụng tầng trên.
import type { Locale } from '../../i18n/config';

export type Intent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational';

export type Trend = 'up' | 'flat' | 'down';

export interface KeywordRow {
  term: string;
  volume: number;
  difficulty: number; // 0-100 (KD)
  cpc: number; // USD ước lượng
  competition: number; // 0-1 (mức cạnh tranh quảng cáo)
  trend: Trend; // xu hướng 12 tháng
  opportunity: number; // 0-100: điểm cơ hội (volume cao + KD thấp)
  intent: Intent;
  cluster: string;
  isQuestion: boolean; // câu hỏi dạng GEO
  type: 'seo' | 'geo';
}

export interface KeywordResearch {
  seed: string;
  locale: Locale;
  keywords: KeywordRow[];
  clusters: string[];
  estimated: boolean; // true nếu số liệu là ước lượng (chưa cấu hình provider)
}

export interface KeywordProvider {
  research(seed: string, locale: Locale): Promise<KeywordResearch>;
}
