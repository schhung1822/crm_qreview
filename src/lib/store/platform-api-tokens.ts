// Kho API token QUẢN TRỊ NỀN TẢNG (superadmin) - .data/platform-api-tokens.json (toàn cục).
// KHÁC api-tokens.ts (token theo biz, prefix sg_): token này cấp quyền QUẢN TRỊ NỀN TẢNG (đổi
// trạng thái order/user/biz, quản coupon) qua API server-to-server. Prefix 'sga_' để phân biệt.
// CHỈ lưu HASH sha256; token thô chỉ hiện DUY NHẤT lúc tạo. So sánh hằng-thời-gian.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

// Phạm vi (scope) tài nguyên token được phép tác động. Mặc định tạo full 4 scope; có thể giới hạn.
export const API_SCOPES = ['orders', 'users', 'biz', 'coupons'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface PlatformApiTokenRecord {
  id: string; // ptok_<hex>
  name: string;
  prefix: string; // 12 ký tự đầu token thô (sga_ + 8 hex) để nhận diện
  hash: string; // sha256(token thô)
  scopes: ApiScope[];
  createdBy: string; // userId superadmin tạo
  createdAt: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

export interface PlatformApiTokenPublic {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

const NAME = 'platform-api-tokens.json'; // TOÀN CỤC
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function readAll(): Promise<PlatformApiTokenRecord[]> {
  return readJson<PlatformApiTokenRecord[]>(globalFile(NAME), []);
}
function toPublic(r: PlatformApiTokenRecord): PlatformApiTokenPublic {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revoked: r.revoked,
  };
}

function sanitizeScopes(scopes?: readonly string[]): ApiScope[] {
  const set = new Set<ApiScope>((scopes ?? API_SCOPES).filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)));
  return set.size ? API_SCOPES.filter((s) => set.has(s)) : [...API_SCOPES];
}

export async function listPlatformTokens(): Promise<PlatformApiTokenPublic[]> {
  return (await readAll())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toPublic);
}

// Tạo token. Trả bản công khai + TOKEN THÔ (chỉ hiện DUY NHẤT lần này).
export async function createPlatformToken(
  name: string,
  userId: string,
  scopes?: readonly string[],
): Promise<{ token: PlatformApiTokenPublic; plaintext: string }> {
  const plaintext = 'sga_' + randomBytes(24).toString('hex'); // sga_ + 48 hex
  const record: PlatformApiTokenRecord = {
    id: 'ptok_' + randomBytes(8).toString('hex'),
    name: name.trim().slice(0, 80) || 'Admin API token',
    prefix: plaintext.slice(0, 12),
    hash: sha256(plaintext),
    scopes: sanitizeScopes(scopes),
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };
  await mutateJson<PlatformApiTokenRecord[], void>(globalFile(NAME), [], (rows) => [
    [...rows, record],
    undefined,
  ]);
  return { token: toPublic(record), plaintext };
}

export async function revokePlatformToken(id: string): Promise<boolean> {
  return mutateJson<PlatformApiTokenRecord[], boolean>(globalFile(NAME), [], (rows) => {
    const t = rows.find((r) => r.id === id);
    if (!t) return [rows, false];
    t.revoked = true;
    return [rows, true];
  });
}

// Tra token thô → bản ghi hợp lệ (chưa thu hồi). So sánh hash hằng-thời-gian.
export async function resolvePlatformToken(plaintext: string): Promise<PlatformApiTokenRecord | null> {
  if (!plaintext || !plaintext.startsWith('sga_')) return null;
  const h = Buffer.from(sha256(plaintext), 'hex');
  for (const r of await readAll()) {
    if (r.revoked) continue;
    const rh = Buffer.from(r.hash, 'hex');
    if (rh.length === h.length && timingSafeEqual(rh, h)) return r;
  }
  return null;
}

export async function touchPlatformToken(id: string): Promise<void> {
  await mutateJson<PlatformApiTokenRecord[], void>(globalFile(NAME), [], (rows) => {
    const t = rows.find((r) => r.id === id);
    if (t) t.lastUsedAt = new Date().toISOString();
    return [rows, undefined];
  }).catch(() => {});
}
