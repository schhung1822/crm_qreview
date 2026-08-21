import "server-only";

import { getDbPool } from "@/lib/qreview/db";

/**
 * Cac tien ich lam viec voi TAI KHOAN CUA WEBSITE Qreview (bang `users` trong
 * CSDL `qreview`) — hoan toan tach biet voi tai khoan dang nhap CRM.
 *
 * Nguoi quan tri dang nhap bang tai khoan CRM; nhung thu ho quan ly o man hinh
 * "Người dùng" lai la doc gia cua website. Hai he tai khoan nay khong lien quan
 * nhau, va file nay chi phuc vu he thu hai.
 */

/**
 * Danh sach email duoc cap quyen admin TREN WEBSITE qua bien moi truong:
 *   QREVIEW_ADMIN_EMAILS="sep@congty.vn, ky-thuat@congty.vn"
 *
 * Man hinh quan ly nguoi dung doc danh sach nay de khong cho ha quyen mot tai
 * khoan von duoc cap admin boi cau hinh — thao tac do se khong co tac dung
 * that su va chi lam nguoi dung bo i roi.
 */
function getAdminEmailsFromEnv() {
  return (process.env.QREVIEW_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getAdminEmailsFromEnv().includes(email.trim().toLowerCase());
}

/** Xoa toan bo phien cua mot tai khoan website (khoa tai khoan, doi vai tro...). */
export async function destroyAllSessionsForUser(userId: string) {
  await getDbPool().query("DELETE FROM user_sessions WHERE user_id = ?", [userId]);
}
