// Phiên đăng nhập - token ngẫu nhiên (crypto). Lưu HASH (sha256) của token trong .data/sessions.json
// (không lưu token thô để ai đọc được store — file hoặc bảng JsonBlob Postgres — cũng không chiếm
// được phiên của user). Cùng cơ chế với password-reset.ts / email-verification.ts. Server-only.
//
// MIGRATION: các phiên cũ lưu field `token` plaintext (không có `tokenHash`) sẽ KHÔNG còn khớp
// → coi như hết hạn, bị lọc dần khỏi store ở các lần mutate. Hệ quả: deploy bản này sẽ
// ĐĂNG XUẤT TOÀN BỘ USER một lần (phải đăng nhập lại). Code đọc không crash khi gặp row cũ:
// so sánh `tokenHash` của row cũ là undefined → không bao giờ khớp hash hex 64 ký tự.
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';
import { getRepos, storageDriver } from '../data/repos';

export const SESSION_COOKIE = 'sg_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 ngày

interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

const FILE = path.join(process.cwd(), '.data', 'sessions.json');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function readAll(): Promise<Session[]> {
  const rows = await readJson<Session[]>(FILE, []);
  const now = Date.now();
  return rows.filter((s) => s.expiresAt > now); // tự dọn phiên hết hạn
}

// Tạo phiên mới → trả TOKEN THÔ đúng 1 lần (chỉ để set cookie); store chỉ giữ hash.
export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('hex'); // 256-bit
  const tokenHash = hashToken(token);
  const now = Date.now();
  if (storageDriver() === 'prisma') {
    await (await getRepos()).sessions.insert({ token: tokenHash, userId, expiresAt: now + TTL_MS });
    return { token, maxAge: Math.floor(TTL_MS / 1000) };
  }
  await mutateJson<Session[], void>(FILE, [], (rows) => {
    const live = rows.filter((s) => s.expiresAt > now);
    return [[...live, { tokenHash, userId, expiresAt: now + TTL_MS }], undefined];
  });
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

// Nhận token thô từ cookie → hash rồi tra. Tra theo hash là đủ an toàn thời gian: kẻ tấn công
// không kiểm soát được hash lưu trong store, và sha256 làm mất tương quan thời gian với input.
export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  if (storageDriver() === 'prisma') return (await getRepos()).sessions.userIdFor(tokenHash);
  const row = (await readAll()).find((s) => s.tokenHash === tokenHash);
  return row ? row.userId : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  if (storageDriver() === 'prisma') {
    await (await getRepos()).sessions.removeByToken(tokenHash);
    return;
  }
  await mutateJson<Session[], void>(FILE, [], (rows) => [
    rows.filter((s) => s.tokenHash !== tokenHash),
    undefined,
  ]);
}

// Hủy MỌI phiên của một user - gọi khi đổi mật khẩu / vô hiệu hóa / đổi vai trò,
// để phiên cũ (có thể đã bị lộ) không còn dùng được.
export async function destroySessionsForUser(userId: string): Promise<void> {
  if (storageDriver() === 'prisma') {
    await (await getRepos()).sessions.removeByUser(userId);
    return;
  }
  await mutateJson<Session[], void>(FILE, [], (rows) => [
    rows.filter((s) => s.userId !== userId),
    undefined,
  ]);
}
