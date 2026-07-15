// Trích văn bản thuần từ NGUỒN có sẵn để AI phân tích & lập khung:
//  • File: txt/md/csv/json/html (đọc trực tiếp), pdf (pdf-parse), docx (mammoth).
//  • URL: tải qua safeFetch (chặn SSRF + giới hạn dung lượng) → bóc text.
// Server-only. Trả { text, title? }. Cắt độ dài để không nhồi quá nhiều vào AI.
import { dedash } from '../content/dedash';
import { safeFetchBuffer } from '../security/safe-fetch';

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_CHARS = 60_000; // đủ để AI phân tích, tránh tốn token vô ích
const NBSP = ' ';

export interface Extracted {
  text: string;
  title?: string;
}

function clip(s: string): string {
  const t = dedash(s) // gạch dài "—/–" → "-" ngay khi import (dán/file/URL)
    .split(NBSP)
    .join(' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => {
      const n = Number(d);
      return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    });
}

function htmlTitle(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return undefined;
  const t = dedash(decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
  return t ? t.slice(0, 200) : undefined;
}

// HTML → text thuần: bỏ các khối không phải nội dung, giữ ngắt dòng theo block.
function htmlToText(html: string): string {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return clip(decodeEntities(s).replace(/[^\S\n]+/g, ' '));
}

async function extractPdf(buffer: Buffer): Promise<Extracted> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const r = await parser.getText();
    return { text: clip(r.text ?? '') };
  } finally {
    try {
      await parser.destroy?.();
    } catch {
      /* bỏ qua */
    }
  }
}

async function extractDocx(buffer: Buffer): Promise<Extracted> {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ buffer });
  return { text: clip(r.value ?? '') };
}

// Trích từ buffer của 1 file đã tải lên (theo đuôi tên file).
export async function extractFromBuffer(filename: string, buffer: Buffer): Promise<Extracted> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return extractPdf(buffer);
  if (ext === 'docx') return extractDocx(buffer);
  if (ext === 'doc') {
    throw new Error('File .doc (Word cũ) chưa hỗ trợ. Hãy lưu lại thành .docx, .pdf hoặc .txt.');
  }
  if (ext === 'html' || ext === 'htm') {
    const html = buffer.toString('utf8');
    return { text: htmlToText(html), title: htmlTitle(html) };
  }
  // txt/md/markdown/csv/json/rtf hoặc không rõ đuôi → coi như văn bản UTF-8.
  return { text: clip(buffer.toString('utf8')) };
}

// Trích từ 1 URL bài viết trên web.
export async function extractFromUrl(url: string): Promise<Extracted> {
  const { buffer, contentType } = await safeFetchBuffer(
    url,
    { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SEO-GEO/1.0; +content-import)' } },
    MAX_FILE_BYTES,
  );
  if (/application\/pdf/i.test(contentType)) return extractPdf(buffer);
  const html = buffer.toString('utf8');
  if (/text\/plain/i.test(contentType)) return { text: clip(html) };
  return { text: htmlToText(html), title: htmlTitle(html) };
}
