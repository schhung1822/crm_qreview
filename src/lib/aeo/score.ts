// Chấm điểm AEO (Answer Engine Optimization) - tối ưu để nội dung được chọn làm
// CÂU TRẢ LỜI TRỰC TIẾP ở answer engine: featured snippet, People Also Ask, trợ lý
// giọng nói (Google Assistant/Siri/Alexa), answer box.
//
// AEO khác GEO: GEO = được LLM (ChatGPT/Perplexity…) TRÍCH DẪN khi tổng hợp; AEO =
// được công cụ LẤY NGUYÊN làm câu trả lời. Vì vậy AEO nhấn mạnh tính "rút-trích-được":
// trả lời thẳng & sớm, độ dài cỡ snippet, heading dạng câu hỏi, FAQ, định nghĩa, các
// bước How-To, list/bảng, và khớp truy vấn ↔ câu trả lời.
import {
  computeScore,
  fold,
  type ArticleInput,
  type ScoreCheck,
  type ScoreResult,
} from '../scoring/types';
import { markersFor } from '../scoring/markers';

function subheadings(md: string): string[] {
  return [...md.matchAll(/^#{2,3}\s+(.*)$/gm)].map((m) => m[1]);
}

// Các đoạn văn (bỏ heading, list, bảng, blockquote).
function paragraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^[#>|]/.test(p) && !/^[-*]\s/.test(p) && !/^\d+\.\s/.test(p));
}

// Số bước trong danh sách đánh số liên tiếp (How-To).
function maxOrderedRun(md: string): number {
  let best = 0;
  let cur = 0;
  for (const line of md.split('\n')) {
    if (/^\s*\d+\.\s+\S/.test(line)) best = Math.max(best, ++cur);
    else if (line.trim() === '') continue;
    else cur = 0;
  }
  return best;
}

// Khớp keyword bỏ dấu - DÙNG CHUNG fold() với SEO để điểm không lệch giữa 2 module.
const norm = fold;

export function scoreAeo(a: ArticleInput): ScoreResult {
  const md = a.markdown;
  const lower = md.toLowerCase();
  const M = markersFor(a.locale);
  const heads = subheadings(md);
  const paras = paragraphs(md);
  const firstPara = paras[0] ?? '';

  // 1) Trả lời thẳng & SỚM: đoạn đầu là câu trả lời ngắn gọn, tự đứng độc lập. Đạt nếu CÓ marker,
  // hoặc đủ độ dài VÀ chứa từ khóa (không cho điểm oan đoạn mở đầu lan man). Không có từ khóa → xét
  // độ dài như cũ.
  const kwFold = fold((a.targetKeyword ?? '').trim());
  const auLenOk = firstPara.length >= 40 && firstPara.length <= 360;
  const answerUpfront =
    M.quickAnswer.test(firstPara) || (auLenOk && (!kwFold || fold(firstPara).includes(kwFold)));

  // 2) Có đoạn ĐÚNG TẦM SNIPPET (~40–60 từ ≈ 250–340 ký tự) để engine lấy nguyên.
  const snippetPara = paras.some((p) => {
    const words = p.split(/\s+/).length;
    return words >= 35 && words <= 65;
  });

  // 3) Heading dạng câu hỏi (khớp People Also Ask).
  const questionHeads = heads.filter(
    (h) => /[?？]\s*$/.test(h.trim()) || M.question.test(h),
  ).length;

  // 4) Khối Q&A / FAQ (FAQPage schema).
  const hasQAText = /[?？]\s*\n/.test(md) || /##[^\n]*[?？]/.test(md) || /faq/i.test(md);

  // 5) Định nghĩa rõ ("X là …" / "X is …") - cho definition snippet + voice.
  const hasDefinition = M.entity.test(lower);

  // 6) List và/hoặc bảng (list & table snippet).
  const hasList = /^[-*]\s|\n\d+\.\s/m.test(md);
  const hasTable = /\|.*\|/.test(md);

  // 7) Các bước How-To (HowTo rich result) - danh sách đánh số ≥3 bước.
  const steps = maxOrderedRun(md);

  // 8) Khớp truy vấn ↔ trả lời: target keyword nằm ở heading HOẶC đoạn trả lời đầu.
  const kw = a.targetKeyword ? norm(a.targetKeyword) : '';
  const kwInHeadOrAnswer =
    !!kw && (heads.some((h) => norm(h).includes(kw)) || norm(firstPara).includes(kw));
  const kwInBody = !!kw && norm(md).includes(kw);

  // 9) Khối tóm tắt/Key takeaways (rút-trích nhanh + voice).
  const hasSummary = M.quickAnswer.test(lower);

  // 10) Câu trả lời súc tích, dễ quét: phần lớn đoạn KHÔNG quá dài (≤ ~600 ký tự).
  const concise =
    paras.length === 0 ? false : paras.filter((p) => p.length <= 600).length / paras.length >= 0.6;

  const checks: ScoreCheck[] = [
    {
      id: 'answerUpfront',
      label: 'Trả lời trực tiếp ngay đầu bài',
      weight: 16,
      state: answerUpfront ? 'pass' : 'fail',
    },
    {
      id: 'snippetLength',
      label: 'Có đoạn đúng tầm featured snippet (~40–60 từ)',
      weight: 10,
      state: snippetPara ? 'pass' : 'warn',
    },
    {
      id: 'questionHeadings',
      label: 'Heading dạng câu hỏi (People Also Ask)',
      weight: 12,
      state: questionHeads >= 2 ? 'pass' : questionHeads === 1 ? 'warn' : 'fail',
    },
    {
      id: 'faq',
      label: 'Khối FAQ/Q&A (FAQPage schema)',
      weight: 12,
      state: a.hasFaqSchema ? 'pass' : hasQAText ? 'warn' : 'fail',
    },
    {
      id: 'definition',
      label: 'Định nghĩa trực tiếp cho định nghĩa/voice',
      weight: 9,
      state: hasDefinition ? 'pass' : 'warn',
    },
    {
      id: 'listOrTable',
      label: 'List/bảng dễ rút làm snippet',
      weight: 9,
      state: hasList || hasTable ? 'pass' : 'fail',
    },
    {
      id: 'howto',
      label: 'Các bước How-To (≥3 bước đánh số)',
      weight: 8,
      state: steps >= 3 ? 'pass' : 'warn',
    },
    {
      id: 'queryMatch',
      label: 'Truy vấn khớp câu trả lời (keyword ở heading/đầu bài)',
      weight: 9,
      state: kwInHeadOrAnswer ? 'pass' : kwInBody ? 'warn' : 'fail',
    },
    {
      id: 'summary',
      label: 'Có khối tóm tắt/Key takeaways',
      weight: 7,
      state: hasSummary ? 'pass' : 'warn',
    },
    {
      id: 'concise',
      label: 'Câu trả lời súc tích, dễ quét',
      weight: 8,
      state: concise ? 'pass' : 'warn',
    },
  ];

  return computeScore(checks);
}
