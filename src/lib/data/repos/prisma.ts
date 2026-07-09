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
import type { ConnectionRecord, CmsProvider } from '../../store/connections';
import type { KeywordSetRecord, StoredKeyword } from '../../store/keywordsets';
import type { PlanItem, PlanRecord } from '../../store/plans';
import { activeBizId } from '../biz-path';
import type { Repositories } from './types';

const iso = (d: Date) => d.toISOString();

// bizId của ngữ cảnh hiện tại cho thao tác thuộc-biz. Thiếu → ném (không đoán mò, tránh ghi nhầm biz).
function curBiz(): string {
  const b = activeBizId();
  if (!b) throw new Error('Thao tác dữ liệu thuộc-biz cần ngữ cảnh biz (activeBizId).');
  return b;
}

// Whitelist field cập nhật Article — khớp UPDATABLE ở store/articles.ts (chống mass-assignment).
const ARTICLE_FIELDS: Array<keyof ArticleRecord> = [
  'title', 'slug', 'metaDescription', 'markdown', 'locale', 'targetKeyword', 'tags', 'categories',
  'coverImageUrl', 'translationGroupId', 'source', 'seoScore', 'aeoScore', 'geoScore', 'status',
  'approved', 'reviewNote', 'submittedBy', 'reviewedBy', 'assignedTo',
  'connectionId', 'cmsPostId', 'publishedUrl',
];

function userOut(r: {
  id: string; email: string; name: string; role: string;
  passwordHash: string; salt: string; active: boolean; createdAt: Date;
  permissions?: unknown;
}): UserRecord {
  const out = { ...r, role: r.role as Role, createdAt: iso(r.createdAt) } as UserRecord;
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
    locale: r.locale as string,
    targetKeyword: (r.targetKeyword as string) ?? undefined,
    tags: (r.tags as string[]) ?? undefined,
    categories: (r.categories as string[]) ?? undefined,
    coverImageUrl: (r.coverImageUrl as string) ?? undefined,
    translationGroupId: (r.translationGroupId as string) ?? undefined,
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

function connectionOut(r: Record<string, unknown>): ConnectionRecord {
  return {
    id: r.id as string,
    provider: r.provider as CmsProvider,
    label: r.label as string,
    baseUrl: r.baseUrl as string,
    locale: r.locale as string,
    pathStrategy: r.pathStrategy as 'subdir' | 'subdomain',
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
        },
      });
    },
    async update(id, patch) {
      const data: Record<string, unknown> = {};
      for (const k of ['name', 'role', 'active', 'passwordHash', 'salt', 'permissions'] as const) {
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
      return (await prisma.connection.findMany({ where: { bizId: curBiz() } })).map(connectionOut);
    },
    async get(id) {
      const c = await prisma.connection.findFirst({ where: { id, bizId: curBiz() } });
      return c ? connectionOut(c) : null;
    },
    async insert(r) {
      await prisma.connection.create({
        data: {
          id: r.id, bizId: curBiz(), provider: r.provider, label: r.label, baseUrl: r.baseUrl,
          locale: r.locale, pathStrategy: r.pathStrategy, seoPlugin: r.seoPlugin ?? null,
          encrypted: r.encrypted, status: r.status, createdAt: new Date(r.createdAt),
        },
      });
    },
    async setStatus(id, status) {
      await prisma.connection.updateMany({ where: { id, bizId: curBiz() }, data: { status } });
    },
    async remove(id) {
      await prisma.connection.deleteMany({ where: { id, bizId: curBiz() } });
    },
  },

  articles: {
    async all() {
      return (await prisma.article.findMany({ where: { bizId: curBiz() } })).map(articleOut);
    },
    async get(id) {
      const a = await prisma.article.findFirst({ where: { id, bizId: curBiz() } });
      return a ? articleOut(a) : null;
    },
    async insert(r) {
      await prisma.article.create({
        data: {
          id: r.id, bizId: curBiz(), title: r.title, slug: r.slug,
          metaDescription: r.metaDescription, markdown: r.markdown, locale: r.locale,
          targetKeyword: r.targetKeyword ?? null, tags: r.tags ?? undefined,
          categories: r.categories ?? undefined, coverImageUrl: r.coverImageUrl ?? null,
          translationGroupId: r.translationGroupId ?? null, source: r.source,
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
      const res = await prisma.article.updateMany({ where: { id, bizId: curBiz() }, data });
      if (res.count === 0) return null;
      const a = await prisma.article.findFirst({ where: { id, bizId: curBiz() } });
      return a ? articleOut(a) : null;
    },
    async remove(id) {
      await prisma.article.deleteMany({ where: { id, bizId: curBiz() } });
    },
  },

  keywordSets: {
    async all() {
      return (await prisma.keywordSet.findMany({ where: { bizId: curBiz() } })).map(keywordSetOut);
    },
    async get(id) {
      const k = await prisma.keywordSet.findFirst({ where: { id, bizId: curBiz() } });
      return k ? keywordSetOut(k) : null;
    },
    async insert(r) {
      await prisma.keywordSet.create({
        data: {
          id: r.id, bizId: curBiz(), seed: r.seed, locale: r.locale, estimated: r.estimated,
          keywords: r.keywords as unknown as object, clusters: r.clusters,
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.keywordSet.deleteMany({ where: { id, bizId: curBiz() } });
    },
  },

  plans: {
    async all() {
      return (await prisma.contentPlan.findMany({ where: { bizId: curBiz() } })).map(planOut);
    },
    async get(id) {
      const p = await prisma.contentPlan.findFirst({ where: { id, bizId: curBiz() } });
      return p ? planOut(p) : null;
    },
    async insert(r) {
      await prisma.contentPlan.create({
        data: {
          id: r.id, bizId: curBiz(), keywordSetId: r.keywordSetId, locale: r.locale,
          title: r.title, seed: r.seed, items: r.items as unknown as object,
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.contentPlan.deleteMany({ where: { id, bizId: curBiz() } });
    },
  },

  // Cấu hình key→JSON: có ngữ cảnh biz → BizConfig (cô lập theo biz); không có → PlatformConfig (toàn cục).
  config: {
    async get(key, fallback) {
      const b = activeBizId();
      if (b) {
        const row = await prisma.bizConfig.findUnique({ where: { bizId_key: { bizId: b, key } } });
        return row ? (row.value as typeof fallback) : fallback;
      }
      const row = await prisma.platformConfig.findUnique({ where: { key } });
      return row ? (row.value as typeof fallback) : fallback;
    },
    async set(key, value) {
      const b = activeBizId();
      if (b) {
        await prisma.bizConfig.upsert({
          where: { bizId_key: { bizId: b, key } },
          create: { bizId: b, key, value: value as unknown as object },
          update: { value: value as unknown as object },
        });
        return;
      }
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
    locale: r.locale as string,
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
    locale: r.locale as string,
    title: r.title as string,
    seed: r.seed as string,
    items: r.items as PlanItem[],
    createdAt: iso(r.createdAt as Date),
  };
}
