// Driver 'prisma' - Postgres qua Prisma. CHƯA bật mặc định; kích hoạt khi đặt
// DATABASE_URL + STORAGE_DRIVER=prisma (xem index.ts). Map record ↔ row của DB.
// Yêu cầu: `npm run prisma:generate` rồi `prisma migrate deploy` trước khi dùng.
import { prisma } from '../../prisma';
import type { Role } from '../../auth/permissions';
import type { UserRecord } from '../../auth/users';
import type { ArticleRecord } from '../../store/articles';
import type { ConnectionRecord, CmsProvider } from '../../store/connections';
import type { KeywordSetRecord, StoredKeyword } from '../../store/keywordsets';
import type { PlanItem, PlanRecord } from '../../store/plans';
import type { Repositories } from './types';

const iso = (d: Date) => d.toISOString();

const ARTICLE_FIELDS: Array<keyof ArticleRecord> = [
  'title', 'slug', 'metaDescription', 'markdown', 'locale', 'targetKeyword', 'tags',
  'coverImageUrl', 'translationGroupId', 'source', 'seoScore', 'aeoScore', 'geoScore', 'status',
  'connectionId', 'cmsPostId', 'publishedUrl',
];

function userOut(r: {
  id: string; email: string; name: string; role: string;
  passwordHash: string; salt: string; active: boolean; createdAt: Date;
}): UserRecord {
  return { ...r, role: r.role as Role, createdAt: iso(r.createdAt) };
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
    coverImageUrl: (r.coverImageUrl as string) ?? undefined,
    translationGroupId: (r.translationGroupId as string) ?? undefined,
    source: (r.source as 'new' | 'edited') ?? 'new',
    seoScore: r.seoScore as number,
    aeoScore: (r.aeoScore as number) ?? 0,
    geoScore: r.geoScore as number,
    status: r.status as 'draft' | 'published',
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
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async update(id, patch) {
      const data: Record<string, unknown> = {};
      for (const k of ['name', 'role', 'active', 'passwordHash', 'salt'] as const) {
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
      await prisma.connection.create({
        data: {
          id: r.id, provider: r.provider, label: r.label, baseUrl: r.baseUrl,
          locale: r.locale, pathStrategy: r.pathStrategy, seoPlugin: r.seoPlugin ?? null,
          encrypted: r.encrypted, status: r.status, createdAt: new Date(r.createdAt),
        },
      });
    },
    async setStatus(id, status) {
      await prisma.connection.update({ where: { id }, data: { status } }).catch(() => {});
    },
    async remove(id) {
      await prisma.connection.delete({ where: { id } }).catch(() => {});
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
          id: r.id, title: r.title, slug: r.slug, metaDescription: r.metaDescription,
          markdown: r.markdown, locale: r.locale, targetKeyword: r.targetKeyword ?? null,
          tags: r.tags ?? undefined, coverImageUrl: r.coverImageUrl ?? null,
          translationGroupId: r.translationGroupId ?? null, source: r.source,
          seoScore: r.seoScore, aeoScore: r.aeoScore, geoScore: r.geoScore, status: r.status,
          connectionId: r.connectionId ?? null,
          cmsPostId: r.cmsPostId ?? null, publishedUrl: r.publishedUrl ?? null,
          updatedAt: new Date(r.updatedAt),
        },
      });
    },
    async update(id, patch) {
      const data: Record<string, unknown> = {};
      for (const k of ARTICLE_FIELDS) if (patch[k] !== undefined) data[k] = patch[k];
      data.updatedAt = new Date();
      const a = await prisma.article.update({ where: { id }, data }).catch(() => null);
      return a ? articleOut(a) : null;
    },
    async remove(id) {
      await prisma.article.delete({ where: { id } }).catch(() => {});
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
          id: r.id, seed: r.seed, locale: r.locale, estimated: r.estimated,
          keywords: r.keywords as unknown as object, clusters: r.clusters,
          createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.keywordSet.delete({ where: { id } }).catch(() => {});
    },
  },

  plans: {
    async all() {
      return (await prisma.plan.findMany()).map(planOut);
    },
    async get(id) {
      const p = await prisma.plan.findUnique({ where: { id } });
      return p ? planOut(p) : null;
    },
    async insert(r) {
      await prisma.plan.create({
        data: {
          id: r.id, keywordSetId: r.keywordSetId, locale: r.locale, title: r.title,
          seed: r.seed, items: r.items as unknown as object, createdAt: new Date(r.createdAt),
        },
      });
    },
    async remove(id) {
      await prisma.plan.delete({ where: { id } }).catch(() => {});
    },
  },

  config: {
    async get(key, fallback) {
      const row = await prisma.appConfig.findUnique({ where: { key } });
      return row ? (row.value as typeof fallback) : fallback;
    },
    async set(key, value) {
      await prisma.appConfig.upsert({
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
