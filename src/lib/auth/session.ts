// Phiên đăng nhập - token ngẫu nhiên (crypto), lưu file .data/sessions.json. Server-only.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';

export const SESSION_COOKIE = 'sg_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 ngày

interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

const FILE = path.join(process.cwd(), '.data', 'sessions.json');

async function readAll(): Promise<Session[]> {
  const rows = await readJson<Session[]>(FILE, []);
  const now = Date.now();
  return rows.filter((s) => s.expiresAt > now); // tự dọn phiên hết hạn
}

export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  await mutateJson<Session[], void>(FILE, [], (rows) => {
    const live = rows.filter((s) => s.expiresAt > now);
    return [[...live, { token, userId, expiresAt: now + TTL_MS }], undefined];
  });
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const row = (await readAll()).find((s) => s.token === token);
  return row ? row.userId : null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await mutateJson<Session[], void>(FILE, [], (rows) => [
    rows.filter((s) => s.token !== token),
    undefined,
  ]);
}

// Hủy MỌI phiên của một user - gọi khi đổi mật khẩu / vô hiệu hóa / đổi vai trò,
// để phiên cũ (có thể đã bị lộ) không còn dùng được.
export async function destroySessionsForUser(userId: string): Promise<void> {
  await mutateJson<Session[], void>(FILE, [], (rows) => [
    rows.filter((s) => s.userId !== userId),
    undefined,
  ]);
}
