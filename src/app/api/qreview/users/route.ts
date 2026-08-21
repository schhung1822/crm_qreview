import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import {
  enforceRateLimit,
  readJsonBody,
  sanitizeText,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
import { requireQreviewAdmin } from "@/lib/qreview/guard";
import {
  destroyAllSessionsForUser,
  isAdminEmail,
} from "@/lib/qreview/site-users";
import { ensureDatabaseConfig, getDbPool, queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

type AdminUserRow = RowDataPacket & {
  id: number;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  status_: string | null;
  create_time: Date | string | null;
  last_login_time: Date | string | null;
  session_count: number | null;
};

const MAX_PAGE_SIZE = 100;

const ALLOWED_ROLES = new Set(["admin", "user"]);
const ALLOWED_STATUSES = new Set(["active", "blocked"]);

function toIso(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row: AdminUserRow) {
  const email = (row.email ?? "").trim().toLowerCase();

  return {
    id: String(row.id),
    email,
    name: (row.name ?? "").trim() || null,
    username: (row.username ?? "").trim() || null,
    role: (row.role ?? "user").trim().toLowerCase() === "admin" ? "admin" : "user",
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    // Email trong ADMIN_EMAILS luon la admin, khong the go quyen tu giao dien.
    isEnvAdmin: isAdminEmail(email),
    activeSessions: Number(row.session_count ?? 0),
    createdAt: toIso(row.create_time),
    lastLoginAt: toIso(row.last_login_time),
  };
}

/** Danh sach nguoi dung. Khong bao gio tra ve cot `password`. */
export async function GET(request: Request) {
  try {
    const limited = enforceRateLimit(request, {
      name: "admin-users-read",
      limit: 60,
      windowMs: 60 * 1000,
    });

    if (limited) {
      return limited;
    }

    const auth = await requireQreviewAdmin();

    if ("response" in auth) {
      return auth.response;
    }

    ensureDatabaseConfig();

    const url = new URL(request.url);
    const search = sanitizeText(url.searchParams.get("q"), 100);
    const requestedLimit = Number(url.searchParams.get("limit") ?? MAX_PAGE_SIZE);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE)
      : MAX_PAGE_SIZE;

    // LIKE voi tham so hoa: `%` va `_` do nguoi dung nhap chi mo rong ket qua
    // tim kiem cua chinh ho, khong the thoat ra khoi cau lenh.
    const params: unknown[] = [];
    let whereClause = "";

    if (search) {
      whereClause = "WHERE u.email LIKE ? OR u.name LIKE ? OR u.username LIKE ?";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    const rows = await queryRows<AdminUserRow>(
      `
        SELECT
          u.id, u.email, u.name, u.username, u.role, u.status_,
          u.create_time, u.last_login_time,
          (
            SELECT COUNT(*) FROM user_sessions s
            WHERE s.user_id = u.id AND s.expires_at > NOW()
          ) AS session_count
        FROM users u
        ${whereClause}
        ORDER BY u.id DESC
        LIMIT ?
      `,
      [...params, limit]
    );

    // Nguoi quan tri dang nhap bang tai khoan CRM, khong phai tai khoan website.
    // Doi chieu theo email de giao dien van danh dau duoc "tai khoan cua ban" khi
    // nguoi do cung co tai khoan doc gia tren website.
    const actorEmail = auth.user.email.trim().toLowerCase();
    const selfRow = rows.find(
      (row) => (row.email ?? "").trim().toLowerCase() === actorEmail
    );

    return NextResponse.json({
      users: rows.map(mapRow),
      currentUserId: selfRow ? String(selfRow.id) : null,
    });
  } catch (error) {
    return serverErrorResponse(
      "Admin users list error",
      error,
      "Khong the tai danh sach nguoi dung.",
      { users: [] }
    );
  }
}

/** Doi quyen hoac khoa/mo khoa mot tai khoan. */
export async function PATCH(request: Request) {
  try {
    const limited = enforceRateLimit(request, {
      name: "admin-users-write",
      limit: 30,
      windowMs: 60 * 1000,
      blockMs: 5 * 60 * 1000,
    });

    if (limited) {
      return limited;
    }

    const auth = await requireQreviewAdmin();

    if ("response" in auth) {
      return auth.response;
    }

    ensureDatabaseConfig();

    const parsed = await readJsonBody<Record<string, unknown>>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const targetId = sanitizeText(parsed.data.id, 32);

    if (!targetId || !/^\d+$/.test(targetId)) {
      return NextResponse.json({ error: "Thieu id nguoi dung." }, { status: 400 });
    }

    const targetRows = await queryRows<AdminUserRow>(
      `
        SELECT id, email, name, username, role, status_, create_time, last_login_time,
               0 AS session_count
        FROM users WHERE id = ? LIMIT 1
      `,
      [targetId]
    );

    const target = targetRows[0];

    if (!target) {
      return NextResponse.json(
        { error: "Khong tim thay nguoi dung." },
        { status: 404 }
      );
    }

    const targetEmail = (target.email ?? "").trim().toLowerCase();

    // Chan tu doi quyen / tu khoa. Nguoi quan tri dang nhap bang tai khoan CRM
    // nen khong the so sanh theo id — doi chieu theo email de van bat duoc
    // truong hop ho dang thao tac chinh tai khoan doc gia cua minh.
    if (targetEmail && targetEmail === auth.user.email.trim().toLowerCase()) {
      return NextResponse.json(
        { error: "Ban khong the tu doi quyen hoac tu khoa tai khoan cua minh." },
        { status: 400 }
      );
    }

    const rawRole = sanitizeText(parsed.data.role, 32)?.toLowerCase();
    const rawStatus = sanitizeText(parsed.data.status, 32)?.toLowerCase();

    if (rawRole && !ALLOWED_ROLES.has(rawRole)) {
      return NextResponse.json({ error: "Quyen khong hop le." }, { status: 400 });
    }

    if (rawStatus && !ALLOWED_STATUSES.has(rawStatus)) {
      return NextResponse.json({ error: "Trang thai khong hop le." }, { status: 400 });
    }

    if (!rawRole && !rawStatus) {
      return NextResponse.json({ error: "Khong co gi de cap nhat." }, { status: 400 });
    }

    // ADMIN_EMAILS la nguon su that cao nhat. Cho phep "ha quyen" trong CSDL se
    // tao cam giac sai: nguoi do van la admin o lan dang nhap ke tiep.
    if (isAdminEmail(targetEmail) && (rawRole === "user" || rawStatus === "blocked")) {
      return NextResponse.json(
        {
          error:
            "Tai khoan nay duoc cap quyen admin qua bien moi truong ADMIN_EMAILS. " +
            "Hay go email khoi ADMIN_EMAILS truoc.",
        },
        { status: 409 }
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (rawRole) {
      updates.push("role = ?");
      values.push(rawRole);
    }

    if (rawStatus) {
      updates.push("status_ = ?");
      values.push(rawStatus);
    }

    updates.push("update_time = ?");
    values.push(new Date());

    await getDbPool().query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      [...values, targetId]
    );

    // Khoa tai khoan phai co hieu luc ngay: huy toan bo phien dang mo cua ho.
    if (rawStatus === "blocked") {
      await destroyAllSessionsForUser(targetId);
    }

    const updatedRows = await queryRows<AdminUserRow>(
      `
        SELECT
          u.id, u.email, u.name, u.username, u.role, u.status_,
          u.create_time, u.last_login_time,
          (
            SELECT COUNT(*) FROM user_sessions s
            WHERE s.user_id = u.id AND s.expires_at > NOW()
          ) AS session_count
        FROM users u WHERE u.id = ? LIMIT 1
      `,
      [targetId]
    );

    return NextResponse.json({ user: updatedRows[0] ? mapRow(updatedRows[0]) : null });
  } catch (error) {
    return serverErrorResponse(
      "Admin users update error",
      error,
      "Khong the cap nhat nguoi dung."
    );
  }
}
