import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  sanitizeAssetUrl,
  sanitizeHttpUrl,
  sanitizeText,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
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

/** San thuong mai dien tu: Shopee, Lazada, TikTok Shop... */

type NetworkRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  logo: string | null;
  tracking_domain: string | null;
  sort_order: number | null;
  status_: string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  link_count: number | null;
};

const LIMITS = { name: 150, slug: 150 };

function mapNetwork(row: NetworkRow) {
  return {
    id: String(row.id),
    name: (row.name ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    logo: row.logo ?? null,
    trackingDomain: row.tracking_domain ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    linkCount: Number(row.link_count ?? 0),
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

const SELECT_NETWORKS = `
  SELECT
    n.id, n.name, n.slug, n.logo, n.tracking_domain, n.sort_order, n.status_,
    n.create_time, n.update_time,
    (SELECT COUNT(*) FROM affiliate_links l WHERE l.network_id = CAST(n.id AS CHAR)) AS link_count
  FROM affiliate_networks n
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "networks" });

    if (guard.response) {
      return guard.response;
    }

    const rows = await queryRows<NetworkRow>(
      `${SELECT_NETWORKS} ORDER BY n.sort_order ASC, n.name ASC LIMIT 200`
    );

    return NextResponse.json({ networks: rows.map(mapNetwork) });
  } catch (error) {
    return serverErrorResponse(
      "Admin networks list error",
      error,
      "Khong the tai danh sach san TMDT.",
      { networks: [] }
    );
  }
}

type NetworkPayload = {
  id?: string;
  name?: string;
  slug?: string;
  logo?: string;
  trackingDomain?: string;
  sortOrder?: number;
  status?: string;
};

function parseNetworkPayload(body: NetworkPayload) {
  const name = sanitizeText(body.name, LIMITS.name);

  if (!name) {
    return { error: "Vui lòng nhập tên sàn.", value: null };
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
      logo: sanitizeAssetUrl(body.logo),
      trackingDomain: sanitizeHttpUrl(body.trackingDomain),
      sortOrder: toInt(body.sortOrder, 0),
      status: toStatus(body.status),
    },
  };
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "networks", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<NetworkPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseNetworkPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO affiliate_networks
          (name, slug, logo, tracking_domain, sort_order, status_, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.name,
        value.slug,
        value.logo,
        value.trackingDomain,
        value.sortOrder,
        value.status,
        now,
        now,
      ]
    );

    const rows = await queryRows<NetworkRow>(`${SELECT_NETWORKS} WHERE n.id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return NextResponse.json({ network: rows[0] ? mapNetwork(rows[0]) : null }, { status: 201 });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse("Admin network create error", error, "Khong the tao san TMDT.");
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "networks", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<NetworkPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const networkId = toPositiveInt(parsed.data.id);

    if (!networkId) {
      return badRequest("Thiếu id sàn.");
    }

    const { error, value } = parseNetworkPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE affiliate_networks
        SET name = ?, slug = ?, logo = ?, tracking_domain = ?, sort_order = ?,
            status_ = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.name,
        value.slug,
        value.logo,
        value.trackingDomain,
        value.sortOrder,
        value.status,
        new Date(),
        networkId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy sàn.");
    }

    const rows = await queryRows<NetworkRow>(`${SELECT_NETWORKS} WHERE n.id = ? LIMIT 1`, [
      networkId,
    ]);

    return NextResponse.json({ network: rows[0] ? mapNetwork(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin network update error",
      error,
      "Khong the cap nhat san TMDT."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "networks", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const networkId = toPositiveInt(parsed.data.id);

    if (!networkId) {
      return badRequest("Thiếu id sàn.");
    }

    const [usage] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM affiliate_links WHERE network_id = ?",
      [networkId]
    );

    if (Number(usage?.n ?? 0) > 0) {
      return conflict(
        `Còn ${usage.n} link mua hàng thuộc sàn này. Hãy xoá các link đó trước.`
      );
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM affiliate_networks WHERE id = ?",
      [networkId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy sàn.");
    }

    return NextResponse.json({ id: networkId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse("Admin network delete error", error, "Khong the xoa san TMDT.");
  }
}
