import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { sanitizeText, serverErrorResponse } from "@/lib/qreview/api-security";
import {
  badRequest,
  conflict,
  guardAdminRequest,
  notFound,
  readAdminBody,
  slugifyVietnamese,
  toInt,
  toIsoDate,
  toPositiveInt,
  toStatus,
  translateDbError,
} from "@/lib/qreview/api";
import { getDbPool, queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

/**
 * Nhom thong so ky thuat = BO TRUONG KY THUAT cho mot loai san pham.
 *
 * Vi du: "Dien thoai", "Loa Bluetooth", "Ban phim co".
 *
 * DAY LA KHAI NIEM DOC LAP VOI DANH MUC — khong co lien ket nao giua hai bang:
 *   - Danh muc      : cach nguoi doc duyet trang
 *   - Nhom thong so : bo truong ky thuat de nhap va so sanh
 *
 * Mot danh muc ("Phu kien cong nghe") co the dung nhieu nhom (ban phim, chuot,
 * sac du phong — moi thu mot bo thong so khac han). Nguoc lai mot nhom cung dung
 * duoc cho san pham o nhieu danh muc.
 *
 * Quan tri vien tu tao nhom va tu quyet dinh nhom do gom nhung thong so nao.
 */

type SpecGroupRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  description: string | null;
  sort_order: number | null;
  status_: string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  definition_count: number | null;
  product_count: number | null;
};

const LIMITS = { name: 150, slug: 150, description: 500 };

function mapGroup(row: SpecGroupRow) {
  return {
    id: String(row.id),
    name: (row.name ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    description: row.description ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    definitionCount: Number(row.definition_count ?? 0),
    productCount: Number(row.product_count ?? 0),
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

const SELECT_GROUPS = `
  SELECT
    g.id, g.name, g.slug, g.description, g.sort_order, g.status_,
    g.create_time, g.update_time,
    (SELECT COUNT(*) FROM spec_definitions d WHERE d.group_id = g.id) AS definition_count,
    (SELECT COUNT(*) FROM products p WHERE p.spec_group_id = g.id) AS product_count
  FROM spec_groups g
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-groups" });

    if (guard.response) {
      return guard.response;
    }

    const rows = await queryRows<SpecGroupRow>(
      `${SELECT_GROUPS} ORDER BY g.sort_order ASC, g.name ASC LIMIT 200`
    );

    return NextResponse.json({ groups: rows.map(mapGroup) });
  } catch (error) {
    return serverErrorResponse(
      "Admin spec groups list error",
      error,
      "Khong the tai nhom thong so.",
      { groups: [] }
    );
  }
}

type GroupPayload = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
  status?: string;
};

function parseGroupPayload(body: GroupPayload) {
  const name = sanitizeText(body.name, LIMITS.name);

  if (!name) {
    return { error: "Vui lòng nhập tên nhóm thông số.", value: null };
  }

  const slug = slugifyVietnamese(sanitizeText(body.slug, LIMITS.slug) || name);

  if (!slug) {
    return { error: "Không tạo được slug từ tên này.", value: null };
  }

  return {
    error: null as string | null,
    value: {
      name,
      slug,
      description: sanitizeText(body.description, LIMITS.description),
      sortOrder: toInt(body.sortOrder, 0),
      status: toStatus(body.status),
    },
  };
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-groups", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<GroupPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseGroupPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO spec_groups
          (name, slug, description, sort_order, status_, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.name,
        value.slug,
        value.description,
        value.sortOrder,
        value.status,
        now,
        now,
      ]
    );

    const rows = await queryRows<SpecGroupRow>(`${SELECT_GROUPS} WHERE g.id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return NextResponse.json({ group: rows[0] ? mapGroup(rows[0]) : null }, { status: 201 });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin spec group create error",
      error,
      "Khong the tao nhom thong so."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-groups", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<GroupPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const groupId = toPositiveInt(parsed.data.id);

    if (!groupId) {
      return badRequest("Thiếu id nhóm thông số.");
    }

    const { error, value } = parseGroupPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE spec_groups
        SET name = ?, slug = ?, description = ?, sort_order = ?,
            status_ = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.name,
        value.slug,
        value.description,
        value.sortOrder,
        value.status,
        new Date(),
        groupId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy nhóm thông số.");
    }

    const rows = await queryRows<SpecGroupRow>(`${SELECT_GROUPS} WHERE g.id = ? LIMIT 1`, [
      groupId,
    ]);

    return NextResponse.json({ group: rows[0] ? mapGroup(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin spec group update error",
      error,
      "Khong the cap nhat nhom thong so."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-groups", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const groupId = toPositiveInt(parsed.data.id);

    if (!groupId) {
      return badRequest("Thiếu id nhóm thông số.");
    }

    const [products] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM products WHERE spec_group_id = ?",
      [groupId]
    );

    if (Number(products?.n ?? 0) > 0) {
      return conflict(
        `Còn ${products.n} sản phẩm đang dùng nhóm này. Hãy chuyển chúng sang nhóm khác trước khi xoá.`
      );
    }

    const [usage] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM spec_definitions WHERE group_id = ?",
      [groupId]
    );

    if (Number(usage?.n ?? 0) > 0) {
      return conflict(
        `Nhóm này còn ${usage.n} thông số. Hãy xoá các thông số đó trước khi xoá nhóm.`
      );
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM spec_groups WHERE id = ?",
      [groupId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy nhóm thông số.");
    }

    return NextResponse.json({ id: groupId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin spec group delete error",
      error,
      "Khong the xoa nhom thong so."
    );
  }
}
