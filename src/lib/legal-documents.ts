import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type LegalDocumentKind = 'term' | 'privacy';
export type LegalLanguage = 'vi' | 'en';

export interface LegalParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface LegalListBlock {
  type: 'list';
  items: string[];
}

export type LegalBlock = LegalParagraphBlock | LegalListBlock;

export interface LegalSection {
  number: string;
  title: string;
  level: number;
  blocks: LegalBlock[];
}

export interface LegalLanguageContent {
  sections: LegalSection[];
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  sourceTitle: string;
  effectiveDate: string;
  lastUpdated: string;
  languages: Record<LegalLanguage, LegalLanguageContent>;
}

const PUBLIC_CONTACT_EMAIL = 'qreview.asia@gmail.com';
const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+)$/;
const NESTED_HEADING_RE = /^(\d+\.\d+(?:\.\d+)*)\.?\s+(.+)$/;
const FILES: Record<LegalDocumentKind, string> = {
  term: 'term.md',
  privacy: 'privacy.md',
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function toIsoDate(value: string): string {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return value.trim();

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return value.trim();

  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function publicText(value: string): string {
  return value
    .replaceAll('[CONTACT_EMAIL]', PUBLIC_CONTACT_EMAIL)
    .replace(
      /Qreview\s*\/\s*\[LEGAL_ENTITY_NAME\]\s*\((?:if applicable|nếu có)\)/gi,
      'Qreview',
    )
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function isListTerminator(value: string): boolean {
  return /[.!?]["')\]]?$/.test(value.trim());
}

function parseBlocks(paragraphs: string[]): LegalBlock[] {
  const blocks: LegalBlock[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = publicText(paragraphs[index]);
    if (!paragraph) continue;

    // Hai tài liệu dùng các đoạn ngăn bằng dòng trắng thay cho cú pháp Markdown "-".
    // Một câu kết thúc bằng dấu hai chấm mở đầu danh sách; mục cuối kết thúc bằng dấu chấm.
    if (paragraph.endsWith(':')) {
      const items: string[] = [];
      let cursor = index + 1;

      while (cursor < paragraphs.length) {
        const item = publicText(paragraphs[cursor]);
        if (!item || item.includes('\n')) break;
        items.push(item);
        cursor += 1;
        if (isListTerminator(item)) break;
      }

      if (items.length >= 2) {
        blocks.push({ type: 'paragraph', text: paragraph }, { type: 'list', items });
        index = cursor - 1;
        continue;
      }
    }

    blocks.push({ type: 'paragraph', text: paragraph });
  }

  return blocks;
}

function parseLanguage(source: string): LegalLanguageContent {
  const chunks = source
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const sections: LegalSection[] = [];
  let current: { number: string; title: string; paragraphs: string[] } | null = null;

  for (const chunk of chunks) {
    const singleLine = chunk.replace(/\s*\n\s*/g, ' ').trim();
    const heading =
      singleLine.match(NESTED_HEADING_RE) ?? singleLine.match(TOP_LEVEL_HEADING_RE);

    if (heading) {
      if (current) {
        sections.push({
          number: current.number,
          title: current.title,
          level: current.number.split('.').length,
          blocks: parseBlocks(current.paragraphs),
        });
      }

      current = {
        number: heading[1],
        title: publicText(heading[2]),
        paragraphs: [],
      };
      continue;
    }

    if (current) current.paragraphs.push(chunk);
  }

  if (current) {
    sections.push({
      number: current.number,
      title: current.title,
      level: current.number.split('.').length,
      blocks: parseBlocks(current.paragraphs),
    });
  }

  if (!sections.length)
    throw new Error('Legal document does not contain numbered sections.');
  return { sections };
}

function readHeaderValue(source: string, label: string): string {
  const line = source
    .split('\n')
    .find((entry) => entry.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (!line) throw new Error(`Legal document is missing "${label}".`);
  return line.slice(line.indexOf(':') + 1).trim();
}

async function readLegalSource(kind: LegalDocumentKind): Promise<string> {
  // Giữ từng đường dẫn ở dạng literal để Turbopack chỉ trace đúng hai file tài liệu, thay vì coi
  // đây là truy cập filesystem động và đóng gói toàn bộ project vào server output.
  if (kind === 'term') return readFile(path.join(process.cwd(), 'term.md'), 'utf8');
  return readFile(path.join(process.cwd(), 'privacy.md'), 'utf8');
}

export async function loadLegalDocument(kind: LegalDocumentKind): Promise<LegalDocument> {
  const source = (await readLegalSource(kind)).replace(/\r\n?/g, '\n').trim();
  const lines = source.split('\n');
  const englishMarker = lines.findIndex((line) => line.trim() === 'English');
  const vietnameseMarker = lines.findIndex((line) => line.trim() === 'Tiếng Việt');

  if (englishMarker < 0 || vietnameseMarker <= englishMarker) {
    throw new Error(`${FILES[kind]} must contain English and Tiếng Việt sections.`);
  }

  return {
    kind,
    sourceTitle: lines[0].trim(),
    effectiveDate: toIsoDate(readHeaderValue(source, 'Effective date')),
    lastUpdated: toIsoDate(readHeaderValue(source, 'Last updated')),
    languages: {
      en: parseLanguage(lines.slice(englishMarker + 1, vietnameseMarker).join('\n')),
      vi: parseLanguage(lines.slice(vietnameseMarker + 1).join('\n')),
    },
  };
}
