// Driver 'file' - lưu .data/*.json. Ghi atomic + lock theo file qua json-store.
// Đây là driver MẶC ĐỊNH (zero-setup). Thư mục lấy từ DATA_DIR (mặc định <cwd>/.data).
import path from 'node:path';
import type { UserRecord } from '../../auth/users';
import type { ArticleRecord } from '../../store/articles';
import type { ConnectionRecord } from '../../store/connections';
import type { KeywordSetRecord } from '../../store/keywordsets';
import type { PlanRecord } from '../../store/plans';
import { mutateJson, readJson } from '../json-store';
import type {
  ArticlesRepo,
  ConfigRepo,
  ConnectionsRepo,
  KeywordSetsRepo,
  PlansRepo,
  Repositories,
  SessionRow,
  SessionsRepo,
  UsersRepo,
} from './types';

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), '.data');
}
const file = (name: string) => path.join(dataDir(), name);

const usersFile = () => file('users.json');
const sessionsFile = () => file('sessions.json');
const connectionsFile = () => file('connections.json');
const articlesFile = () => file('articles.json');
const keywordSetsFile = () => file('keywordsets.json');
const plansFile = () => file('plans.json');
const configFile = () => file('app-config.json');

const usersRepo: UsersRepo = {
  all: () => readJson<UserRecord[]>(usersFile(), []),
  async getById(id) {
    return (await this.all()).find((u) => u.id === id) ?? null;
  },
  async getByEmail(email) {
    const e = email.trim().toLowerCase();
    return (await this.all()).find((u) => u.email.toLowerCase() === e) ?? null;
  },
  async count() {
    return (await this.all()).length;
  },
  insert: (record) =>
    mutateJson<UserRecord[], void>(usersFile(), [], (rows) => {
      if (rows.some((u) => u.email.toLowerCase() === record.email.toLowerCase())) {
        throw new Error('Email đã tồn tại');
      }
      return [[...rows, record], undefined];
    }),
  update: (id, patch) =>
    mutateJson<UserRecord[], void>(usersFile(), [], (rows) => {
      const u = rows.find((x) => x.id === id);
      if (u) Object.assign(u, patch);
      return [rows, undefined];
    }),
  remove: (id) =>
    mutateJson<UserRecord[], void>(usersFile(), [], (rows) => [
      rows.filter((x) => x.id !== id),
      undefined,
    ]),
};

const sessionsRepo: SessionsRepo = {
  insert: (row) =>
    mutateJson<SessionRow[], void>(sessionsFile(), [], (rows) => {
      const now = Date.now();
      return [[...rows.filter((s) => s.expiresAt > now), row], undefined];
    }),
  async userIdFor(token) {
    const now = Date.now();
    const row = (await readJson<SessionRow[]>(sessionsFile(), [])).find(
      (s) => s.token === token && s.expiresAt > now,
    );
    return row ? row.userId : null;
  },
  removeByToken: (token) =>
    mutateJson<SessionRow[], void>(sessionsFile(), [], (rows) => [
      rows.filter((s) => s.token !== token),
      undefined,
    ]),
  removeByUser: (userId) =>
    mutateJson<SessionRow[], void>(sessionsFile(), [], (rows) => [
      rows.filter((s) => s.userId !== userId),
      undefined,
    ]),
};

const connectionsRepo: ConnectionsRepo = {
  all: () => readJson<ConnectionRecord[]>(connectionsFile(), []),
  async get(id) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  },
  insert: (record) =>
    mutateJson<ConnectionRecord[], void>(connectionsFile(), [], (rows) => [
      [...rows, record],
      undefined,
    ]),
  setStatus: (id, status) =>
    mutateJson<ConnectionRecord[], void>(connectionsFile(), [], (rows) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.status = status;
      return [rows, undefined];
    }),
  remove: (id) =>
    mutateJson<ConnectionRecord[], void>(connectionsFile(), [], (rows) => [
      rows.filter((r) => r.id !== id),
      undefined,
    ]),
};

const UPDATABLE_ARTICLE: Array<keyof ArticleRecord> = [
  'title', 'slug', 'metaDescription', 'markdown', 'locale', 'targetKeyword', 'tags',
  'coverImageUrl', 'translationGroupId', 'source', 'seoScore', 'aeoScore', 'geoScore', 'status',
  'connectionId', 'cmsPostId', 'publishedUrl',
];

const articlesRepo: ArticlesRepo = {
  all: () => readJson<ArticleRecord[]>(articlesFile(), []),
  async get(id) {
    return (await this.all()).find((a) => a.id === id) ?? null;
  },
  insert: (record) =>
    mutateJson<ArticleRecord[], void>(articlesFile(), [], (rows) => [
      [...rows, record],
      undefined,
    ]),
  update: (id, patch) =>
    mutateJson<ArticleRecord[], ArticleRecord | null>(articlesFile(), [], (rows) => {
      const a = rows.find((x) => x.id === id);
      if (!a) return [rows, null];
      const target = a as unknown as Record<string, unknown>;
      for (const k of UPDATABLE_ARTICLE) if (patch[k] !== undefined) target[k] = patch[k];
      a.updatedAt = new Date().toISOString();
      return [rows, a];
    }),
  remove: (id) =>
    mutateJson<ArticleRecord[], void>(articlesFile(), [], (rows) => [
      rows.filter((a) => a.id !== id),
      undefined,
    ]),
};

const keywordSetsRepo: KeywordSetsRepo = {
  all: () => readJson<KeywordSetRecord[]>(keywordSetsFile(), []),
  async get(id) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  },
  insert: (record) =>
    mutateJson<KeywordSetRecord[], void>(keywordSetsFile(), [], (rows) => [
      [...rows, record],
      undefined,
    ]),
  remove: (id) =>
    mutateJson<KeywordSetRecord[], void>(keywordSetsFile(), [], (rows) => [
      rows.filter((r) => r.id !== id),
      undefined,
    ]),
};

const plansRepo: PlansRepo = {
  all: () => readJson<PlanRecord[]>(plansFile(), []),
  async get(id) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  },
  insert: (record) =>
    mutateJson<PlanRecord[], void>(plansFile(), [], (rows) => [[...rows, record], undefined]),
  remove: (id) =>
    mutateJson<PlanRecord[], void>(plansFile(), [], (rows) => [
      rows.filter((r) => r.id !== id),
      undefined,
    ]),
};

const configRepo: ConfigRepo = {
  async get(key, fallback) {
    const all = await readJson<Record<string, unknown>>(configFile(), {});
    return key in all ? (all[key] as typeof fallback) : fallback;
  },
  set: (key, value) =>
    mutateJson<Record<string, unknown>, void>(configFile(), {}, (all) => [
      { ...all, [key]: value },
      undefined,
    ]),
};

export const fileRepositories: Repositories = {
  users: usersRepo,
  sessions: sessionsRepo,
  connections: connectionsRepo,
  articles: articlesRepo,
  keywordSets: keywordSetsRepo,
  plans: plansRepo,
  config: configRepo,
};
