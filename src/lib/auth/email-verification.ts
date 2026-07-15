// Token XÁC THỰC EMAIL đăng ký - một-lần, có hạn. Lưu HASH (sha256) của token trong
// .data/email-verifications.json (không lưu token thô để ai đọc được file cũng không dùng lại được).
// Server-only. Cùng cơ chế với password-reset.ts.
//
// LUỒNG: đăng ký → tài khoản emailVerified=false (chưa đăng nhập được) → email chứa link
// /login?verify=<token> → người dùng bấm link CHỨNG MINH kiểm soát email → kích hoạt + đăng nhập.
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson } from '../data/json-store';

const TTL_MS = 1000 * 60 * 60 * 24; // 24 giờ (dài hơn reset mật khẩu - người mới có thể mở email muộn)

interface VerifyRow {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

const FILE = path.join(process.cwd(), '.data', 'email-verifications.json');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Tạo token kích hoạt cho user → trả TOKEN THÔ (chỉ có ở đây, để nhét vào link email). Vô hiệu các
// token cũ của cùng user (gửi lại email = chỉ link mới nhất còn hiệu lực). `file` chỉ dùng cho test.
export async function createVerifyToken(userId: string, file: string = FILE): Promise<string> {
  const token = randomBytes(32).toString('hex'); // 256-bit
  const tokenHash = hashToken(token);
  const now = Date.now();
  await mutateJson<VerifyRow[], void>(file, [], (rows) => {
    const live = rows.filter((r) => r.expiresAt > now && r.userId !== userId);
    return [[...live, { tokenHash, userId, expiresAt: now + TTL_MS }], undefined];
  });
  return token;
}

// Đổi token thô → userId nếu hợp lệ, đồng thời XÓA token (một-lần). Trả null nếu sai/hết hạn.
export async function consumeVerifyToken(
  token: string | undefined,
  file: string = FILE,
): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  return mutateJson<VerifyRow[], string | null>(file, [], (rows) => {
    const live = rows.filter((r) => r.expiresAt > now);
    const row = live.find((r) => r.tokenHash === tokenHash);
    if (!row) return [live, null];
    // Xóa token vừa dùng (một-lần).
    return [live.filter((r) => r.tokenHash !== tokenHash), row.userId];
  });
}
