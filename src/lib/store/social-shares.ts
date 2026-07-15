// INDEX TOÀN CỤC cho link chia sẻ Báo cáo Social: map HASH(token) → {bizId, reportId, ownerId}.
// Vì trang công khai KHÔNG có cookie biz, không biết báo cáo thuộc biz nào → phải tra token ở đây
// (giống api-tokens). Chỉ lưu sha256(token), so sánh constant-time. Lưu .data/social-shares.json.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

interface ShareRow {
  tokenHash: string;
  bizId: string;
  reportId: string;
  ownerId: string;
  createdBy: string;
  createdAt: string;
  revoked?: boolean;
}

const FILE = globalFile('social-shares.json');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Tạo token chia sẻ mới cho 1 báo cáo (256-bit). Thu hồi mọi token cũ CÒN HIỆU LỰC của cùng báo
// cáo (mỗi báo cáo chỉ 1 link sống). Trả TOKEN THÔ (chỉ có ở đây → caller lưu vào record của biz).
export async function createShare(input: {
  bizId: string;
  reportId: string;
  ownerId: string;
  createdBy: string;
}): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === input.bizId && r.reportId === input.reportId && !r.revoked) r.revoked = true;
    }
    rows.push({ tokenHash, bizId: input.bizId, reportId: input.reportId, ownerId: input.ownerId, createdBy: input.createdBy, createdAt: now });
    return [rows, undefined];
  });
  return token;
}

// Tra token thô → {bizId, reportId, ownerId} nếu hợp lệ & chưa thu hồi. So sánh HASH constant-time.
export async function resolveShare(
  token: string,
): Promise<{ bizId: string; reportId: string; ownerId: string } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const target = Buffer.from(hashToken(token), 'hex');
  const rows = await readJson<ShareRow[]>(FILE, []);
  for (const r of rows) {
    if (r.revoked) continue;
    const rb = Buffer.from(r.tokenHash, 'hex');
    if (rb.length === target.length && timingSafeEqual(rb, target)) {
      return { bizId: r.bizId, reportId: r.reportId, ownerId: r.ownerId };
    }
  }
  return null;
}

// Thu hồi mọi link của 1 báo cáo — CHỈ trong đúng biz (chống thu hồi chéo tenant).
export async function revokeShareForReport(bizId: string, reportId: string): Promise<void> {
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === bizId && r.reportId === reportId) r.revoked = true;
    }
    return [rows, undefined];
  });
}
