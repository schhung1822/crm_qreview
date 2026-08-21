import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { serverErrorResponse } from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  notFound,
  toIsoDate,
  toPositiveInt,
} from "@/lib/qreview/api";
import { queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

/**
 * Chi tiet mot nhom thong so, kem danh sach thong so cua no.
 *
 * Trang chi tiet `/admin/specs/[id]` goi endpoint nay de lay ca hai trong mot
 * lan, thay vi hai request roi ghep o client.
 */

type GroupRow = RowDataPacket & {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "spec-groups" });

    if (guard.response) {
      return guard.response;
    }

    const resolvedParams = await params;
    const groupId = toPositiveInt(resolvedParams.id);

    if (!groupId) {
      return badRequest("Id nhóm không hợp lệ.");
    }

    const [group] = await queryRows<GroupRow>(
      `
        SELECT
          g.id, g.name, g.slug, g.description, g.sort_order, g.status_,
          g.create_time, g.update_time,
          (SELECT COUNT(*) FROM spec_definitions d WHERE d.group_id = g.id) AS definition_count,
          (SELECT COUNT(*) FROM products p WHERE p.spec_group_id = g.id) AS product_count
        FROM spec_groups g
        WHERE g.id = ?
        LIMIT 1
      `,
      [groupId]
    );

    if (!group) {
      return notFound("Không tìm thấy nhóm thông số.");
    }

    const definitions = await queryRows<DefinitionRow>(
      `
        SELECT
          id, group_id, spec_key, label, section, unit, data_type, options,
          placeholder, sort_order, is_required, is_comparable, is_filterable,
          is_highlight, status_
        FROM spec_definitions
        WHERE group_id = ?
        ORDER BY sort_order ASC, label ASC
        LIMIT 300
      `,
      [groupId]
    );

    return NextResponse.json({
      group: {
        id: String(group.id),
        name: (group.name ?? "").trim(),
        slug: (group.slug ?? "").trim(),
        description: group.description ?? null,
        sortOrder: Number(group.sort_order ?? 0),
        status: (group.status_ ?? "active").trim().toLowerCase() || "active",
        definitionCount: Number(group.definition_count ?? 0),
        productCount: Number(group.product_count ?? 0),
        createdAt: toIsoDate(group.create_time),
        updatedAt: toIsoDate(group.update_time),
      },
      definitions: definitions.map((row) => ({
        id: String(row.id),
        groupId: String(row.group_id),
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
      })),
    });
  } catch (error) {
    return serverErrorResponse(
      "Admin spec group detail error",
      error,
      "Khong the tai chi tiet nhom thong so.",
      { group: null, definitions: [] }
    );
  }
}
