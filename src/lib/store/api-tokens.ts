// Kho API token cho tích hợp ngoài (webhook/đẩy bài qua API). Lưu Ở PHẠM VI TOÀN CỤC
// (.data/api-tokens.json) - KHÔNG theo biz - vì khi có request mang token, ta chưa biết biz nào;
// phải tra token → ra bizId. CHỈ lưu HASH (sha256) của token, không lưu token thô.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface ApiTokenRecord {
  id: string; // tok_<hex>
  name: string;
  prefix: string; // 11 ký tự đầu của token thô (sg_ + 8 hex) - để hiển thị nhận diện
  hash: string; // sha256(token thô)
  createdAt: string;
  createdBy: string; // userId người tạo
  lastUsedAt?: string;
  revoked?: boolean;
}

// Bản công khai cho UI: KHÔNG lộ hash.
export interface ApiTokenPublic {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

const NAME = 'api-tokens.json'; // TOÀN CỤC

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function readAll(): Promise<ApiTokenRecord[]> {
  return readJson<ApiTokenRecord[]>(globalFile(NAME), []);
}

function toPublic(r: ApiTokenRecord): ApiTokenPublic {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    lastUsedAt: r.lastUsedAt,
    revoked: r.revoked,
  };
}

export async function listTokensForBiz(_bizId?: string): Promise<ApiTokenPublic[]> {
  return (await readAll())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toPublic);
}

// Tạo token mới. Trả về bản ghi công khai + TOKEN THÔ (chỉ hiện DUY NHẤT lần này).
export async function createToken(
  _bizId: string,
  name: string,
  userId: string,
): Promise<{ token: ApiTokenPublic; plaintext: string }> {
  const plaintext = 'sg_' + randomBytes(24).toString('hex'); // sg_ + 48 hex
  const record: ApiTokenRecord = {
    id: 'tok_' + randomBytes(8).toString('hex'),
    name: name.trim().slice(0, 80) || 'API token',
    prefix: plaintext.slice(0, 11),
    hash: sha256(plaintext),
    createdAt: new Date().toISOString(),
    createdBy: userId,
  };
  await mutateJson<ApiTokenRecord[], void>(globalFile(NAME), [], (rows) => [
    [...rows, record],
    undefined,
  ]);
  return { token: toPublic(record), plaintext };
}

// Thu hồi (đánh dấu revoked) - CHỈ khi token thuộc đúng biz (chống thu hồi chéo biz).
export async function revokeToken(_bizId: string, id: string): Promise<boolean> {
  return mutateJson<ApiTokenRecord[], boolean>(globalFile(NAME), [], (rows) => {
    const t = rows.find((r) => r.id === id);
    if (!t) return [rows, false];
    t.revoked = true;
    return [rows, true];
  });
}

// Tra token thô → bản ghi hợp lệ (chưa thu hồi). Dùng cho xác thực Bearer ở API công khai.
// So sánh hash bằng timingSafeEqual để tránh rò rỉ theo thời gian.
export async function resolveToken(plaintext: string): Promise<ApiTokenRecord | null> {
  if (!plaintext || !plaintext.startsWith('sg_')) return null;
  const h = Buffer.from(sha256(plaintext), 'hex');
  const rows = await readAll();
  for (const r of rows) {
    if (r.revoked) continue;
    const rh = Buffer.from(r.hash, 'hex');
    if (rh.length === h.length && timingSafeEqual(rh, h)) return r;
  }
  return null;
}

// Cập nhật lastUsedAt (best-effort - không chặn nếu lỗi).
export async function touchToken(id: string): Promise<void> {
  await mutateJson<ApiTokenRecord[], void>(globalFile(NAME), [], (rows) => {
    const t = rows.find((r) => r.id === id);
    if (t) t.lastUsedAt = new Date().toISOString();
    return [rows, undefined];
  }).catch(() => {});
}
