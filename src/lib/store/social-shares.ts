// INDEX TOÀN CỤC cho link chia sẻ Báo cáo Social: map HASH(token) → {bizId, reportId, ownerId}.
// Vì trang công khai KHÔNG có cookie biz, không biết báo cáo thuộc biz nào → phải tra token ở đây
// (giống api-tokens). Chỉ lưu sha256(token), so sánh constant-time. Lưu .data/social-shares.json.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { resolveEncryptionKey } from '../secrets/key';

interface ShareRow {
  tokenHash: string;
  bizId: string;
  reportId: string;
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
): Promise<{ bizId: string; reportId: string; ownerId: string; locked: boolean } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const target = Buffer.from(hashToken(token), 'hex');
  const rows = await readJson<ShareRow[]>(FILE, []);
  for (const r of rows) {
    if (r.revoked) continue;
    const rb = Buffer.from(r.tokenHash, 'hex');
    if (rb.length === target.length && timingSafeEqual(rb, target)) {
      return { bizId: r.bizId, reportId: r.reportId, ownerId: r.ownerId, locked: !!r.passwordHash };
    }
  }
  return null;
}

// Đặt/gỡ mật khẩu khóa cho link CÒN HIỆU LỰC của 1 báo cáo. password rỗng/null = gỡ khóa (công khai).
export async function setSharePassword(
  bizId: string,
  reportId: string,
  password: string | null,
): Promise<boolean> {
  let ok = false;
  await mutateJson<ShareRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === bizId && r.reportId === reportId && !r.revoked) {
        r.passwordHash = password ? hashPw(password) : undefined;
        ok = true;
      }
    }
    return [rows, undefined];
  });
  return ok;
}

// Map reportId → có khóa hay không (link còn hiệu lực của biz) — dùng cho trang quản lý link.
export async function getShareLockedMap(bizId: string): Promise<Record<string, boolean>> {
  const rows = await readJson<ShareRow[]>(FILE, []);
  const map: Record<string, boolean> = {};
  for (const r of rows) {
    if (r.bizId === bizId && !r.revoked) map[r.reportId] = !!r.passwordHash;
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

// ── Cookie "đã mở khóa" (ký HMAC bằng khóa server → chứng minh server cấp sau khi đúng mật khẩu) ──
export function shareAccessCookieName(token: string): string {
  return `sgshr_${token.slice(0, 24)}`;
}
export function shareAccessValue(token: string): string {
  return createHmac('sha256', resolveEncryptionKey()).update(`share-access:${token}`).digest('hex');
}
export function checkShareAccess(token: string, cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  const a = Buffer.from(cookieVal);
  const e = Buffer.from(shareAccessValue(token));
  return a.length === e.length && timingSafeEqual(a, e);
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
