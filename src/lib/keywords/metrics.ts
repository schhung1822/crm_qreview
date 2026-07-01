// Chỉ số phái sinh dùng chung cho mọi provider keyword.
import type { Intent, Trend } from './types';

// Điểm cơ hội 0-100: ưu tiên volume cao + độ khó (KD) thấp.
// Dùng log volume để head-term không áp đảo, rồi nhân hệ số dễ (1 - KD/100).
export function opportunityScore(volume: number, difficulty: number): number {
  const volScore = Math.min(1, Math.log10(Math.max(1, volume)) / 4); // ~10k → 1.0
  const ease = 1 - Math.min(100, Math.max(0, difficulty)) / 100;
  return Math.round(volScore * ease * 100);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Ước lượng chỉ số (volume/KD/CPC/cạnh tranh/trend) cho 1 từ khóa khi CHƯA có provider
// dữ liệu thật. Heuristic minh bạch, KHÔNG phải số liệu thật (estimated=true).
// Dùng chung cho mock lẫn provider AI để nhất quán.
export function estimateMetrics(
  seed: string,
  term: string,
  intent: Intent,
  isQuestion: boolean,
): { volume: number; difficulty: number; cpc: number; competition: number; trend: Trend } {
  const r = hash(`${seed.trim().toLowerCase()}|${term.trim().toLowerCase()}`);
  const words = term.trim().split(/\s+/).filter(Boolean).length || 1;
  const headBoost = term.trim().toLowerCase() === seed.trim().toLowerCase() ? 6 : 1;
  const qPenalty = isQuestion ? 0.7 : 1; // câu hỏi long-tail → volume thấp hơn chút
  const lengthPenalty = Math.max(0.25, 1 - (words - 2) * 0.14);
  const volume = Math.round(((180 + (r % 5200)) * lengthPenalty * headBoost * qPenalty) / 10) * 10;

  const intentKd = intent === 'transactional' ? 22 : intent === 'commercial' ? 14 : 0;
  const difficulty = Math.min(95, Math.max(5, 18 + (r % 45) + intentKd - (words - 2) * 6));

  const cpcBase = intent === 'transactional' ? 1.2 : intent === 'commercial' ? 0.8 : 0.2;
  const cpc = Number((cpcBase + (r % 380) / 100).toFixed(2));

  const competition = Number(Math.min(1, (difficulty / 100) * 0.7 + (r % 40) / 100).toFixed(2));

  const trend: Trend = /20(2[6-9]|3\d)|new|mới|xu hướng|trend|ai/i.test(term)
    ? 'up'
    : r % 5 === 0
      ? 'down'
      : 'flat';

  return { volume, difficulty, cpc, competition, trend };
}
