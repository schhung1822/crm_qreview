// Di trú dữ liệu .data/*.json → PostgreSQL (GĐ2 bước 2E). CHẠY MỘT LẦN, idempotent (upsert).
//
//   node scripts/migrate-to-postgres.mjs --dry-run   # chỉ đọc + đếm, KHÔNG ghi DB (không cần Postgres)
//   DATABASE_URL=postgres://... node scripts/migrate-to-postgres.mjs   # nạp thật vào Postgres
//
// TRƯỚC KHI CHẠY THẬT: npx prisma migrate deploy (tạo bảng). SAU KHI CHẠY: psql -f docs/RLS.sql.
// Secret (encrypted / ai-secrets) copy NGUYÊN ciphertext — KHÔNG giải mã (giữ ENCRYPTION_KEY là đủ).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const DATA = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const BIZ_DIR = path.join(DATA, 'biz');

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
const g = (name) => path.join(DATA, name);
const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const toDate = (v) => (v == null ? null : new Date(v));

// Bộ đếm đối chiếu: nguồn (JSON) vs đích (đã ghi).
const counts = {};
const bump = (table, srcDelta, dstDelta = 0) => {
  counts[table] ??= { src: 0, dst: 0 };
  counts[table].src += srcDelta;
  counts[table].dst += dstDelta;
};

let prisma = null;
async function getPrisma() {
  if (DRY) return null;
  if (prisma) return prisma;
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  return prisma;
}

// upsert an toàn: dry-run chỉ đếm nguồn; thật thì ghi + đếm đích.
async function up(table, model, whereKey, record, data) {
  bump(table, 1);
  if (DRY) return;
  const p = await getPrisma();
  await p[model].upsert({ where: whereKey, create: data, update: data });
  bump(table, 0, 1);
}

// ─────────────────────── TOÀN CỤC ───────────────────────

async function migrateGlobal() {
  // Users
  for (const u of asArray(readJson(g('users.json'), []))) {
    await up('User', 'user', { id: u.id }, u, {
      id: u.id, email: (u.email || '').toLowerCase(), name: u.name, role: u.role,
      passwordHash: u.passwordHash, salt: u.salt, active: u.active !== false,
      permissions: u.permissions ?? undefined, createdAt: toDate(u.createdAt) ?? new Date(),
    });
  }
  // Sessions (expiresAt là epoch ms)
  for (const s of asArray(readJson(g('sessions.json'), []))) {
    await up('Session', 'session', { token: s.token }, s, {
      token: s.token, userId: s.userId, expiresAt: new Date(s.expiresAt),
    });
  }
  // Biz + BizMember
  for (const b of asArray(readJson(g('bizes.json'), []))) {
    await up('Biz', 'biz', { id: b.id }, b, {
      id: b.id, name: b.name, ownerId: b.ownerId, phone: b.phone ?? null, email: b.email ?? null,
      website: b.website ?? null, description: b.description ?? null, suspended: !!b.suspended,
      createdAt: toDate(b.createdAt) ?? new Date(),
    });
    for (const m of b.members ?? []) {
      await up('BizMember', 'bizMember', { bizId_userId: { bizId: b.id, userId: m.userId } }, m, {
        bizId: b.id, userId: m.userId, role: m.role, permissions: m.permissions ?? undefined,
      });
    }
  }
  // Subscriptions (Record<userId, Subscription>)
  for (const s of Object.values(readJson(g('subscriptions.json'), {}))) {
    await up('Subscription', 'subscription', { userId: s.userId }, s, {
      userId: s.userId, plan: s.plan, status: s.status, billingCycle: s.billingCycle ?? 'monthly',
      trialEndsAt: toDate(s.trialEndsAt), currentPeriodEnd: toDate(s.currentPeriodEnd),
      overageArticles: s.overageArticles ?? null, unlimitedArticles: s.unlimitedArticles ?? null,
      updatedAt: toDate(s.updatedAt) ?? new Date(),
    });
  }
  // Orders (Record<id, Order>)
  for (const o of Object.values(readJson(g('orders.json'), {}))) {
    await up('Order', 'order', { id: o.id }, o, {
      id: o.id, userId: o.userId, userEmail: o.userEmail, type: o.type, plan: o.plan ?? null,
      months: o.months ?? null, overageArticles: o.overageArticles ?? null, currency: o.currency,
      amount: o.amount, couponCode: o.couponCode ?? null, discount: o.discount ?? 0, total: o.total,
      status: o.status, payCode: o.payCode, phone: o.phone ?? null, utm: o.utm ?? undefined,
      note: o.note ?? null, activationError: o.activationError ?? null, paidAt: toDate(o.paidAt),
      createdAt: toDate(o.createdAt) ?? new Date(),
    });
  }
  // Coupons (Record<code, Coupon>)
  for (const c of Object.values(readJson(g('coupons.json'), {}))) {
    await up('Coupon', 'coupon', { code: c.code }, c, {
      code: c.code, type: c.type, value: c.value, currency: c.currency ?? null,
      maxUses: c.maxUses ?? 0, usedCount: c.usedCount ?? 0, expiresAt: toDate(c.expiresAt),
      plans: c.plans ?? undefined, active: c.active !== false, createdAt: toDate(c.createdAt) ?? new Date(),
    });
  }
  // ApiToken (file TOÀN CỤC, mỗi record có bizId)
  for (const t of asArray(readJson(g('api-tokens.json'), []))) {
    await up('ApiToken', 'apiToken', { id: t.id }, t, {
      id: t.id, bizId: t.bizId, name: t.name, prefix: t.prefix, hash: t.hash,
      createdBy: t.createdBy, lastUsedAt: toDate(t.lastUsedAt), revoked: !!t.revoked,
      createdAt: toDate(t.createdAt) ?? new Date(),
    });
  }
  // Cấu hình TOÀN CỤC (key→JSON) → PlatformConfig.
  for (const name of ['branding', 'payment-config', 'platform-email', 'announcements', 'tracking-config', 'fx-rates', 'plans']) {
    const file = g(`${name}.json`);
    if (!existsSync(file)) continue;
    await up('PlatformConfig', 'platformConfig', { key: name }, name, { key: name, value: readJson(file, {}) });
  }
}

// ─────────────────────── THUỘC BIZ ───────────────────────

// File cấu hình singleton theo biz → BizConfig(bizId, key).
const BIZ_CONFIG_FILES = [
  'image-config', 'article-config', 'task-routing', 'cost-config', 'drive', 'dataforseo',
  'integrations', 'ai-secrets', 'email',
];

async function migrateBiz(bizId) {
  const bf = (name) => path.join(BIZ_DIR, bizId, name);

  // Articles
  for (const a of asArray(readJson(bf('articles.json'), []))) {
    await up('Article', 'article', { id: a.id }, a, {
      id: a.id, bizId, title: a.title, slug: a.slug ?? '', metaDescription: a.metaDescription ?? '',
      markdown: a.markdown ?? '', locale: a.locale, targetKeyword: a.targetKeyword ?? null,
      tags: a.tags ?? undefined, categories: a.categories ?? undefined, coverImageUrl: a.coverImageUrl ?? null,
      translationGroupId: a.translationGroupId ?? null, source: a.source ?? 'new',
      seoScore: a.seoScore ?? 0, aeoScore: a.aeoScore ?? 0, geoScore: a.geoScore ?? 0,
      status: a.status ?? 'draft', approved: a.approved ?? null, reviewNote: a.reviewNote ?? null,
      submittedBy: a.submittedBy ?? null, reviewedBy: a.reviewedBy ?? null, assignedTo: a.assignedTo ?? null,
      connectionId: a.connectionId ?? null, cmsPostId: a.cmsPostId ?? null, publishedUrl: a.publishedUrl ?? null,
      updatedAt: toDate(a.updatedAt) ?? new Date(),
    });
  }
  // ContentPlan (biz/<id>/plans.json)
  for (const p of asArray(readJson(bf('plans.json'), []))) {
    await up('ContentPlan', 'contentPlan', { id: p.id }, p, {
      id: p.id, bizId, keywordSetId: p.keywordSetId, locale: p.locale, title: p.title,
      seed: p.seed, items: p.items ?? [], createdAt: toDate(p.createdAt) ?? new Date(),
    });
  }
  // KeywordSet
  for (const k of asArray(readJson(bf('keywordsets.json'), []))) {
    await up('KeywordSet', 'keywordSet', { id: k.id }, k, {
      id: k.id, bizId, seed: k.seed, locale: k.locale, estimated: !!k.estimated,
      keywords: k.keywords ?? [], clusters: k.clusters ?? [], createdAt: toDate(k.createdAt) ?? new Date(),
    });
  }
  // Connection
  for (const c of asArray(readJson(bf('connections.json'), []))) {
    await up('Connection', 'connection', { id: c.id }, c, {
      id: c.id, bizId, provider: c.provider, label: c.label, baseUrl: c.baseUrl,
      locale: c.locale ?? 'vi', pathStrategy: c.pathStrategy ?? 'subdir', seoPlugin: c.seoPlugin ?? null,
      encrypted: c.encrypted, status: c.status ?? 'active', createdAt: toDate(c.createdAt) ?? new Date(),
    });
  }
  // Revision
  for (const r of asArray(readJson(bf('revisions.json'), []))) {
    await up('Revision', 'revision', { id: r.id }, r, {
      id: r.id, bizId, connectionId: r.connectionId, cmsPostId: r.cmsPostId, title: r.title,
      contentHtml: r.contentHtml ?? '', metaDescription: r.metaDescription ?? null,
      snapshotOk: !!r.snapshotOk, reason: r.reason ?? '', createdAt: toDate(r.createdAt) ?? new Date(),
    });
  }
  // PublishJob
  for (const j of asArray(readJson(bf('publish-jobs.json'), []))) {
    await up('PublishJob', 'publishJob', { id: j.id }, j, {
      id: j.id, bizId, connectionId: j.connectionId, article: j.article, alternates: j.alternates ?? [],
      articleId: j.articleId ?? null, status: j.status, runAt: toDate(j.runAt), attempts: j.attempts ?? 0,
      maxAttempts: j.maxAttempts ?? 3, lastError: j.lastError ?? null, resultPostId: j.resultPostId ?? null,
      resultUrl: j.resultUrl ?? null, createdAt: toDate(j.createdAt) ?? new Date(),
      updatedAt: toDate(j.updatedAt) ?? new Date(),
    });
  }
  // Comment (Record<articleId, Comment[]>)
  for (const list of Object.values(readJson(bf('comments.json'), {}))) {
    for (const c of list ?? []) {
      await up('Comment', 'comment', { id: c.id }, c, {
        id: c.id, bizId, articleId: c.articleId, userId: c.userId, userName: c.userName,
        body: c.body, createdAt: toDate(c.createdAt) ?? new Date(),
      });
    }
  }
  // Notification (Record<userId, Notif[]>)
  for (const [userId, list] of Object.entries(readJson(bf('notifications.json'), {}))) {
    for (const n of list ?? []) {
      await up('Notification', 'notification', { id: n.id }, n, {
        id: n.id, bizId, userId, type: n.type, articleId: n.articleId ?? null,
        articleTitle: n.articleTitle ?? null, actorName: n.actorName ?? null, note: n.note ?? null,
        read: !!n.read, createdAt: toDate(n.createdAt) ?? new Date(),
      });
    }
  }
  // Citation
  for (const c of asArray(readJson(bf('citations.json'), []))) {
    const id = c.id ?? `cit_${bizId}_${counts.Citation?.src ?? 0}`;
    await up('Citation', 'citation', { id }, c, {
      id, bizId, data: c, createdAt: toDate(c.createdAt) ?? new Date(),
    });
  }
  // AiUsage (Record<key, row>)
  for (const [key, row] of Object.entries(readJson(bf('ai-usage.json'), {}))) {
    await up('AiUsage', 'aiUsage', { bizId_key: { bizId, key } }, row, {
      bizId, key, provider: row.provider ?? key.split('::')[0], model: row.model ?? key.split('::')[1] ?? '',
      inTokens: row.inTokens ?? 0, outTokens: row.outTokens ?? 0, calls: row.calls ?? 0, images: row.images ?? 0,
    });
  }
  // AiUsageSeries (Record<date, Record<key, row>>)
  for (const [date, byKey] of Object.entries(readJson(bf('ai-usage-series.json'), {}))) {
    for (const [key, row] of Object.entries(byKey ?? {})) {
      await up('AiUsageSeries', 'aiUsageSeries', { bizId_date_key: { bizId, date, key } }, row, {
        bizId, date, key, provider: row.provider ?? key.split('::')[0], model: row.model ?? key.split('::')[1] ?? '',
        inTokens: row.inTokens ?? 0, outTokens: row.outTokens ?? 0, images: row.images ?? 0,
      });
    }
  }
  // AiUsageByUser (Record<userId, {inTokens,outTokens}>)
  for (const [userId, row] of Object.entries(readJson(bf('ai-usage-by-user.json'), {}))) {
    await up('AiUsageByUser', 'aiUsageByUser', { bizId_userId: { bizId, userId } }, row, {
      bizId, userId, inTokens: row.inTokens ?? 0, outTokens: row.outTokens ?? 0,
    });
  }
  // Cấu hình singleton theo biz → BizConfig.
  for (const name of BIZ_CONFIG_FILES) {
    const file = bf(`${name}.json`);
    if (!existsSync(file)) continue;
    await up('BizConfig', 'bizConfig', { bizId_key: { bizId, key: name } }, name, {
      bizId, key: name, value: readJson(file, {}),
    });
  }
}

// ─────────────────────── MAIN ───────────────────────

async function main() {
  console.log(`[migrate] ${DRY ? 'DRY-RUN (không ghi DB)' : 'THẬT (ghi vào Postgres)'} · DATA=${DATA}`);
  if (!DRY && !process.env.DATABASE_URL) {
    console.error('[migrate] Thiếu DATABASE_URL. Đặt env hoặc chạy với --dry-run.');
    process.exit(1);
  }
  await migrateGlobal();

  const bizIds = existsSync(BIZ_DIR)
    ? readdirSync(BIZ_DIR).filter((d) => statSync(path.join(BIZ_DIR, d)).isDirectory())
    : [];
  console.log(`[migrate] ${bizIds.length} biz.`);
  for (const bizId of bizIds) await migrateBiz(bizId);

  // Đối chiếu.
  console.log('\n[migrate] Đối chiếu số bản ghi (src=đọc từ JSON, dst=đã ghi DB):');
  let mismatch = false;
  for (const [table, c] of Object.entries(counts).sort()) {
    const ok = DRY || c.src === c.dst;
    if (!ok) mismatch = true;
    console.log(`  ${ok ? 'OK ' : 'XX '} ${table.padEnd(16)} src=${c.src}${DRY ? '' : ` dst=${c.dst}`}`);
  }
  if (prisma) await prisma.$disconnect();
  if (!DRY && mismatch) {
    console.error('\n[migrate] CẢNH BÁO: có bảng lệch số bản ghi — kiểm tra trước khi cutover.');
    process.exit(2);
  }
  console.log('\n[migrate] Xong.');
}

main().catch((e) => {
  console.error('[migrate] Lỗi:', e);
  process.exit(1);
});
