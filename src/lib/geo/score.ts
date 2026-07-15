// Chấm điểm GEO theo docs/SEO-GEO-CHECKLIST.md (mục B + C). Hàm thuần, testable.
import {
  computeScore,
  fold,
  type ArticleInput,
  type ScoreCheck,
  type ScoreResult,
} from '../scoring/types';
import { markersFor } from '../scoring/markers';

// Heading text (H2/H3).
function subheadings(md: string): string[] {
  return [...md.matchAll(/^#{2,3}\s+(.*)$/gm)].map((m) => m[1]);
}

// Citation NGOÀI thật: link markdown [text](https://...) - không tính ảnh, không tính
// internal link tương đối (/path). Đây mới là "dẫn nguồn".
function hasExternalCitation(md: string): boolean {
  return /(^|[^!])\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(md);
}

// Đếm điểm dữ liệu định lượng THẬT - fact mà AI hay trích. Tránh dương tính giả:
// KHÔNG tính năm 19xx/20xx đứng một mình (vd "2020", "thành lập 2010").
function statsCount(md: string): number {
  let n = 0;
  // Phần trăm: 75% / 12,5 %
  n += (md.match(/\d+(?:[.,]\d+)?\s?%/g) ?? []).length;
  // Số có dấu phân nhóm hàng nghìn: 1,000 / 1.000.000
  n += (md.match(/\b\d{1,3}(?:[.,]\d{3})+\b/g) ?? []).length;
  // Số kèm đơn vị độ lớn / tiền tệ
  n += (
    md.match(
      /\b\d+(?:[.,]\d+)?\s?(?:triệu|tỷ|tỉ|nghìn|ngàn|million|billion|thousand|usd|vnd|đ|\$|€|£|¥)/gi,
    ) ?? []
  ).length;
  // Số nguyên ≥4 chữ số NHƯNG loại năm 19xx/20xx (giữ lại "50000", "12345").
  n += (md.match(/\b\d{4,}\b/g) ?? []).filter((s) => !/^(?:19|20)\d{2}$/.test(s)).length;
  return n;
}

export function scoreGeo(a: ArticleInput): ScoreResult {
  const md = a.markdown;
  const lower = md.toLowerCase();
  const M = markersFor(a.locale);
  const firstParagraph = md.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith('#')) ?? '';

  // Đoạn "trả lời nhanh": đạt nếu CÓ marker (Trả lời nhanh/TL;DR…), HOẶC đoạn đầu đúng tầm độ dài
  // VÀ chứa từ khóa (tránh cho điểm oan một đoạn mở đầu lan man bất kỳ chỉ vì đủ dài). Không có
  // từ khóa thì quay về xét độ dài (tương thích cũ).
  const kwFold = fold((a.targetKeyword ?? '').trim());
  const qaLenOk = firstParagraph.length > 40 && firstParagraph.length < 320;
  const hasQuickAnswer =
    M.quickAnswer.test(firstParagraph) ||
    (qaLenOk && (!kwFold || fold(firstParagraph).includes(kwFold)));
  // Q&A: có dấu hỏi (cả ？ full-width) ở heading/đoạn, hoặc mục FAQ.
  const hasQA = /[?？]\s*\n/.test(md) || /##[^\n]*[?？]/.test(md) || /faq/i.test(md);
  const hasList = /^[-*]\s|\n\d+\.\s/m.test(md);
  const hasTable = /\|.*\|/.test(md);
  // Tín hiệu CẬP NHẬT thật: từ "updated/cập nhật/mới nhất" (theo locale), hoặc năm
  // GẮN VỚI ngữ cảnh cập nhật/bản quyền - KHÔNG tính năm trần ("thành lập 2010").
  const hasDate =
    M.update.test(lower) ||
    /(?:©|\(c\))\s*20\d{2}\b/.test(md) ||
    /(?:updated|last updated|as of|cập nhật|tính đến|hiện tại|tại thời điểm)[^\n]{0,24}\b20\d{2}\b/i.test(
      lower,
    ) ||
    /\b20\d{2}\b[^\n]{0,24}(?:updated|cập nhật)/i.test(lower);
  const heads = subheadings(md);
  const questionHeads = heads.filter((h) => /[?？]\s*$/.test(h.trim()) || M.question.test(h)).length;

  const checks: ScoreCheck[] = [
    {
      id: 'quotable',
      label: 'Có đoạn trả lời ngắn trích-dẫn-được',
      weight: 14,
      state: hasQuickAnswer ? 'pass' : 'fail',
    },
    {
      id: 'qa',
      label: 'Cấu trúc Q&A trực tiếp',
      weight: 10,
      state: hasQA ? 'pass' : 'warn',
    },
    {
      id: 'entity',
      label: 'Định nghĩa rõ thực thể/khái niệm',
      weight: 8,
      state: M.entity.test(lower) ? 'pass' : 'warn',
    },
    {
      id: 'sources',
      label: 'Dẫn chứng có nguồn (link ngoài)',
      weight: 12,
      state: hasExternalCitation(md) ? 'pass' : 'fail',
    },
    {
      id: 'format',
      label: 'Định dạng dễ trích (list/bảng)',
      weight: 9,
      state: hasList || hasTable ? 'pass' : 'fail',
    },
    {
      id: 'schema',
      label: 'Có FAQ/structured data',
      weight: 9,
      state: a.hasFaqSchema ? 'pass' : 'fail',
    },
    {
      id: 'stats',
      label: 'Có số liệu/dữ liệu cụ thể',
      weight: 7,
      state: statsCount(md) >= 2 ? 'pass' : 'warn',
    },
    {
      id: 'questionHeading',
      label: 'Có heading dạng câu hỏi',
      weight: 6,
      state: questionHeads >= 1 ? 'pass' : 'warn',
    },
    {
      id: 'freshness',
      label: 'Tín hiệu cập nhật (năm / last updated)',
      weight: 7,
      state: hasDate ? 'pass' : 'warn',
    },
    {
      id: 'completeness',
      label: 'Bao phủ câu hỏi liên quan',
      weight: 8,
      state: (md.match(/^#{2,3}\s/gm) ?? []).length >= 4 ? 'pass' : 'warn',
    },
  ];

  // Tiêu chí đa ngôn ngữ (mục C) chỉ áp khi bài thuộc TranslationGroup.
  // hreflang KHÔNG phải thuộc tính của nội dung - hệ thống TỰ SINH khi publish từ
  // TranslationGroup (buildHreflang). Vì vậy mặc định 'pass' (không cap GEO mãi ở <100);
  // chỉ 'warn' khi caller xác nhận thiếu/đối xứng sai (hreflangOk === false).
  if (a.inTranslationGroup) {
    const ok = a.hreflangOk !== false;
    checks.push({
      id: 'hreflang',
      label: 'hreflang đối xứng giữa các bản dịch',
      weight: 12,
      state: ok ? 'pass' : 'warn',
      detail: a.hreflangOk === undefined ? 'Tự sinh khi publish từ TranslationGroup.' : undefined,
    });
  }

  return computeScore(checks);
}
