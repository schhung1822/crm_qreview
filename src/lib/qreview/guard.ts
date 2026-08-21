import { NextResponse } from "next/server";

import { getCurrentUser, guard, type AuthUser } from "@/lib/auth/current";
import { isSuperadminUser } from "@/lib/auth/superadmin";

/**
 * Chot chan quyen cho khu quan tri WEBSITE Qreview.
 *
 * Khu nay dieu khien noi dung cong khai cua mot website that (san pham, bai
 * viet, trang chu), nen chi chu nen tang — email trong SUPERADMIN_EMAILS —
 * duoc vao. Dung dung `users:manage` cua CRM: quyen do dung de quan ly nhan su
 * trong CRM, khong dong nghia voi quyen sua noi dung website.
 *
 * Hai lop dung o hai noi khac nhau:
 *   - `requireQreviewAdmin()` cho route API — tra ve NextResponse khi tu choi.
 *   - `resolveQreviewAdmin()` cho layout trang — tra ve trang thai de layout tu
 *     quyet dinh chuyen huong hay hien thong bao.
 */

export type QreviewAdminGuard = { user: AuthUser } | { response: NextResponse };

/**
 * Dung trong route `/api/qreview/*`.
 *
 * `guard()` cua CRM da kiem tra phien dang nhap VA nguon goc request
 * (chong CSRF), nen khong can lam lai o day.
 */
export async function requireQreviewAdmin(): Promise<QreviewAdminGuard> {
  const result = await guard();

  if ("response" in result) {
    return { response: result.response };
  }

  if (!(await isSuperadminUser(result.user.id))) {
    return {
      response: NextResponse.json(
        { error: "Không đủ quyền truy cập khu quản trị website." },
        { status: 403 }
      ),
    };
  }

  return { user: result.user };
}

export type QreviewAdminAccess =
  | { state: "anonymous" }
  | { state: "forbidden"; user: AuthUser }
  | { state: "allowed"; user: AuthUser };

/** Dung trong layout cua `/[locale]/qreview` de dung cong kiem soat. */
export async function resolveQreviewAdmin(): Promise<QreviewAdminAccess> {
  const user = await getCurrentUser();

  if (!user) {
    return { state: "anonymous" };
  }

  if (!(await isSuperadminUser(user.id))) {
    return { state: "forbidden", user };
  }

  return { state: "allowed", user };
}
