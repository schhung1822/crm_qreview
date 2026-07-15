// INDEX TOÀN CỤC cho link chia sẻ PHÂN TÍCH KỊCH BẢN: HASH(token) → {bizId, analysisId, ownerId}.
// Trang công khai không có cookie biz → phải tra token ở đây (giống social-shares). Chỉ lưu
// sha256(token), so sánh constant-time. Lưu .data/script-shares.json.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

interface ShareRow {
  tokenHash: string;
  bizId: string;
  analysisId: string;
  ownerId: string;
  createdBy: string;
  createdAt: string;
  revoked?: boolean;
}

const FILE = globalFile('script-shares.json');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Tạo token chia sẻ mới (256-bit) cho 1 bản phân tích; thu hồi token cũ còn hiệu lực của cùng bản.
// Trả TOKEN THÔ (chỉ có ở đây → caller lưu vào record của biz).
export async function createShare(input: {
  bizId: string;
  analysisId: string;
  ownerId: string;
  createdBy: string;
}): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === input.bizId && r.analysisId === input.analysisId && !r.revoked) r.revoked = true;
    }
    rows.push({ tokenHash, bizId: input.bizId, analysisId: input.analysisId, ownerId: input.ownerId, createdBy: input.createdBy, createdAt: now });
    return [rows, undefined];
  });
  return token;
}

// Tra token thô → {bizId, analysisId, ownerId} nếu hợp lệ & chưa thu hồi. So sánh HASH constant-time.
export async function resolveShare(
  token: string,
): Promise<{ bizId: string; analysisId: string; ownerId: string } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const target = Buffer.from(hashToken(token), 'hex');
  const rows = await readJson<ShareRow[]>(FILE, []);
  for (const r of rows) {
    if (r.revoked) continue;
    const rb = Buffer.from(r.tokenHash, 'hex');
    if (rb.length === target.length && timingSafeEqual(rb, target)) {
      return { bizId: r.bizId, analysisId: r.analysisId, ownerId: r.ownerId };
    }
  }
  return null;
}

// Thu hồi mọi link của 1 bản phân tích — CHỈ trong đúng biz (chống thu hồi chéo tenant).
export async function revokeShareForAnalysis(bizId: string, analysisId: string): Promise<void> {
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === bizId && r.analysisId === analysisId) r.revoked = true;
    }
    return [rows, undefined];
  });
}
