// Chọn TARGET KEYWORD tối ưu cho một bài: thử nhiều cụm ứng viên (từ nội dung + keyword
// hiện tại) và chọn cụm cho TỔNG điểm SEO + AEO + GEO cao nhất. Nhờ vậy keyword bám theo
// nội dung thật của bài thay vì cố định - và đạt điểm cao nhất có thể.
import { scoreAeo } from '../aeo/score';
import { candidateKeywords, extractKeywordHeuristic } from '../content/keyword-extract';
import { scoreGeo } from '../geo/score';
import { scoreSeo } from '../seo/score';
import { buildScoreInput } from './types';

export function pickBestKeyword(input: {
  title: string;
  markdown: string;
  metaDescription?: string;
  slug?: string;
  locale: string;
  current?: string;
}): string {
  const cand = new Set<string>();
  if (input.current && input.current.trim()) cand.add(input.current.trim());
  const heur = extractKeywordHeuristic(input.title, input.markdown);
  if (heur) cand.add(heur);
  for (const c of candidateKeywords(input.title, input.markdown, 8)) cand.add(c);

  const list = [...cand]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60);
  if (list.length === 0) return (input.current ?? '').trim();

  let best = list[0];
  let bestScore = -1;
  for (const kw of list) {
    const si = buildScoreInput({
      title: input.title,
      metaDescription: input.metaDescription,
      slug: input.slug,
      markdown: input.markdown,
      locale: input.locale,
      targetKeyword: kw,
    });
    const total = scoreSeo(si).score + scoreAeo(si).score + scoreGeo(si).score;
    // Hơn điểm → chọn; bằng điểm → ưu tiên cụm DÀI hơn (cụ thể hơn, target tốt hơn).
    if (total > bestScore || (total === bestScore && kw.length > best.length)) {
      bestScore = total;
      best = kw;
    }
  }
  return best;
}
