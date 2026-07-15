// Nhận diện SUPERADMIN (chủ nền tảng SaaS) qua biến môi trường SUPERADMIN_EMAILS (danh sách email,
// phân tách bằng dấu phẩy). Superadmin toàn quyền quản trị nền tảng + luôn ở gói Enterprise.
import { findById } from './users';

function superadminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperadminEmail(email: string): boolean {
  return superadminEmails().includes((email ?? '').trim().toLowerCase());
}

export async function isSuperadminUser(userId: string): Promise<boolean> {
  const u = await findById(userId);
  return !!u && isSuperadminEmail(u.email);
}
