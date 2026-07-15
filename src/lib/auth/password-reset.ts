// Token ĐẶT LẠI MẬT KHẨU - một-lần, có hạn. Lưu HASH (sha256) của token trong .data/password-resets.json
// (không lưu token thô để ai đọc được file cũng không dùng lại được). Server-only.
//
// BẢO MẬT (khác cơ chế cũ "gửi mật khẩu mới"): KHÔNG đổi mật khẩu khi mới nhận yêu cầu. Chỉ khi
// người dùng CHỨNG MINH kiểm soát email (bấm link chứa token) và TỰ đặt mật khẩu mới thì mới đổi.
// Nhờ vậy: (1) không ai ép đổi mật khẩu tài khoản người khác chỉ bằng email, (2) không gửi mật khẩu
// dạng plaintext qua email.
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';

const TTL_MS = 1000 * 60 * 30; // 30 phút

interface ResetRow {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

const FILE = path.join(process.cwd(), '.data', 'password-resets.json');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function readAll(): Promise<ResetRow[]> {
  const rows = await readJson<ResetRow[]>(FILE, []);
  const now = Date.now();
  return rows.filter((r) => r.expiresAt > now); // tự dọn token hết hạn
}

// Tạo token reset cho user → trả TOKEN THÔ (chỉ có ở đây, để nhét vào link email). Vô hiệu các
// token cũ của cùng user (mỗi lần yêu cầu chỉ 1 link còn hiệu lực).
export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex'); // 256-bit
  const tokenHash = hashToken(token);
  const now = Date.now();
  await mutateJson<ResetRow[], void>(FILE, [], (rows) => {
    const live = rows.filter((r) => r.expiresAt > now && r.userId !== userId);
    return [[...live, { tokenHash, userId, expiresAt: now + TTL_MS }], undefined];
  });
  return token;
}

// Đổi token thô → userId nếu hợp lệ, đồng thời XÓA token (một-lần). Trả null nếu sai/hết hạn.
export async function consumeResetToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  return mutateJson<ResetRow[], string | null>(FILE, [], (rows) => {
    const live = rows.filter((r) => r.expiresAt > now);
    const row = live.find((r) => r.tokenHash === tokenHash);
    if (!row) return [live, null];
    // Xóa token vừa dùng (một-lần).
    return [live.filter((r) => r.tokenHash !== tokenHash), row.userId];
  });
}
