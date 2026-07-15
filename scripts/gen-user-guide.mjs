// Sinh src/lib/content/user-guide.ts từ docs/user-guide/<locale>.md để hiển thị "Hướng dẫn sử dụng"
// NGAY TRONG phần mềm (menu trái, nhóm Hỗ trợ), đa ngôn ngữ. Chạy lại mỗi khi sửa nội dung .md:
//   node scripts/gen-user-guide.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'docs', 'user-guide');
const out = path.join(root, 'src', 'lib', 'content', 'user-guide.ts');

// Thứ tự locale phải khớp src/i18n (vi là nguồn gốc, en là fallback cho locale chưa có bản dịch).
const LOCALES = ['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'id', 'hi', 'th'];

const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
const map = {};
for (const loc of LOCALES) {
  if (!files.has(loc)) throw new Error(`Thiếu bản dịch: docs/user-guide/${loc}.md`);
  map[loc] = readFileSync(path.join(dir, `${loc}.md`), 'utf8');
}

const ts =
  '// TỰ SINH từ docs/user-guide/<locale>.md — sửa nội dung ở các file .md rồi chạy lại:\n' +
  '//   node scripts/gen-user-guide.mjs\n' +
  '// (nhúng để hiển thị Hướng dẫn sử dụng đa ngôn ngữ ngay trong phần mềm, không cần mở repo).\n' +
  'export const USER_GUIDE_MD: Record<string, string> = ' +
  JSON.stringify(map, null, 0) +
  ';\n\n' +
  '// Lấy tài liệu theo locale, fallback về tiếng Anh rồi tiếng Việt nếu locale chưa có bản dịch.\n' +
  'export function getUserGuideMd(locale: string): string {\n' +
  '  return USER_GUIDE_MD[locale] ?? USER_GUIDE_MD.en ?? USER_GUIDE_MD.vi;\n' +
  '}\n';
writeFileSync(out, ts, 'utf8');
const sizes = LOCALES.map((l) => `${l}:${map[l].length}`).join(' ');
console.log(`Đã sinh ${out} (${LOCALES.length} ngôn ngữ — ${sizes}).`);
