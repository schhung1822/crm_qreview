// Chuyển bài đăng mạng xã hội từ blob JSON sang bảng SocialPost. IDEMPOTENT (upsert theo id):
// chạy lại nhiều lần không nhân đôi dữ liệu.
//
//   node scripts/migrate-social-posts.mjs --dry-run   # chỉ đọc + đếm, KHÔNG ghi DB
//   node scripts/migrate-social-posts.mjs             # chuyển thật
//
// NGUỒN đọc theo thứ tự ưu tiên:
//   1. Bảng JsonBlob, hàng ('_global', 'social-posts.json')  — khi đang chạy STORAGE_DRIVER=prisma
//   2. File .data/social-posts.json                          — khi đang chạy driver file
//
// TRƯỚC KHI CHẠY: npx prisma migrate deploy (tạo bảng SocialPost).
//
// BACKFILL batchId: bản ghi cũ do app tạo KHÔNG có batchId (chỉ API ngoài mới đặt). Script gom
// nhóm y hệt cách giao diện cũ vẫn gom (tiêu đề|nội dung|loại|media|phút tạo) rồi cấp một batchId
// chung cho mỗi nhóm, để lịch sử cũ vẫn hiển thị đúng "một lần đăng nhiều kênh".
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const DATA = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const BLOB_NAME = 'social-posts.json';

let prisma = null;
async function getPrisma() {
  if (prisma) return prisma;
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  return prisma;
}

// Khóa nguồn — PHẢI khớp src/lib/social-publishing/source.ts (bản .mjs vì script chạy ngoài Next).
function sourceKey(value) {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // URL hỏng → so khớp theo chữ
    }
  }
  return raw.toLowerCase();
}

// Gom nhóm y như giao diện cũ, dùng để cấp batchId cho bản ghi chưa có.
function legacyGroupKey(post) {
  const minute = Math.floor(new Date(post.createdAt).getTime() / 60_000);
  const media = [...(post.mediaUrls ?? [])].sort().join('|');
  return [post.title || '', post.text ?? '', post.mediaType, media, minute].join('::');
}

async function readSource() {
  // 1) JsonBlob trên DB
  try {
    const p = await getPrisma();
    const row = await p.jsonBlob.findUnique({ where: { scope_name: { scope: '_global', name: BLOB_NAME } } });
    if (row && Array.isArray(row.data) && row.data.length) {
      return { from: `JsonBlob('_global','${BLOB_NAME}')`, rows: row.data };
    }
  } catch (error) {
    console.log(`! Khong doc duoc JsonBlob (${error.message}). Thu doc file .data.`);
  }
  // 2) File .data
  try {
    const file = path.join(DATA, BLOB_NAME);
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(rows)) return { from: file, rows };
  } catch {
    // khong co file
  }
  return { from: null, rows: [] };
}

function toRow(post, batchId) {
  const asArray = (value) => (Array.isArray(value) ? value : undefined);
  return {
    id: post.id,
    batchId,
    connectionId: post.connectionId ?? '',
    provider: post.provider ?? 'facebook',
    connectionLabel: post.connectionLabel ?? '',
    title: post.title ?? null,
    text: post.text ?? '',
    mediaType: post.mediaType ?? 'text',
    mediaUrls: asArray(post.mediaUrls) ?? [],
    originalMediaUrls: asArray(post.originalMediaUrls),
    imageProcessing: post.imageProcessing ?? undefined,
    linkUrl: post.linkUrl ?? null,
    articleSource: post.articleSource ?? null,
    articleSourceKey: sourceKey(post.articleSource),
    urlSource: post.urlSource ?? null,
    affiliateLinks: asArray(post.affiliateLinks),
    providerPostId: post.providerPostId ?? null,
    publishedUrl: post.publishedUrl ?? null,
    status: post.status ?? 'published',
    error: post.error ?? null,
    createdBy: post.createdBy ?? null,
    source: post.source ?? null,
    createdAt: post.createdAt ? new Date(post.createdAt) : new Date(),
  };
}

async function main() {
  const { from, rows } = await readSource();
  if (!from) {
    console.log('Khong tim thay du lieu bai dang mang xa hoi de chuyen. Khong co gi de lam.');
    return;
  }
  console.log(`Nguon : ${from}`);
  console.log(`Doc   : ${rows.length} ban ghi`);

  // Cấp batchId cho bản ghi cũ chưa có.
  const batchByLegacyKey = new Map();
  let backfilled = 0;
  const prepared = rows
    .filter((post) => post && typeof post.id === 'string' && post.id)
    .map((post) => {
      let batchId = post.batchId;
      if (!batchId) {
        const key = legacyGroupKey(post);
        batchId = batchByLegacyKey.get(key);
        if (!batchId) {
          batchId = `spb_${randomBytes(9).toString('hex')}`;
          batchByLegacyKey.set(key, batchId);
        }
        backfilled += 1;
      }
      return toRow(post, batchId);
    });

  const skipped = rows.length - prepared.length;
  if (skipped) console.log(`Bo qua: ${skipped} ban ghi thieu id`);
  console.log(`Batch : ${backfilled} ban ghi duoc cap batchId moi (${batchByLegacyKey.size} nhom)`);

  if (DRY) {
    console.log('\n[DRY RUN] Khong ghi gi vao DB.');
    return;
  }

  const p = await getPrisma();
  let written = 0;
  for (const row of prepared) {
    const { id, ...rest } = row;
    await p.socialPost.upsert({ where: { id }, create: { id, ...rest }, update: rest });
    written += 1;
    if (written % 200 === 0) console.log(`  ... ${written}/${prepared.length}`);
  }

  const total = await p.socialPost.count();
  console.log(`\nDa ghi : ${written} ban ghi`);
  console.log(`Bang SocialPost hien co: ${total} hang`);
  console.log('\nDoi chieu xong thi co the xoa blob cu bang:');
  console.log(`  DELETE FROM JsonBlob WHERE scope='_global' AND name='${BLOB_NAME}';`);
}

main()
  .catch((error) => {
    console.error('Loi:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
