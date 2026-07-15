// Xuất hồ sơ style thương hiệu thành Markdown hoặc PROMPT tái sử dụng - THUẦN
// (không I/O) → dùng được cả client (copy/tải file) lẫn server. Nhãn tiêu đề mục
// truyền từ ngoài (client lấy từ i18n socialReport.styleLabels).
import type { SocialStyleProfile } from './types';

export type StyleLabels = Record<string, string>;

// Các mục dạng CHUỖI của hồ sơ, theo thứ tự hiển thị (key = key i18n + key profile).
export const STYLE_TEXT_SECTIONS: Array<keyof SocialStyleProfile & string> = [
  'summary',
  'toneOfVoice',
  'addressing',
  'vocabulary',
  'sentencePatterns',
  'argumentation',
  'contentFormulas',
  'storytelling',
  'signatureTraits',
];

// Markdown gọn gàng theo từng mục - dùng để lưu tài liệu/chia sẻ.
export function buildStyleMarkdown(p: SocialStyleProfile, L: StyleLabels, brand: string): string {
  const lines: string[] = [`# ${L.title}: ${brand}`, ''];
  for (const key of STYLE_TEXT_SECTIONS) {
    const val = p[key];
    if (typeof val !== 'string' || !val) continue;
    lines.push(`## ${L[key]}`, '', val, '');
  }
  if (p.signaturePhrases.length) {
    lines.push(`## ${L.signaturePhrases}`, '');
    for (const s of p.signaturePhrases) lines.push(`- "${s}"`);
    lines.push('');
  }
  if (p.doList.length) {
    lines.push(`## ${L.doList}`, '');
    for (const s of p.doList) lines.push(`- ${s}`);
    lines.push('');
  }
  if (p.dontList.length) {
    lines.push(`## ${L.dontList}`, '');
    for (const s of p.dontList) lines.push(`- ${s}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

// PROMPT tái sử dụng: dán vào system prompt/đầu cuộc hội thoại để AI khác viết đúng
// giọng thương hiệu này. Phần khung bằng ngôn ngữ của hồ sơ (qua nhãn i18n).
export function buildStylePrompt(p: SocialStyleProfile, L: StyleLabels, _brand: string): string {
  // L.promptIntro đã được nội suy {brand} ở phía gọi (next-intl).
  const lines: string[] = [L.promptIntro, ''];
  for (const key of STYLE_TEXT_SECTIONS) {
    const val = p[key];
    if (typeof val !== 'string' || !val) continue;
    lines.push(`${L[key]}: ${val}`, '');
  }
  if (p.signaturePhrases.length)
    lines.push(`${L.signaturePhrases}:`, ...p.signaturePhrases.map((s) => `- "${s}"`), '');
  if (p.doList.length) lines.push(`${L.doList}:`, ...p.doList.map((s) => `- ${s}`), '');
  if (p.dontList.length) lines.push(`${L.dontList}:`, ...p.dontList.map((s) => `- ${s}`), '');
  lines.push(L.promptOutro);
  return lines.join('\n').trimEnd() + '\n';
}

// Tên file .md an toàn.
export function styleFileName(brand: string): string {
  const base =
    brand
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'brand';
  return `brand-style-${base}.md`;
}
