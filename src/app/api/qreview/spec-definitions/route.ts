import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { sanitizeText, serverErrorResponse } from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  notFound,
  readAdminBody,
  slugifyVietnamese,
  toFlag,
  toInt,
  toIsoDate,
  toPositiveInt,
  toStatus,
  translateDbError,
} from "@/lib/qreview/api";
import { getDbPool, queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

/**
 * Dinh nghia thong so ky thuat, thuoc ve mot NHOM THONG SO.
 *
 * Nhom = bo thong so cho mot loai san pham (xem `/api/admin/spec-groups`).
 * Day la "khuon" cho form nhap san pham: chon nhom -> form hien dung cac o can
 * dien. Nho vay san pham cung loai co cung bo thong so voi cung ma, va bang so
 * sanh moi doi chieu duoc.
 */

type DefinitionRow = RowDataPacket & {
  id: number;
  group_id: number;
  spec_key: string;
  label: string;
  section: string | null;
  unit: string | null;
  data_type: string;
  options: string | null;
  placeholder: string | null;
  sort_order: number;
  is_required: number;
  is_comparable: number;
  is_filterable: number;
  is_highlight: number;
  status_: string;
  create_time: Date | string | null;
  update_time: Date | string | null;
  group_name: string | null;
};

const DATA_TYPES = new Set(["text", "number", "boolean", "enum"]);

const LIMITS = {
  key: 100,
  label: 191,
  section: 100,
  unit: 50,
  placeholder: 191,
  option: 100,
  maxOptions: 50,
};

function parseOptions(raw: string | null) {
  if (!raw) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function mapDefinition(row: DefinitionRow) {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    groupName: row.group_name ?? null,
    specKey: row.spec_key,
    label: row.label,
    section: row.section ?? null,
    unit: row.unit ?? null,
    dataType: row.data_type,
    options: parseOptions(row.options),
    placeholder: row.placeholder ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isRequired: Number(row.is_required) === 1,
    isComparable: Number(row.is_comparable) === 1,
    isFilterable: Number(row.is_filterable) === 1,
    isHighlight: Number(row.is_highlight) === 1,
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

const SELECT_DEFINITIONS = `
  SELECT
    d.id, d.group_id, d.spec_key, d.label, d.section, d.unit, d.data_type,
    d.options, d.placeholder, d.sort_order, d.is_required, d.is_comparable,
    d.is_filterable, d.is_highlight, d.status_, d.create_time, d.update_time,
    g.name AS group_name
  FROM spec_definitions d
  LEFT JOIN spec_groups g ON g.id = d.group_id
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-definitions" });

    if (guard.response) {
      return guard.response;
    }

    const url = new URL(request.url);
    const groupId = toPositiveInt(url.searchParams.get("groupId"));

    // `?groupId=` la duong dung boi form nhap san pham va man hinh quan tri
    // nhom. Khong co tham so thi tra ve tat ca (it dung, chu yeu de tra cuu).
    if (groupId) {
      const rows = await queryRows<DefinitionRow>(
        `
          ${SELECT_DEFINITIONS}
          WHERE d.group_id = ?
          ORDER BY d.sort_order ASC, d.label ASC
          LIMIT 300
        `,
        [groupId]
      );

      return NextResponse.json({ definitions: rows.map(mapDefinition) });
    }

    const rows = await queryRows<DefinitionRow>(
      `${SELECT_DEFINITIONS} ORDER BY d.group_id ASC, d.sort_order ASC, d.label ASC LIMIT 1000`
    );

    return NextResponse.json({ definitions: rows.map(mapDefinition) });
  } catch (error) {
    return serverErrorResponse(
      "Admin spec definitions list error",
      error,
      "Khong the tai dinh nghia thong so.",
      { definitions: [] }
    );
  }
}

type DefinitionPayload = {
  id?: string;
  groupId?: string | null;
  specKey?: string;
  label?: string;
  section?: string;
  unit?: string;
  dataType?: string;
  options?: unknown;
  placeholder?: string;
  sortOrder?: number;
  isRequired?: unknown;
  isComparable?: unknown;
  isFilterable?: unknown;
  isHighlight?: unknown;
  status?: string;
};

function parseDefinitionPayload(body: DefinitionPayload) {
  const groupId = toPositiveInt(body.groupId);

  if (!groupId) {
    return { error: "Vui lòng chọn nhóm thông số.", value: null };
  }

  const label = sanitizeText(body.label, LIMITS.label);

  if (!label) {
    return { error: "Vui lòng nhập tên hiển thị của thông số.", value: null };
  }

  // spec_key la dinh danh may doc, dung de doi chieu giua cac san pham khi so
  // sanh. Sinh tu label neu admin khong nhap.
  const rawKey = sanitizeText(body.specKey, LIMITS.key);
  const specKey = slugifyVietnamese(rawKey || label);

  if (!specKey) {
    return { error: "Không tạo được mã thông số, vui lòng nhập mã thủ công.", value: null };
  }

  const dataType = String(body.dataType ?? "text").trim().toLowerCase();

  if (!DATA_TYPES.has(dataType)) {
    return { error: "Kiểu dữ liệu không hợp lệ.", value: null };
  }

  let options: string[] = [];

  if (dataType === "enum") {
    const raw = Array.isArray(body.options)
      ? body.options
      : String(body.options ?? "")
          .split("\n")
          .map((line) => line.trim());

    options = raw
      .map((item) => sanitizeText(item, LIMITS.option))
      .filter((item): item is string => Boolean(item))
      .slice(0, LIMITS.maxOptions);

    if (!options.length) {
      return { error: "Kiểu 'Danh sách chọn' cần ít nhất một giá trị.", value: null };
    }
  }

  return {
    error: null as string | null,
    value: {
      groupId,
      specKey,
      label,
      section: sanitizeText(body.section, LIMITS.section),
      unit: sanitizeText(body.unit, LIMITS.unit),
      dataType,
      options: options.length ? JSON.stringify(options) : null,
      placeholder: sanitizeText(body.placeholder, LIMITS.placeholder),
      sortOrder: toInt(body.sortOrder, 0),
      isRequired: toFlag(body.isRequired),
      isComparable: toFlag(body.isComparable),
      isFilterable: toFlag(body.isFilterable),
      isHighlight: toFlag(body.isHighlight),
      status: toStatus(body.status),
    },
  };
}

const DUPLICATE_MESSAGE = "Nhóm này đã có thông số với mã tương tự.";

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "spec-definitions",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<DefinitionPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseDefinitionPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    // Thong so moi mac dinh xep cuoi nhom, de admin khong phai tu nhap thu tu.
    const autoOrder = value.sortOrder;
    let sortOrder = autoOrder;

    if (!autoOrder) {
      const [last] = await queryRows<RowDataPacket & { max_order: number | null }>(
        "SELECT MAX(sort_order) AS max_order FROM spec_definitions WHERE group_id = ?",
        [value.groupId]
      );
      sortOrder = Number(last?.max_order ?? 0) + 10;
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO spec_definitions
          (group_id, spec_key, label, section, unit, data_type, options, placeholder,
           sort_order, is_required, is_comparable, is_filterable, is_highlight, status_,
           create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.groupId,
        value.specKey,
        value.label,
        value.section,
        value.unit,
        value.dataType,
        value.options,
        value.placeholder,
        sortOrder,
        value.isRequired,
        value.isComparable,
        value.isFilterable,
        value.isHighlight,
        value.status,
        now,
        now,
      ]
    );

    const rows = await queryRows<DefinitionRow>(
      `${SELECT_DEFINITIONS} WHERE d.id = ? LIMIT 1`,
      [result.insertId]
    );

    return NextResponse.json(
      { definition: rows[0] ? mapDefinition(rows[0]) : null },
      { status: 201 }
    );
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
    }

    return serverErrorResponse(
      "Admin spec definition create error",
      error,
      "Khong the tao dinh nghia thong so."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "spec-definitions",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<DefinitionPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const definitionId = toPositiveInt(parsed.data.id);

    if (!definitionId) {
      return badRequest("Thiếu id thông số.");
    }

    const { error, value } = parseDefinitionPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE spec_definitions
        SET group_id = ?, spec_key = ?, label = ?, section = ?, unit = ?,
            data_type = ?, options = ?, placeholder = ?, sort_order = ?,
            is_required = ?, is_comparable = ?, is_filterable = ?, is_highlight = ?,
            status_ = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.groupId,
        value.specKey,
        value.label,
        value.section,
        value.unit,
        value.dataType,
        value.options,
        value.placeholder,
        value.sortOrder,
        value.isRequired,
        value.isComparable,
        value.isFilterable,
        value.isHighlight,
        value.status,
        new Date(),
        definitionId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy thông số.");
    }

    const rows = await queryRows<DefinitionRow>(
      `${SELECT_DEFINITIONS} WHERE d.id = ? LIMIT 1`,
      [definitionId]
    );

    return NextResponse.json({ definition: rows[0] ? mapDefinition(rows[0]) : null });
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
    }

    return serverErrorResponse(
      "Admin spec definition update error",
      error,
      "Khong the cap nhat thong so."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "spec-definitions",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const definitionId = toPositiveInt(parsed.data.id);

    if (!definitionId) {
      return badRequest("Thiếu id thông số.");
    }

    // Chi xoa dinh nghia, KHONG dong cham gia tri da nhap o `product_specs`.
    // Du lieu san pham cu van giu nguyen, chi la tu nay form khong goi y o do.
    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM spec_definitions WHERE id = ?",
      [definitionId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy thông số.");
    }

    return NextResponse.json({ id: definitionId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin spec definition delete error",
      error,
      "Khong the xoa thong so."
    );
  }
}
