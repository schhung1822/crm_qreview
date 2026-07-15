// Nhật ký thao tác QUẢN TRỊ NỀN TẢNG qua API (order/user/biz/coupon). Toàn cục
// .data/admin-audit.json. Ghi ai (token) làm gì, lên tài nguyên nào, thành công/thất bại.
// Giữ N bản ghi gần nhất để không phình. Server-only.
import { randomBytes } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface AuditEntry {
  id: string;
  at: string; // ISO
  via: 'api' | 'ui';
  tokenId?: string; // token API đã dùng (nếu via=api)
  actor?: string; // userId (nếu via=ui) hoặc tên token
  action: string; // vd 'order.status', 'user.suspend', 'coupon.upsert'
  resource: string; // 'order' | 'user' | 'biz' | 'coupon'
  resourceId?: string;
  detail?: Record<string, unknown>;
  ok: boolean;
  error?: string;
  ip?: string;
}

const NAME = 'admin-audit.json';
const MAX = 5000;

export async function appendAudit(input: Omit<AuditEntry, 'id' | 'at'>): Promise<void> {
  const entry: AuditEntry = {
    ...input,
    id: 'aud_' + randomBytes(8).toString('hex'),
    at: new Date().toISOString(),
  };
  await mutateJson<AuditEntry[], void>(globalFile(NAME), [], (rows) => {
    const all = [entry, ...rows];
    return [all.slice(0, MAX), undefined];
  }).catch(() => {
    /* audit lỗi không được làm hỏng thao tác chính */
  });
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const rows = await readJson<AuditEntry[]>(globalFile(NAME), []);
  return rows.slice(0, Math.min(Math.max(1, limit), MAX));
}
