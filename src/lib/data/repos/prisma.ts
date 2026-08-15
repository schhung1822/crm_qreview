// Driver 'prisma' - Postgres qua Prisma. CHƯA bật mặc định; kích hoạt khi đặt
// DATABASE_URL + STORAGE_DRIVER=prisma (xem index.ts). Map record ↔ row của DB.
// Yêu cầu: `npm run prisma:generate` rồi `prisma migrate deploy` trước khi dùng.
//
// CÔ LẬP BIZ: các repo thuộc-biz (connections/articles/keywordSets/plans + config) tự lấy
// bizId từ activeBizId() và LỌC mọi truy vấn theo bizId. Đọc chéo id của biz khác → không thấy
// (findFirst kèm bizId). Đây là lớp chống rò tenant thay cho "thư mục vật lý" của driver file.
import { prisma } from '../../prisma';
import type { Role } from '../../auth/permissions';
import type { UserRecord } from '../../auth/users';
import type { ArticleRecord } from '../../store/articles';
import type { ConnectionRecord, ConnectionProvider } from '../../store/connections';
import type { KeywordSetRecord, StoredKeyword } from '../../store/keywordsets';
import type { PlanItem, PlanRecord } from '../../store/plans';
import type { SocialPostRecord } from '../../store/social-posts';
import { sourceKey, sourceLabel } from '../../social-publishing/source';
import { NO_SOURCE_KEY, type Repositories, type SocialPostFilter } from './types';

const iso = (d: Date) => d.toISOString();

// bizId của ngữ cảnh hiện tại cho thao tác thuộc-biz. Thiếu → ném (không đoán mò, tránh ghi nhầm biz).
// Whitelist field cập nhật Article — khớp UPDATABLE ở store/articles.ts (chống mass-assignment).
const ARTICLE_FIELDS: Array<keyof ArticleRecord> = [
  'title', 'slug', 'metaDescription', 'markdown', 'targetKeyword', 'tags', 'categories',
  'coverImageUrl', 'source', 'seoScore', 'aeoScore', 'geoScore', 'status',
  'approved', 'reviewNote', 'submittedBy', 'reviewedBy', 'assignedTo',
  'connectionId', 'cmsPostId', 'publishedUrl',
];

function userOut(r: {
  id: string; email: string; name: string; role: string;
  passwordHash: string; salt: string; active: boolean; createdAt: Date;
  emailVerified?: boolean; permissions?: unknown; firstTouchUtm?: unknown; lastTouchUtm?: unknown;
  fbp?: string | null; fbc?: string | null; ttclid?: string | null; ttp?: string | null;
  gclid?: string | null; gaClientId?: string | null; landingPage?: string | null; referrer?: string | null;
  signupIp?: Uint8Array | null; signupUserAgent?: string | null;
  lastIp?: Uint8Array | null; lastUserAgent?: string | null; lastSeenAt?: Date | null;
}): UserRecord {
  const out = {
    ...r,
    role: r.role as Role,
    createdAt: iso(r.createdAt),
    lastSeenAt: r.lastSeenAt ? iso(r.lastSeenAt) : null,
  } as UserRecord;
  if (r.permissions) (out as { permissions?: unknown }).permissions = r.permissions;
  return out;
}

function articleOut(r: Record<string, unknown>): ArticleRecord {
  return {
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
    metaDescription: r.metaDescription as string,
    markdown: r.markdown as string,
    locale: 'vi',
    targetKeyword: (r.targetKeyword as string) ?? undefined,
    tags: (r.tags as string[]) ?? undefined,
    categories: (r.categories as string[]) ?? undefined,
    coverImageUrl: (r.coverImageUrl as string) ?? undefined,
    source: (r.source as 'new' | 'edited') ?? 'new',
    seoScore: r.seoScore as number,
    aeoScore: (r.aeoScore as number) ?? 0,
    geoScore: r.geoScore as number,
    status: r.status as ArticleRecord['status'],
    approved: (r.approved as boolean) ?? undefined,
    reviewNote: (r.reviewNote as string) ?? undefined,
    submittedBy: (r.submittedBy as string) ?? undefined,
    reviewedBy: (r.reviewedBy as string) ?? undefined,
    assignedTo: (r.assignedTo as string) ?? undefined,
    connectionId: (r.connectionId as string) ?? undefined,
    cmsPostId: (r.cmsPostId as string) ?? undefined,
    publishedUrl: (r.publishedUrl as string) ?? undefined,
    updatedAt: iso(r.updatedAt as Date),
  };
}

// ─────────────────────── SocialPost ↔ hàng DB ───────────────────────
// Mảng/đối tượng lưu cột Json (MySQL không có kiểu mảng). Trường vắng mặt → undefined, KHÔNG null,
// để record khớp đúng SocialPostRecord như driver file trả về.
const jsonArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? (value as string[]) : undefined;
const orUndefined = <T,>(value: T | null): T | undefined => (value === null ? undefined : value);

function socialPostOut(r: Record<string, unknown>): SocialPostRecord {
  return {
    id: r.id as string,
    batchId: r.batchId as string,
    connectionId: r.connectionId as string,
    provider: r.provider as SocialPostRecord['provider'],
    connectionLabel: r.connectionLabel as string,
    title: orUndefined(r.title as string | null),
    text: r.text as string,
    mediaType: r.mediaType as SocialPostRecord['mediaType'],
    mediaUrls: jsonArray(r.mediaUrls) ?? [],
    originalMediaUrls: jsonArray(r.originalMediaUrls),
    imageProcessing: orUndefined(r.imageProcessing as SocialPostRecord['imageProcessing'] | null),
    linkUrl: orUndefined(r.linkUrl as string | null),
    articleSource: orUndefined(r.articleSource as string | null),
    urlSource: orUndefined(r.urlSource as string | null),
    affiliateLinks: jsonArray(r.affiliateLinks),
    providerPostId: orUndefined(r.providerPostId as string | null),
    publishedUrl: orUndefined(r.publishedUrl as string | null),
    status: r.status as SocialPostRecord['status'],
    error: orUndefined(r.error as string | null),
    createdBy: orUndefined(r.createdBy as string | null),
    source: orUndefined(r.source as SocialPostRecord['source'] | null),
    createdAt: iso(r.createdAt as Date),
  };
}

function socialPostIn(r: SocialPostRecord) {
  return {
    id: r.id,
    batchId: r.batchId,
    connectionId: r.connectionId,
    provider: r.provider,
    connectionLabel: r.connectionLabel,
    title: r.title ?? null,
    text: r.text,
    mediaType: r.mediaType,
    mediaUrls: r.mediaUrls as unknown as object,
    originalMediaUrls: (r.originalMediaUrls as unknown as object) ?? undefined,
    imageProcessing: (r.imageProcessing as unknown as object) ?? undefined,
    linkUrl: r.linkUrl ?? null,
    articleSource: r.articleSource ?? null,
    articleSourceKey: sourceKey(r.articleSource) || null,
    urlSource: r.urlSource ?? null,
    affiliateLinks: (r.affiliateLinks as unknown as object) ?? undefined,
    providerPostId: r.providerPostId ?? null,
    publishedUrl: r.publishedUrl ?? null,
    status: r.status,
    error: r.error ?? null,
    createdBy: r.createdBy ?? null,
    source: r.source ?? null,
    createdAt: new Date(r.createdAt),
  };
}

function socialPostWhere(filter: SocialPostFilter) {
  const where: Record<string, unknown> = {};
  if (filter.provider) where.provider = filter.provider;
  if (filter.status) where.status = filter.status;
  if (filter.sourceKey === NO_SOURCE_KEY) where.articleSourceKey = null;
  else if (filter.sourceKey) where.articleSourceKey = filter.sourceKey;
  const q = filter.search?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { text: { contains: q } },
      { connectionLabel: { contains: q } },
      { publishedUrl: { contains: q } },
      { providerPostId: { contains: q } },
      { articleSource: { contains: q } },
    ];
  }
  return where;
}

function connectionOut(r: Record<string, unknown>): ConnectionRecord {
  return {
    id: r.id as string,
    provider: r.provider as ConnectionProvider,
    label: r.label as string,
    baseUrl: r.baseUrl as string,
    locale: 'vi',
    pathStrategy: 'subdir',
    seoPlugin: (r.seoPlugin as string) ?? undefined,
    status: r.status as 'active' | 'error',
    encrypted: r.encrypted as string,
    createdAt: iso(r.createdAt as Date),
  };
}

export const prismaRepositories: Repositories = {
  users: {
    async all() {
      return (await prisma.user.findMany()).map(userOut);
    },
    async getById(id) {
      const u = await prisma.user.findUnique({ where: { id } });
      return u ? userOut(u) : null;
    },
    async getByEmail(email) {
      const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
      return u ? userOut(u) : null;
    },
    count: () => prisma.user.count(),
    async insert(r) {
      await prisma.user.create({
        data: {
          id: r.id, email: r.email, name: r.name, role: r.role,
          passwordHash: r.passwordHash, salt: r.salt, active: r.active,
          permissions: (r.permissions as object) ?? undefined,
          createdAt: new Date(r.createdAt),
          emailVerified: r.emailVerified !== false,
          firstTouchUtm: (r.firstTouchUtm as object | undefined) ?? undefined,
          lastTouchUtm: (r.lastTouchUtm as object | undefined) ?? undefined,
          fbp: r.fbp ?? undefined,
          fbc: r.fbc ?? undefined,
          ttclid: r.ttclid ?? undefined,
          ttp: r.ttp ?? undefined,
          gclid: r.gclid ?? undefined,
          gaClientId: r.gaClientId ?? undefined,
          landingPage: r.landingPage ?? undefined,
          referrer: r.referrer ?? undefined,
          signupIp: r.signupIp ? Buffer.from(r.signupIp) : undefined,
          signupUserAgent: r.signupUserAgent ?? undefined,
          lastIp: r.lastIp ? Buffer.from(r.lastIp) : undefined,
          lastUserAgent: r.lastUserAgent ?? undefined,
          lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : undefined,
        },
      });
    },
    async update(id, patch) {
      const data: Record<string, unknown> = {};
      for (const k of ['name', 'role', 'active', 'passwordHash', 'salt', 'permissions', 'emailVerified'] as const) {
        if (patch[k] !== undefined) data[k] = patch[k];
      }
      await prisma.user.update({ where: { id }, data }).catch(() => {});
    },
    async remove(id) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    },
  },

  sessions: {
    async insert(row) {
      await prisma.session.create({
        data: { token: row.token, userId: row.userId, expiresAt: new Date(row.expiresAt) },
      });
    },
    async userIdFor(token) {
      const s = await prisma.session.findUnique({ where: { token } });
      if (!s || s.expiresAt.getTime() <= Date.now()) return null;
      return s.userId;
    },
    async removeByToken(token) {
      await prisma.session.delete({ where: { token } }).catch(() => {});
    },
    async removeByUser(userId) {
      await prisma.session.deleteMany({ where: { userId } });
    },
  },

  connections: {
    async all() {
      return (await prisma.connection.findMany()).map(connectionOut);
    },
    async get(id) {
      const c = await prisma.connection.findUnique({ where: { id } });
      return c ? connectionOut(c) : null;
    },
    async insert(r) {
      const data = {
        id: r.id, provider: r.provider, label: r.label, baseUrl: r.baseUrl,
        seoPlugin: r.seoPlugin ?? null,
        encrypted: r.encrypted, status: r.status, createdAt: new Date(r.createdAt),
      };
      try {
        await prisma.connection.create({ data });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('bizId') && !message.includes('doesn\'t have a default value')) throw error;
        await prisma.$executeRawUnsafe(
          'INSERT INTO `Connection` (id, bizId, provider, label, baseUrl, locale, pathStrategy, seoPlugin, encrypted, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          r.id,
          'global',
          r.provider,
          r.label,
          r.baseUrl,
          r.locale,
          r.pathStrategy,
          r.seoPlugin ?? null,
          r.encrypted,
          r.status,
          new Date(r.createdAt),
        );
      }
    },
    async setStatus(id, status) {
      await prisma.connection.updateMany({ where: { id }, data: { status } });
    },
    async remove(id) {
      await prisma.connection.deleteMany({ where: { id } });
    },
  },

  articles: {
    async all() {
      return (await prisma.article.findMany()).map(articleOut);
    },
    async get(id) {
      const a = await prisma.article.findUnique({ where: { id } });
      return a ? articleOut(a) : null;
    },
    async insert(r) {
      await prisma.article.create({
        data: {
          id: r.id, title: r.title, slug: r.slug,
          metaDescription: r.metaDescription, markdown: r.markdown,
          targetKeyword: r.targetKeyword ?? null, tags: r.tags ?? undefined,
          categories: r.categories ?? undefined, coverImageUrl: r.coverImageUrl ?? null,
          source: r.source,
          seoScore: r.seoScore, aeoScore: r.aeoScore, geoScore: r.geoScore, status: r.status,
          approved: r.approved ?? null, reviewNote: r.reviewNote ?? null,
          submittedBy: r.submittedBy ?? null, reviewedBy: r.reviewedBy ?? null,
          assignedTo: r.assignedTo ?? null, connectionId: r.connectionId ?? null,
          cmsPostId: r.cmsPostId ?? null, publishedUrl: r.publishedUrl ?? null,
          updatedAt: new Date(r.updatedAt),
        },
      });
    },
    async update(id, patch) {
      const data: Record<string, unknown> = {};
      for (const k of ARTICLE_FIELDS) if (patch[k] !== undefined) data[k] = patch[k];
      data.updatedAt = new Date();
      // updateMany kèm bizId → không sửa được bài của biz khác; rồi đọc lại bản đã sửa.
      const res = await prisma.article.updateMany({ where: { id }, data });
      if (res.count === 0) return null;
      const a = await prisma.article.findUnique({ where: { id } });
      return a ? articleOut(a) : null;
    },
    async remove(id) {
      await prisma.article.deleteMany({ where: { id } });
    },
  },

  keywordSets: {
    async all() {
      return (await prisma.keywordSet.findMany()).map(keywordSetOut);
    },
    async get(id) {
      const k = await prisma.keywordSet.findUnique({ where: { id } });
      return k ? keywordSetOut(k) : null;
    },
    async insert(r) {
      await prisma.keywordSet.create({
        data: {
          id: r.id, seed: r.seed, estimated: r.estimated,
          keywords: r.keywords as unknown as object, clusters: r.clusters,
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.keywordSet.deleteMany({ where: { id } });
    },
  },

  plans: {
    async all() {
      return (await prisma.contentPlan.findMany()).map(planOut);
    },
    async get(id) {
      const p = await prisma.contentPlan.findUnique({ where: { id } });
      return p ? planOut(p) : null;
    },
    async insert(r) {
      await prisma.contentPlan.create({
        data: {
          id: r.id, keywordSetId: r.keywordSetId,
          title: r.title, seed: r.seed, items: r.items as unknown as object,
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.contentPlan.deleteMany({ where: { id } });
    },
  },

  // Bài đăng mạng xã hội — bảng SocialPost, mỗi kênh một hàng, lọc bằng index.
  socialPosts: {
    async page(filter, limit, offset) {
      const where = socialPostWhere(filter);
      // Lấy DANH SÁCH LẦN ĐĂNG của trang trước, rồi mới lấy hàng — phân trang theo lần đăng
      // để một lần đăng nhiều kênh không bị cắt đôi giữa hai trang.
      const [pageBatches, allBatches] = await Promise.all([
        prisma.socialPost.groupBy({
          by: ['batchId'],
          where,
          _max: { createdAt: true },
          orderBy: { _max: { createdAt: 'desc' } },
          take: limit,
          skip: offset,
        }),
        prisma.socialPost.groupBy({ by: ['batchId'], where }),
      ]);
      const batchIds = pageBatches.map((row) => row.batchId);
      if (!batchIds.length) return { rows: [], totalBatches: allBatches.length };
      const rows = await prisma.socialPost.findMany({
        where: { AND: [where, { batchId: { in: batchIds } }] },
        orderBy: { createdAt: 'desc' },
      });
      return { rows: rows.map(socialPostOut), totalBatches: allBatches.length };
    },
    async batch(id) {
      const found = await prisma.socialPost.findUnique({ where: { id } });
      if (!found) return [];
      const rows = await prisma.socialPost.findMany({
        where: { batchId: found.batchId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(socialPostOut);
    },
    async since(createdAtIso) {
      const rows = await prisma.socialPost.findMany({
        where: { createdAt: { gte: new Date(createdAtIso) } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(socialPostOut);
    },
    async sources() {
      const groups = await prisma.socialPost.groupBy({
        by: ['articleSourceKey'],
        _count: { _all: true },
        _max: { articleSource: true },
      });
      const rows: Array<{ key: string; label: string; count: number }> = [];
      let missing = 0;
      for (const group of groups) {
        if (!group.articleSourceKey) {
          missing += group._count._all;
          continue;
        }
        rows.push({
          key: group.articleSourceKey,
          label: sourceLabel(group._max.articleSource || group.articleSourceKey),
          count: group._count._all,
        });
      }
      return { rows, missing };
    },
    async insertMany(records) {
      if (!records.length) return;
      await prisma.socialPost.createMany({ data: records.map(socialPostIn) });
    },
    async remove(id) {
      await prisma.socialPost.deleteMany({ where: { id } });
    },
    count: () => prisma.socialPost.count(),
  },

  // Cấu hình key→JSON: có ngữ cảnh biz → BizConfig (cô lập theo biz); không có → PlatformConfig (toàn cục).
  config: {
    async get(key, fallback) {
      const row = await prisma.platformConfig.findUnique({ where: { key } });
      return row ? (row.value as typeof fallback) : fallback;
    },
    async set(key, value) {
      await prisma.platformConfig.upsert({
        where: { key },
        create: { key, value: value as unknown as object },
        update: { value: value as unknown as object },
      });
    },
  },
};

function keywordSetOut(r: Record<string, unknown>): KeywordSetRecord {
  return {
    id: r.id as string,
    seed: r.seed as string,
    locale: 'vi',
    estimated: r.estimated as boolean,
    keywords: r.keywords as StoredKeyword[],
    clusters: r.clusters as string[],
    createdAt: iso(r.createdAt as Date),
  };
}

function planOut(r: Record<string, unknown>): PlanRecord {
  return {
    id: r.id as string,
    keywordSetId: r.keywordSetId as string,
    locale: 'vi',
    title: r.title as string,
    seed: r.seed as string,
    items: r.items as PlanItem[],
    createdAt: iso(r.createdAt as Date),
  };
}
