// Heuristic "độ giống AI" - chấm các DẤU HIỆU máy móc dễ nhận (không phải máy dò AI thật sự).
// Mục đích: gợi ý chỗ nên viết lại tự nhiên hơn. Điểm cao = nhiều dấu hiệu máy móc. Server+client an toàn
// (thuần chuỗi, không import fs/node).

export interface AiNessFlag {
  key: 'cliche' | 'transitions' | 'uniformLength' | 'repeatedOpeners';
  count?: number;
  sample?: string;
}
export interface AiNessResult {
  score: number; // 0-100
  flags: AiNessFlag[];
  sentences: number;
}

// Cụm sáo rỗng hay gặp ở văn AI (Anh + Việt). So khớp không phân biệt hoa/thường.
const CLICHES = [
  'in conclusion', "in today's", 'it is important to note', "it's important to note",
  'when it comes to', 'a testament to', 'plays a crucial role', 'plays a vital role',
  'in the realm of', 'delve into', 'tapestry', 'ever-evolving', 'game-changer',
  'harness the power', 'unlock the', 'navigating the', 'in summary', 'the world of',
  'trong thời đại', 'không thể phủ nhận', 'điều quan trọng cần lưu ý', 'đóng vai trò quan trọng',
  'tóm lại', 'trong bối cảnh', 'ngày nay', 'có thể nói rằng', 'nhìn chung',
];
const TRANSITIONS = [
  'moreover', 'furthermore', 'additionally', 'however', 'therefore', 'thus', 'consequently',
  'hơn nữa', 'bên cạnh đó', 'tuy nhiên', 'do đó', 'vì vậy', 'ngoài ra',
];

// Bỏ cú pháp markdown để còn văn bản thô.
function stripMd(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

export function aiNessScore(markdown: string): AiNessResult {
  const text = stripMd(markdown);
  const lower = text.toLowerCase();
  const sentences = text
    .split(/[.!?…]+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
  const flags: AiNessFlag[] = [];
  let score = 0;

  // 1) Cụm sáo rỗng
  let clicheHits = 0;
  for (const c of CLICHES) clicheHits += countOccurrences(lower, c);
  if (clicheHits > 0) {
    flags.push({ key: 'cliche', count: clicheHits });
    score += Math.min(40, clicheHits * 6);
  }

  // 2) Lạm dụng từ nối
  let transHits = 0;
  for (const w of TRANSITIONS) transHits += countOccurrences(lower, w);
  if (sentences.length >= 5 && transHits / sentences.length > 0.15) {
    flags.push({ key: 'transitions', count: transHits });
    score += 15;
  }

  // 3) Độ dài câu quá đều (độ lệch chuẩn thấp)
  if (sentences.length >= 6) {
    const lens = sentences.map((s) => s.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (mean > 8 && sd < mean * 0.35) {
      flags.push({ key: 'uniformLength' });
      score += 20;
    }
  }

  // 4) Nhiều câu mở đầu bằng cùng một từ
  if (sentences.length >= 6) {
    const openers = new Map<string, number>();
    for (const s of sentences) {
      const w = s.split(/\s+/)[0]?.toLowerCase();
      if (w) openers.set(w, (openers.get(w) ?? 0) + 1);
    }
    let top = '';
    let topN = 0;
    for (const [w, n] of openers) if (n > topN) [top, topN] = [w, n];
    if (topN / sentences.length > 0.25) {
      flags.push({ key: 'repeatedOpeners', count: topN, sample: top });
      score += 15;
    }
  }

  return { score: Math.min(100, Math.round(score)), flags, sentences: sentences.length };
}
