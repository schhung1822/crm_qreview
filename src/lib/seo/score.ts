// Chấm điểm SEO on-page theo docs/SEO-GEO-CHECKLIST.md (mục A). Hàm thuần, testable.
import {
  computeScore,
  countKeyword,
  fold,
  type ArticleInput,
  type ScoreCheck,
  type ScoreResult,
} from '../scoring/types';

const wordCount = (md: string) => md.trim().split(/\s+/).filter(Boolean).length;
const headingCount = (md: string) => (md.match(/^#{2,3}\s/gm) ?? []).length;

// Văn bản các heading H2/H3 (đã fold để so khớp keyword không lệ thuộc dấu).
function subheadings(md: string): string[] {
  return [...md.matchAll(/^#{2,3}\s+(.*)$/gm)].map((m) => fold(m[1]));
}

// Có internal link tương đối [text](/path | #anchor) - không tính ảnh.
function internalLinkCount(md: string): number {
  const m = md.match(/(^|[^!])\[[^\]]+\]\((\/[^)]*|#[^)]*)\)/g);
  return m ? m.length : 0;
}

// Có outbound link ra ngoài [text](https://...) - không tính ảnh.
function hasOutbound(md: string): boolean {
  return /(^|[^!])\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(md);
}

export function scoreSeo(a: ArticleInput): ScoreResult {
  // Khớp keyword KHÔNG lệ thuộc dấu (đồng bộ với AEO) - fold cả keyword lẫn văn bản.
  const kw = fold((a.targetKeyword ?? '').trim());
  const md = a.markdown;
  const mdFold = fold(md);
  const first100 = mdFold.split(/\s+/).slice(0, 100).join(' ');
  const meta = a.metaDescription ?? '';
  const metaFold = fold(meta);
  const titleFold = fold(a.title);
  const slugFold = fold(a.slug ?? '');
  const internal = a.internalLinkCount ?? internalLinkCount(md);
  const words = wordCount(md);
  const density = kw && words ? (countKeyword(mdFold, kw) * (kw.split(/\s+/).length || 1)) / words : 0;

  const checks: ScoreCheck[] = [
    {
      id: 'title',
      label: 'Title ≤ 60 ký tự, có target keyword',
      weight: 12,
      state:
        a.title.length > 0 && a.title.length <= 60 && (!kw || titleFold.includes(kw))
          ? 'pass'
          : a.title.length <= 70
            ? 'warn'
            : 'fail',
    },
    {
      id: 'meta',
      label: 'Meta description 120–155 ký tự',
      weight: 8,
      state:
        meta.length >= 120 && meta.length <= 155
          ? 'pass'
          : meta.length > 0 && meta.length <= 170
            ? 'warn'
            : 'fail',
    },
    {
      id: 'kwInMeta',
      label: 'Keyword trong meta description',
      weight: 5,
      state: !kw ? 'pass' : metaFold.includes(kw) ? 'pass' : 'warn',
    },
    {
      id: 'slug',
      label: 'Slug ngắn, có keyword',
      weight: 6,
      state:
        slugFold.length > 0 && slugFold.length <= 60 && (!kw || slugFold.includes(kw.replace(/\s+/g, '-')))
          ? 'pass'
          : slugFold.length > 0 && slugFold.length <= 60
            ? 'warn'
            : 'fail',
    },
    {
      id: 'headings',
      label: 'Có heading H2/H3 phân cấp',
      weight: 8,
      state: headingCount(md) >= 3 ? 'pass' : headingCount(md) >= 1 ? 'warn' : 'fail',
    },
    {
      id: 'kwInHeading',
      label: 'Keyword xuất hiện trong ≥ 1 heading',
      weight: 7,
      state: !kw ? 'pass' : subheadings(md).some((h) => h.includes(kw)) ? 'pass' : 'warn',
    },
    {
      id: 'kwFirst100',
      label: 'Keyword xuất hiện trong 100 từ đầu',
      weight: 8,
      state: !kw || first100.includes(kw) ? 'pass' : 'fail',
    },
    {
      id: 'coverage',
      label: 'Độ dài bài đủ phủ chủ đề (≥ 800 từ)',
      weight: 12,
      state: words >= 800 ? 'pass' : words >= 400 ? 'warn' : 'fail',
    },
    {
      id: 'internalLinks',
      label: 'Có ≥ 2 internal link',
      weight: 8,
      state: internal >= 2 ? 'pass' : internal === 1 ? 'warn' : 'fail',
    },
    {
      id: 'outbound',
      label: 'Có link ra nguồn ngoài uy tín',
      weight: 6,
      state: hasOutbound(md) ? 'pass' : 'warn',
    },
    {
      id: 'images',
      label: 'Có hình ảnh kèm alt',
      weight: 7,
      state: /!\[[^\]]+\]\([^)]+\)/.test(md) ? 'pass' : 'fail',
    },
    {
      id: 'readability',
      label: 'Đoạn văn ngắn, dễ đọc',
      weight: 5,
      state: avgParagraphWords(md) <= 80 ? 'pass' : 'warn',
    },
    {
      id: 'density',
      label: 'Mật độ keyword hợp lý (không nhồi)',
      weight: 4,
      state: !kw ? 'pass' : density <= 0.035 ? 'pass' : 'warn',
      detail: kw ? `${(density * 100).toFixed(1)}%` : undefined,
    },
  ];

  return computeScore(checks);
}

function avgParagraphWords(md: string): number {
  const paras = md.split(/\n{2,}/).filter((p) => p.trim() && !p.startsWith('#'));
  if (!paras.length) return 0;
  const total = paras.reduce((s, p) => s + wordCount(p), 0);
  return total / paras.length;
}
