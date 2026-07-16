// INDEX TOÀN CỤC cho link chia sẻ PHÂN TÍCH KỊCH BẢN: HASH(token) → {bizId, analysisId, ownerId}.
// Trang công khai không có cookie biz → phải tra token ở đây (giống social-shares). Chỉ lưu
// sha256(token), so sánh constant-time. Lưu .data/script-shares.json.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { resolveEncryptionKey } from '../secrets/key';

interface ShareRow {
  tokenHash: string;
  bizId: string;
  analysisId: string;
  ownerId: string;
  createdBy: string;
  createdAt: string;
  revoked?: boolean;
  passwordHash?: string; // có = link BỊ KHÓA, phải nhập mật khẩu mới xem (định dạng "salt:hash" scrypt)
}

// ── Băm/xác thực mật khẩu link (scrypt + salt, so sánh constant-time) ──
function hashPw(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
function verifyPw(pw: string, stored: string): boolean {
  const [saltHex, hHex] = stored.split(':');
  if (!saltHex || !hHex) return false;
  const expected = Buffer.from(hHex, 'hex');
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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

// Tra token thô → {bizId, analysisId, ownerId, locked} nếu hợp lệ & chưa thu hồi. So HASH constant-time.
export async function resolveShare(
  token: string,
): Promise<{ bizId: string; analysisId: string; ownerId: string; locked: boolean } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const target = Buffer.from(hashToken(token), 'hex');
  const rows = await readJson<ShareRow[]>(FILE, []);
  for (const r of rows) {
    if (r.revoked) continue;
    const rb = Buffer.from(r.tokenHash, 'hex');
    if (rb.length === target.length && timingSafeEqual(rb, target)) {
      return { bizId: r.bizId, analysisId: r.analysisId, ownerId: r.ownerId, locked: !!r.passwordHash };
    }
  }
  return null;
}

// Đặt/gỡ mật khẩu khóa cho link CÒN HIỆU LỰC của 1 bản phân tích. password rỗng/null = gỡ (công khai).
export async function setSharePassword(
  bizId: string,
  analysisId: string,
  password: string | null,
): Promise<boolean> {
  let ok = false;
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === bizId && r.analysisId === analysisId && !r.revoked) {
        r.passwordHash = password ? hashPw(password) : undefined;
        ok = true;
      }
    }
    return [rows, undefined];
  });
  return ok;
}

// Map analysisId → có khóa hay không (link còn hiệu lực của biz) — dùng cho trang quản lý link.
export async function getShareLockedMap(bizId: string): Promise<Record<string, boolean>> {
  const rows = await readJson<ShareRow[]>(FILE, []);
  const map: Record<string, boolean> = {};
  for (const r of rows) {
    if (r.bizId === bizId && !r.revoked) map[r.analysisId] = !!r.passwordHash;
  }
  return map;
}

// Xác thực mật khẩu người xem nhập cho 1 token.
export async function verifySharePassword(token: string, password: string): Promise<boolean> {
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !password) return false;
  const target = Buffer.from(hashToken(token), 'hex');
  const rows = await readJson<ShareRow[]>(FILE, []);
  for (const r of rows) {
    if (r.revoked || !r.passwordHash) continue;
    const rb = Buffer.from(r.tokenHash, 'hex');
    if (rb.length === target.length && timingSafeEqual(rb, target)) {
      return verifyPw(password, r.passwordHash);
    }
  }
  return false;
}

// ── Cookie "đã mở khóa" (ký HMAC bằng khóa server). Prefix riêng (vshr_) tách khỏi link social ──
export function shareAccessCookieName(token: string): string {
  return `vshr_${token.slice(0, 24)}`;
}
export function shareAccessValue(token: string): string {
  return createHmac('sha256', resolveEncryptionKey()).update(`video-share-access:${token}`).digest('hex');
}
export function checkShareAccess(token: string, cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  const a = Buffer.from(cookieVal);
  const e = Buffer.from(shareAccessValue(token));
  return a.length === e.length && timingSafeEqual(a, e);
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
