// Lớp trừu tượng kho dữ liệu (repository) - tách logic nghiệp vụ khỏi nơi lưu trữ.
// Hiện có 2 driver: 'file' (mặc định, .data/*.json) và 'prisma' (Postgres, ráp khi có
// DATABASE_URL). Hợp đồng ở MỨC LƯU TRỮ (CRUD record), logic nghiệp vụ (mã hóa, băm
// mật khẩu, bảo vệ owner…) vẫn ở store/auth gọi xuống đây.
import type { UserRecord } from '../../auth/users';
import type { ArticleRecord } from '../../store/articles';
import type { ConnectionRecord } from '../../store/connections';
import type { ImageConfig } from '../../store/image-config';
import type { KeywordSetRecord } from '../../store/keywordsets';
import type { PlanRecord } from '../../store/plans';

export interface SessionRow {
  token: string;
  userId: string;
  expiresAt: number; // epoch ms
}

export interface UsersRepo {
  all(): Promise<UserRecord[]>;
  getById(id: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  count(): Promise<number>;
  insert(record: UserRecord): Promise<void>;
  update(id: string, patch: Partial<UserRecord>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SessionsRepo {
  insert(row: SessionRow): Promise<void>;
  userIdFor(token: string): Promise<string | null>;
  removeByToken(token: string): Promise<void>;
  removeByUser(userId: string): Promise<void>;
}

export interface ConnectionsRepo {
  all(): Promise<ConnectionRecord[]>;
  get(id: string): Promise<ConnectionRecord | null>;
  insert(record: ConnectionRecord): Promise<void>;
  setStatus(id: string, status: 'active' | 'error'): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ArticlesRepo {
  all(): Promise<ArticleRecord[]>;
  get(id: string): Promise<ArticleRecord | null>;
  insert(record: ArticleRecord): Promise<void>;
  update(id: string, patch: Partial<ArticleRecord>): Promise<ArticleRecord | null>;
  remove(id: string): Promise<void>;
}

export interface KeywordSetsRepo {
  all(): Promise<KeywordSetRecord[]>;
  get(id: string): Promise<KeywordSetRecord | null>;
  insert(record: KeywordSetRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PlansRepo {
  all(): Promise<PlanRecord[]>;
  get(id: string): Promise<PlanRecord | null>;
  insert(record: PlanRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ConfigRepo {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface Repositories {
  users: UsersRepo;
  sessions: SessionsRepo;
  connections: ConnectionsRepo;
  articles: ArticlesRepo;
  keywordSets: KeywordSetsRepo;
  plans: PlansRepo;
  config: ConfigRepo;
}

export type { ImageConfig };
