// Pool NHIỀU API key Apify (Báo cáo Social) - cô lập theo biz, mã hóa AES-GCM ở .data/biz/<id>/apify-keys.json.
// Mục tiêu: mỗi RUN thu thập chọn NGẪU NHIÊN 1 key; nếu start lỗi (token hỏng/hết hạn mức) thì tự
// đổi sang key khác (fallback). KHÔNG bao giờ trả key thô ra client. Server-only.
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from '../crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { deleteIntegrationKey, getStoredIntegrationKey } from '../store/integrations';

const NAME = 'apify-keys.json'; // CÔ LẬP THEO BIZ

interface StoredKey {
  id: string;
  enc: string; // token đã mã hóa
  addedAt: string; // ISO
}
interface PoolFile {
  keys: StoredKey[];
}

async function readPool(): Promise<StoredKey[]> {
  return (await readJson<PoolFile>(bizFile(NAME), { keys: [] })).keys;
}

function mask(k: string): string {
  return k.length <= 8 ? '••••' : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export interface ApifyKeyInfo {
  id: string;
  masked: string;
  addedAt: string;
}

// Danh sách key cho UI (đã che) - KHÔNG trả token thô.
export async function listApifyKeys(): Promise<ApifyKeyInfo[]> {
  const keys = await readPool();
  return keys.map((k) => {
    let masked = '••••';
    try {
      masked = mask(decrypt(k.enc));
    } catch {
      /* ENCRYPTION_KEY đổi → giữ che mặc định */
    }
    return { id: k.id, masked, addedAt: k.addedAt };
  });
}

// Thêm 1 key (route đã validate token trước). Bỏ qua nếu trùng token đã có. Trả id.
export async function addApifyKey(value: string): Promise<{ id: string; duplicate: boolean }> {
  const v = value.trim();
  return mutateJson<PoolFile, { id: string; duplicate: boolean }>(
    bizFile(NAME),
    { keys: [] },
    (cur) => {
      for (const k of cur.keys) {
        try {
          if (decrypt(k.enc) === v) return [cur, { id: k.id, duplicate: true }];
        } catch {
          /* skip */
        }
      }
      const id = 'ak_' + randomBytes(6).toString('hex');
      cur.keys.push({ id, enc: encrypt(v), addedAt: new Date().toISOString() });
      return [cur, { id, duplicate: false }];
    },
  );
}

export async function deleteApifyKey(id: string): Promise<void> {
  await mutateJson<PoolFile, void>(bizFile(NAME), { keys: [] }, (cur) => {
    cur.keys = cur.keys.filter((k) => k.id !== id);
    return [cur, undefined];
  });
}

// Chuyển key ĐƠN cũ (integrations.json['apify'] - KHÔNG phải env) vào pool một lần, để UI quản lý
// thống nhất. Idempotent: chỉ chạy khi pool đang rỗng và có key store cũ.
export async function migrateLegacyApifyKey(): Promise<void> {
  if ((await readPool()).length) return;
  const legacy = await getStoredIntegrationKey('apify');
  if (!legacy) return;
  await addApifyKey(legacy);
  await deleteIntegrationKey('apify');
}

export interface ApifyPoolMember {
  id: string;
  token: string;
}

// POOL RUNTIME dùng để gọi Apify:
// - Có key trong pool → dùng CHỈ pool (user tự quản lý nhiều key).
// - Pool rỗng → fallback key ĐƠN cũ (store hoặc env APIFY_API_TOKEN) với id 'default' (tương thích
//   ngược cho tài khoản chưa thêm key vào pool).
export async function getApifyPool(): Promise<ApifyPoolMember[]> {
  const keys = await readPool();
  const out: ApifyPoolMember[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    try {
      const token = decrypt(k.enc);
      if (token && !seen.has(token)) {
        seen.add(token);
        out.push({ id: k.id, token });
      }
    } catch {
      /* skip key không giải mã được */
    }
  }
  if (out.length) return out;
  // Fallback (pool rỗng): key ĐƠN store cũ hoặc env APIFY_API_TOKEN (tương thích ngược).
  const legacy = (await getStoredIntegrationKey('apify')) || process.env.APIFY_API_TOKEN;
  return legacy ? [{ id: 'default', token: legacy }] : [];
}

// Token của run đang chạy dở (poll/dataset PHẢI dùng ĐÚNG key đã start run). undefined nếu key đã bị xóa.
export async function getApifyTokenById(id: string): Promise<string | undefined> {
  return (await getApifyPool()).find((m) => m.id === id)?.token;
}

// Pool theo THỨ TỰ NGẪU NHIÊN (mỗi run gọi để chọn key + thử lần lượt khi lỗi key).
export async function shuffledApifyPool(): Promise<ApifyPoolMember[]> {
  const pool = await getApifyPool();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
