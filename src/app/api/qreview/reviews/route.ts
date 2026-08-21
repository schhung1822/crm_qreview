import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { sanitizeText, serverErrorResponse } from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  notFound,
  readAdminBody,
  toIsoDate,
  toPositiveInt,
  translateDbError,
} from "@/lib/qreview/api";
import { getDbPool, queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

/**
 * Quan ly danh gia va binh luan.
 *
 * KHONG co hang cho duyet: noi dung khach gui hien ngay tren trang
 * (`status_ = 'approved'` duoc dat luc tao trong `product-community.ts`).
 * Admin can thiep sau khi da dang — an di hoac xoa han.
 *
 * Chi co hai trang thai:
 *   - 'approved' : dang hien tren trang khach
 *   - 'hidden'   : bi an, khong con hien nhung du lieu van con
 *
 * Truy van o trang khach loc `= 'approved'`, nen bat ky gia tri nao khac cung
 * bi coi la an. Nho vay du lieu cu mang gia tri la ('pending', 'rejected'...)
 * van duoc xu ly dung ma khong can chuyen doi.
 */

const VISIBLE_STATUS = "approved";
const HIDDEN_STATUS = "hidden";

/** Trang thai admin duoc phep dat. */
const WRITABLE_STATUSES = new Set([VISIBLE_STATUS, HIDDEN_STATUS]);

/** Gia tri cho bo loc `?status=`. */
const FILTERS = new Set([VISIBLE_STATUS, HIDDEN_STATUS]);

/** Quy moi gia tri khong phai 'approved' ve 'hidden' de giao dien nhat quan. */
function normalizeStatus(raw: unknown) {
  const text = String(raw ?? "").trim().toLowerCase();
  return text === VISIBLE_STATUS || text === "" ? VISIBLE_STATUS : HIDDEN_STATUS;
}

type ReviewRow = RowDataPacket & {
  id: number;
  product_id: string | null;
  title: string | null;
  content: string | null;
  rating: number | null;
  guest_name: string | null;
  guest_email: string | null;
  status_: string | null;
  helpful_count: number | null;
  comment_count: number | null;
  create_time: Date | string | null;
  product_name: string | null;
};

type CommentRow = RowDataPacket & {
  id: number;
  product_id: string | null;
  review_id: string | null;
  content: string | null;
  guest_name: string | null;
  guest_email: string | null;
  status_: string | null;
  create_time: Date | string | null;
  product_name: string | null;
};

function mapReview(row: ReviewRow) {
  return {
    id: String(row.id),
    productId: (row.product_id ?? "").trim() || null,
    productName: row.product_name ?? null,
    title: row.title ?? null,
    content: row.content ?? "",
    rating: Number(row.rating ?? 0),
    authorName: (row.guest_name ?? "").trim() || "Khách",
    authorEmail: row.guest_email ?? null,
    status: normalizeStatus(row.status_),
    helpfulCount: Number(row.helpful_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    createdAt: toIsoDate(row.create_time),
  };
}

function mapComment(row: CommentRow) {
  return {
    id: String(row.id),
    productId: (row.product_id ?? "").trim() || null,
    productName: row.product_name ?? null,
    reviewId: (row.review_id ?? "").trim() || null,
    content: row.content ?? "",
    authorName: (row.guest_name ?? "").trim() || "Khách",
    authorEmail: row.guest_email ?? null,
    status: normalizeStatus(row.status_),
    createdAt: toIsoDate(row.create_time),
  };
}

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "reviews" });

    if (guard.response) {
      return guard.response;
    }

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") === "comments" ? "comments" : "reviews";
    const statusFilter = sanitizeText(url.searchParams.get("status"), 32)?.toLowerCase();

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Loc theo "dang hien" / "da an". Dung so sanh <> thay vi = 'hidden' de bat
    // duoc ca du lieu cu mang gia tri la ('pending', 'rejected'...).
    if (statusFilter && FILTERS.has(statusFilter)) {
      conditions.push(
        statusFilter === VISIBLE_STATUS
          ? "COALESCE(NULLIF(r.status_, ''), 'approved') = 'approved'"
          : "COALESCE(NULLIF(r.status_, ''), 'approved') <> 'approved'"
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    if (kind === "comments") {
      const rows = await queryRows<CommentRow>(
        `
          SELECT r.id, r.product_id, r.review_id, r.content, r.guest_name,
                 r.guest_email, r.status_, r.create_time,
                 p.name AS product_name
          FROM product_comments r
          LEFT JOIN products p ON p.id = CAST(r.product_id AS UNSIGNED)
          ${whereClause}
          ORDER BY r.id DESC
          LIMIT 300
        `,
        params
      );

      return NextResponse.json({ kind, items: rows.map(mapComment) });
    }

    const rows = await queryRows<ReviewRow>(
      `
        SELECT r.id, r.product_id, r.title, r.content, r.rating, r.guest_name,
               r.guest_email, r.status_, r.helpful_count, r.comment_count, r.create_time,
               p.name AS product_name
        FROM reviews r
        LEFT JOIN products p ON p.id = CAST(r.product_id AS UNSIGNED)
        ${whereClause}
        ORDER BY r.id DESC
        LIMIT 300
      `,
      params
    );

    return NextResponse.json({ kind, items: rows.map(mapReview) });
  } catch (error) {
    return serverErrorResponse(
      "Admin reviews list error",
      error,
      "Khong the tai danh sach danh gia.",
      { items: [] }
    );
  }
}

/**
 * Cap nhat lai so lieu tong hop cua san pham sau khi duyet/an noi dung,
 * de diem trung binh tren trang san pham khop voi thuc te.
 */
async function refreshProductStats(productId: string) {
  const pool = getDbPool();

  try {
    const [reviewRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total, ROUND(AVG(COALESCE(rating, 0)), 1) AS average
        FROM reviews
        WHERE product_id = ? AND COALESCE(NULLIF(status_, ''), 'approved') = 'approved'
      `,
      [productId]
    );

    const [commentRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total FROM product_comments
        WHERE product_id = ? AND COALESCE(NULLIF(status_, ''), 'approved') = 'approved'
      `,
      [productId]
    );

    await pool.query(
      `
        UPDATE products
        SET rating_avg = ?, review_count = ?, rating_count = ?, comment_count = ?, update_time = ?
        WHERE id = ?
      `,
      [
        Number(reviewRows[0]?.average ?? 0),
        Number(reviewRows[0]?.total ?? 0),
        Number(reviewRows[0]?.total ?? 0),
        Number(commentRows[0]?.total ?? 0),
        new Date(),
        productId,
      ]
    );
  } catch (error) {
    console.error("refreshProductStats failed:", error);
  }
}

type VisibilityPayload = {
  id?: string;
  kind?: string;
  /** 'approved' de hien lai, 'hidden' de an di. */
  status?: string;
};

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "reviews", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<VisibilityPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const id = toPositiveInt(parsed.data.id);

    if (!id) {
      return badRequest("Thiếu id.");
    }

    const status = String(parsed.data.status ?? "").trim().toLowerCase();

    if (!WRITABLE_STATUSES.has(status)) {
      return badRequest("Trạng thái không hợp lệ. Chỉ nhận 'approved' hoặc 'hidden'.");
    }

    const table = parsed.data.kind === "comments" ? "product_comments" : "reviews";
    const now = new Date();

    const [productRow] = await queryRows<RowDataPacket & { product_id: string | null }>(
      `SELECT product_id FROM ${table} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!productRow) {
      return notFound("Không tìm thấy nội dung.");
    }

    // `approved_time` chi ton tai o bang reviews. Vi khong con buoc duyet,
    // cot nay duoc dung nhu "thoi diem hien lai gan nhat".
    const sql =
      table === "reviews"
        ? "UPDATE reviews SET status_ = ?, update_time = ?, approved_time = ? WHERE id = ?"
        : "UPDATE product_comments SET status_ = ?, update_time = ? WHERE id = ?";

    const params =
      table === "reviews"
        ? [status, now, status === VISIBLE_STATUS ? now : null, id]
        : [status, now, id];

    const [result] = await getDbPool().query<ResultSetHeader>(sql, params);

    if (!result.affectedRows) {
      return notFound("Không tìm thấy nội dung.");
    }

    if (productRow.product_id) {
      await refreshProductStats(String(productRow.product_id));
    }

    return NextResponse.json({ id, status });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin review moderation error",
      error,
      "Khong the cap nhat trang thai."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "reviews", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string; kind?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const id = toPositiveInt(parsed.data.id);

    if (!id) {
      return badRequest("Thiếu id.");
    }

    const isComment = parsed.data.kind === "comments";
    const table = isComment ? "product_comments" : "reviews";
    const pool = getDbPool();

    const [row] = await queryRows<RowDataPacket & { product_id: string | null }>(
      `SELECT product_id FROM ${table} WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!row) {
      return notFound("Không tìm thấy nội dung.");
    }

    // Xoa danh gia thi phai xoa ca binh luan tra loi no, neu khong chung se tro
    // toi mot danh gia khong con ton tai.
    if (!isComment) {
      await pool.query("DELETE FROM product_comments WHERE review_id = ?", [id]);
      await pool.query("DELETE FROM review_votes WHERE review_id = ?", [id]);
    }

    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM ${table} WHERE id = ?`,
      [id]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy nội dung.");
    }

    if (row.product_id) {
      await refreshProductStats(String(row.product_id));
    }

    return NextResponse.json({ id });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin review delete error",
      error,
      "Khong the xoa noi dung."
    );
  }
}
