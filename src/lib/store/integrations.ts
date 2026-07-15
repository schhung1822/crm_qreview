// Khóa API tích hợp NGOÀI AI (PageSpeed…) - gom vào trang "API Keys & AI" cho gọn.
// Lưu mã hóa AES-256-GCM ở .data/integrations.json (không bao giờ trả key thô ra client).
// Ưu tiên key đã nhập ở UI; fallback biến môi trường. Server-only.
import { decrypt, encrypt } from '../crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface IntegrationMeta {
  id: string;
  label: string;
  env: string; // biến môi trường fallback
  hintKey: string; // khóa i18n mô tả ngắn: settings.intHint.<id>
}

// Danh sách khóa tích hợp ĐƠN (thêm key mới chỉ cần thêm 1 dòng + i18n hint).
// LƯU Ý: Apify KHÔNG ở đây - nó dùng POOL NHIỀU KEY riêng (src/lib/social/apify-keys.ts), quản lý
// ở modal riêng trong Quản lý kết nối. Key store cũ + env APIFY_API_TOKEN vẫn được pool đọc làm fallback.
export const INTEGRATIONS: IntegrationMeta[] = [
  { id: 'pagespeed', label: 'Google PageSpeed Insights', env: 'PAGESPEED_API_KEY', hintKey: 'pagespeed' },
  { id: 'perplexity', label: 'Perplexity (đo Lượt AI trích dẫn)', env: 'PERPLEXITY_API_KEY', hintKey: 'perplexity' },
];

type Store = Record<string, string>; // id -> chuỗi đã mã hóa
const NAME = 'integrations.json'; // CÔ LẬP THEO BIZ

async function readAll(): Promise<Store> {
  return readJson<Store>(bizFile(NAME), {});
}

function mask(k: string): string {
  return k.length <= 8 ? '••••' : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// Lấy key dùng được: store (giải mã) → env → undefined.
export async function getIntegrationKey(id: string): Promise<string | undefined> {
  const meta = INTEGRATIONS.find((i) => i.id === id);
  const store = await readAll();
  const enc = store[id];
  if (enc) {
    try {
      return decrypt(enc);
    } catch {
      // ENCRYPTION_KEY đổi → bỏ qua, thử env.
    }
  }
  if (meta?.env) {
    const v = process.env[meta.env];
    if (v) return v;
  }
  return undefined;
}

// Chỉ lấy key ĐÃ LƯU trong store (KHÔNG fallback env) - dùng để migrate key đơn cũ sang pool.
export async function getStoredIntegrationKey(id: string): Promise<string | undefined> {
  const enc = (await readAll())[id];
  if (!enc) return undefined;
  try {
    return decrypt(enc);
  } catch {
    return undefined;
  }
}

export async function setIntegrationKey(id: string, value: string): Promise<void> {
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
    cur[id] = encrypt(value.trim());
    return [cur, undefined];
  });
}

export async function deleteIntegrationKey(id: string): Promise<void> {
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
    delete cur[id];
    return [cur, undefined];
  });
}

export interface IntegrationStatus extends IntegrationMeta {
  hasKey: boolean;
  source: 'store' | 'env' | 'none';
  masked?: string;
}

// Trạng thái cho UI - KHÔNG lộ key, chỉ masked + nguồn.
export async function integrationStatus(): Promise<IntegrationStatus[]> {
  const store = await readAll();
  return Promise.all(
    INTEGRATIONS.map(async (m) => {
      const enc = store[m.id];
      if (enc) {
        let masked: string | undefined;
        try {
          masked = mask(decrypt(enc));
        } catch {
          /* không giải mã được */
        }
        return { ...m, hasKey: true, source: 'store' as const, masked };
      }
      const envv = m.env ? process.env[m.env] : undefined;
      if (envv) return { ...m, hasKey: true, source: 'env' as const, masked: mask(envv) };
      return { ...m, hasKey: false, source: 'none' as const };
    }),
  );
}
