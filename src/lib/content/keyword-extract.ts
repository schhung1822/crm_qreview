// Trích target keyword từ tiêu đề + nội dung bài (heuristic thuần, không cần AI).
// Ý tưởng: cụm 2–3 từ xuất hiện nhiều, ưu tiên cụm có trong tiêu đề; lọc stopword.
const VI_STOP = new Set([
  'và', 'là', 'của', 'có', 'cho', 'các', 'được', 'một', 'những', 'với', 'để', 'khi',
  'trong', 'người', 'này', 'đó', 'như', 'về', 'bạn', 'bài', 'viết', 'cách', 'thì', 'mà',
  'ở', 'từ', 'sẽ', 'đã', 'không', 'rất', 'hơn', 'nên', 'vì', 'theo', 'cùng', 'hay',
  'hoặc', 'nếu', 'sau', 'trước', 'trên', 'dưới', 'ra', 'vào', 'lại', 'còn', 'đến', 'tại',
  'bởi', 'do', 'cũng', 'thế', 'nào', 'gì', 'ai', 'phải', 'đây',
]);
const EN_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'be',
  'this', 'that', 'your', 'you', 'how', 'what', 'why', 'it', 'as', 'at', 'by', 'from', 'we',
  'our', 'can', 'will', 'guide', 'article', 'best', 'top', 'complete', 'about',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const isStop = (w: string) => VI_STOP.has(w) || EN_STOP.has(w);
const badWord = (w: string) => w.length < 2 || isStop(w) || /^\d+$/.test(w);

// Sinh danh sách cụm từ ỨNG VIÊN làm target keyword (2–4 từ, có nghĩa, ưu tiên cụm
// xuất hiện nhiều + có trong tiêu đề). Dùng để chọn keyword tối ưu điểm số.
export function candidateKeywords(title: string, markdown: string, topK = 8): string[] {
  const tokens = tokenize(markdown);
  const titleTokens = new Set(tokenize(title));
  const counts = new Map<string, number>();
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (gram.some(badWord)) continue;
      const key = gram.join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const scored = [...counts.entries()].map(([phrase, count]) => {
    const words = phrase.split(' ');
    const inTitle = words.every((w) => titleTokens.has(w)) ? 2 : words.some((w) => titleTokens.has(w)) ? 1 : 0;
    return { phrase, score: count + inTitle * 3 + words.length * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, topK).map((s) => s.phrase);
  const tw = tokenize(title).filter((w) => !badWord(w));
  if (tw.length) out.push(tw.slice(0, 3).join(' '));
  return [...new Set(out)].filter(Boolean);
}

export function extractKeywordHeuristic(title: string, markdown: string): string {
  const tokens = tokenize(markdown);
  const titleTokens = new Set(tokenize(title));
  const counts = new Map<string, number>();

  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (gram.some(badWord)) continue;
      const key = gram.join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  let best = '';
  let bestScore = -1;
  for (const [phrase, count] of counts) {
    const words = phrase.split(' ');
    const inTitle = words.every((w) => titleTokens.has(w))
      ? 2
      : words.some((w) => titleTokens.has(w))
        ? 1
        : 0;
    const score = count + inTitle * 3 + words.length * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = phrase;
    }
  }
  if (best) return best;

  // Fallback: lấy 2–3 từ "có nghĩa" đầu tiên trong tiêu đề.
  const tw = tokenize(title).filter((w) => !badWord(w));
  return tw.slice(0, 3).join(' ') || title.slice(0, 40).trim();
}
