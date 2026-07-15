// Xuất 1 bài viết ra file .txt hoặc .doc để lưu lại. Thuần (không phụ thuộc browser) → test được.
// .doc = HTML gói theo chuẩn Word (mime application/msword) → mở được bằng Word / Google Docs.
import { markdownToHtml } from '../content/markdown';

export interface ExportArticle {
  title: string;
  metaDescription?: string;
  slug?: string;
  targetKeyword?: string;
  tags?: string[];
  markdown: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Tên file an toàn từ tiêu đề: bỏ dấu, chỉ [a-z0-9-], tối đa 60 ký tự.
export function exportFileName(title: string, ext: 'txt' | 'doc'): string {
  const base =
    (title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'bai-viet';
  return `${base}.${ext}`;
}

// .txt: tiêu đề + khối metadata gọn + thân bài (Markdown giữ nguyên, dễ đọc & không mất gì).
export function buildTxt(a: ExportArticle): string {
  const lines: string[] = [];
  if (a.title.trim()) lines.push(a.title.trim(), '');
  const meta: string[] = [];
  if (a.targetKeyword?.trim()) meta.push(`Từ khóa: ${a.targetKeyword.trim()}`);
  if (a.metaDescription?.trim()) meta.push(`Meta: ${a.metaDescription.trim()}`);
  if (a.tags?.length) meta.push(`Thẻ: ${a.tags.join(', ')}`);
  if (a.slug?.trim()) meta.push(`Slug: ${a.slug.trim()}`);
  if (meta.length) lines.push(...meta, '');
  lines.push(a.markdown.trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// .doc: HTML gói theo namespace Word → Word/Google Docs mở như tài liệu có định dạng.
export function buildDoc(a: ExportArticle): string {
  const body = markdownToHtml(a.markdown);
  const metaRows: string[] = [];
  if (a.targetKeyword?.trim()) metaRows.push(`<p><b>Từ khóa:</b> ${esc(a.targetKeyword.trim())}</p>`);
  if (a.metaDescription?.trim()) metaRows.push(`<p><b>Meta:</b> ${esc(a.metaDescription.trim())}</p>`);
  if (a.tags?.length) metaRows.push(`<p><b>Thẻ:</b> ${esc(a.tags.join(', '))}</p>`);
  const titleHtml = a.title.trim() ? `<h1>${esc(a.title.trim())}</h1>` : '';
  const metaBlock = metaRows.length ? `${metaRows.join('')}<hr/>` : '';
  return (
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${esc(a.title.trim() || 'Bài viết')}</title></head>` +
    `<body>${titleHtml}${metaBlock}${body}</body></html>`
  );
}

// MIME cho từng định dạng (dùng khi tạo Blob / upload).
export const EXPORT_MIME = {
  txt: 'text/plain;charset=utf-8',
  doc: 'application/msword',
} as const;

export function buildExport(a: ExportArticle, ext: 'txt' | 'doc'): string {
  return ext === 'txt' ? buildTxt(a) : buildDoc(a);
}
