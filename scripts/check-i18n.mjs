#!/usr/bin/env node
// Kiểm tra ĐỒNG BỘ i18n: mọi locale trong src/messages phải khớp en.json về tập key,
// cấu trúc và placeholder ICU. Dùng để chặn việc thêm/sửa UI mà quên cập nhật bản dịch.
// Chạy: npm run check:i18n   (thoát mã 1 nếu có lệch → fail CI/precommit).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'messages');

// 10 ngôn ngữ bắt buộc — nguồn chân lý ở src/i18n/config.ts. Giữ khớp khi thêm ngôn ngữ.
const REQUIRED = ['vi', 'en', 'zh', 'ja', 'ko', 'fr', 'de', 'id', 'hi', 'th'];
const BASE = 'en';

const flat = (o, p = '', m = {}) => {
  for (const k of Object.keys(o)) {
    const v = o[k];
    const np = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, np, m);
    else m[np] = String(v);
  }
  return m;
};
const placeholders = (s) => [...(s.match(/\{[^}]+\}/g) || [])].sort().join(',');
const load = (loc) => flat(JSON.parse(readFileSync(join(dir, `${loc}.json`), 'utf8')));

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✗ ${msg}`);
};

// File thừa/thiếu so với danh sách bắt buộc.
const present = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
for (const loc of REQUIRED) {
  if (!present.includes(loc)) {
    failed = true;
    console.error(`✗ Thiếu file dịch: src/messages/${loc}.json`);
  }
}

const base = load(BASE);
const baseKeys = Object.keys(base);

for (const loc of REQUIRED) {
  if (!present.includes(loc)) continue;
  let cur;
  try {
    cur = load(loc);
  } catch (e) {
    failed = true;
    console.error(`✗ ${loc}: JSON không hợp lệ — ${e.message}`);
    continue;
  }
  const keys = Object.keys(cur);
  const missing = baseKeys.filter((k) => !(k in cur));
  const extra = keys.filter((k) => !(k in base));
  const phBad = baseKeys.filter((k) => k in cur && placeholders(base[k]) !== placeholders(cur[k]));

  if (missing.length || extra.length || phBad.length) {
    console.error(`✗ ${loc}: keys=${keys.length} (en=${baseKeys.length})`);
    if (missing.length) fail(`thiếu ${missing.length} key: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    if (extra.length) fail(`thừa ${extra.length} key: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? '…' : ''}`);
    if (phBad.length) fail(`lệch placeholder ở ${phBad.length} key: ${phBad.slice(0, 8).join(', ')}${phBad.length > 8 ? '…' : ''}`);
  } else {
    console.log(`✓ ${loc}: ${keys.length} key, khớp en.json`);
  }
}

if (failed) {
  console.error('\ni18n CHƯA đồng bộ. Cập nhật đủ 10 ngôn ngữ trước khi báo xong (xem CLAUDE.md §8.4).');
  process.exit(1);
}
console.log(`\nOK — ${REQUIRED.length} ngôn ngữ đồng bộ (${baseKeys.length} key mỗi locale).`);
