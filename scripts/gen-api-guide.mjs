// Sinh src/lib/admin/api-guide.ts từ docs/api-guide/<locale>.md để hiển thị tài liệu API
// NGAY TRONG Quản trị nền tảng (tab API), đa ngôn ngữ. Chạy lại mỗi khi sửa nội dung .md:
//   node scripts/gen-api-guide.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'docs', 'api-guide');
const out = path.join(root, 'src', 'lib', 'admin', 'api-guide.ts');

// Thứ tự locale phải khớp src/i18n (vi là nguồn gốc, en là fallback cho locale chưa có bản dịch).
const LOCALES = ['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'id', 'hi', 'th'];

const files = new Set(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
const map = {};
for (const loc of LOCALES) {
  if (!files.has(loc)) throw new Error(`Thiếu bản dịch: docs/api-guide/${loc}.md`);
  map[loc] = readFileSync(path.join(dir, `${loc}.md`), 'utf8');
}

const ts =
  '// TỰ SINH từ docs/api-guide/<locale>.md — sửa nội dung ở các file .md rồi chạy lại:\n' +
  '//   node scripts/gen-api-guide.mjs\n' +
  '// (nhúng để hiển thị tài liệu API đa ngôn ngữ ngay trong Quản trị nền tảng, không cần mở repo).\n' +
  'export const API_GUIDE_MD: Record<string, string> = ' +
  JSON.stringify(map, null, 0) +
  ';\n\n' +
  '// Lấy tài liệu theo locale, fallback về tiếng Anh rồi tiếng Việt nếu locale chưa có bản dịch.\n' +
  'export function getApiGuideMd(locale: string): string {\n' +
  '  return API_GUIDE_MD[locale] ?? API_GUIDE_MD.en ?? API_GUIDE_MD.vi;\n' +
  '}\n';
writeFileSync(out, ts, 'utf8');
const sizes = LOCALES.map((l) => `${l}:${map[l].length}`).join(' ');
console.log(`Đã sinh ${out} (${LOCALES.length} ngôn ngữ — ${sizes}).`);
