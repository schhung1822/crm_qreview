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

type BrandRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  logo: string | null;
  web: string | null;
  description: string | null;
  country: string | null;
  sort_order: number | null;
  status_: string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  product_count: number | null;
};

const LIMITS = {
  name: 150,
  slug: 150,
  country: 100,
  description: 2000,
};

function mapBrand(row: BrandRow) {
  return {
    id: String(row.id),
    name: (row.name ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    logo: row.logo ?? null,
    web: row.web ?? null,
    description: row.description ?? null,
    country: row.country ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    productCount: Number(row.product_count ?? 0),
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

const SELECT_BRANDS = `
  SELECT
    b.id, b.name, b.slug, b.logo, b.web, b.description, b.country,
    b.sort_order, b.status_, b.create_time, b.update_time,
    (SELECT COUNT(*) FROM products p WHERE p.brand_id = CAST(b.id AS CHAR)) AS product_count
  FROM brands b
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "brands" });

    if (guard.response) {
      return guard.response;
    }

    const rows = await queryRows<BrandRow>(
      `${SELECT_BRANDS} ORDER BY b.sort_order ASC, b.name ASC LIMIT 500`
    );

    return NextResponse.json({ brands: rows.map(mapBrand) });
  } catch (error) {
    return serverErrorResponse(
      "Admin brands list error",
      error,
      "Khong the tai danh sach thuong hieu.",
      { brands: [] }
    );
  }
}

type BrandPayload = {
  id?: string;
  name?: string;
  slug?: string;
  logo?: string;
  web?: string;
  description?: string;
  country?: string;
  sortOrder?: number;
  status?: string;
};

/** Doc va kiem tra du lieu chung cho POST/PATCH. */
function parseBrandPayload(body: BrandPayload) {
  const name = sanitizeText(body.name, LIMITS.name);

  if (!name) {
    return { error: "Vui lòng nhập tên thương hiệu." as string, value: null };
  }

  const rawSlug = sanitizeText(body.slug, LIMITS.slug);
  const slug = slugifyVietnamese(rawSlug || name);

  if (!slug) {
    return { error: "Không tạo được slug từ tên này, vui lòng nhập slug thủ công.", value: null };
  }

  return {
    error: null as string | null,
    value: {
      name,
      slug,
      // Logo co the la duong dan noi bo (/images/...) hoac URL day du.
      logo: sanitizeAssetUrl(body.logo),
      web: sanitizeHttpUrl(body.web),
      description: sanitizeText(body.description, LIMITS.description),
      country: sanitizeText(body.country, LIMITS.country),
      sortOrder: toInt(body.sortOrder, 0),
      status: toStatus(body.status),
    },
  };
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "brands", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<BrandPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseBrandPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO brands
          (name, slug, logo, web, description, country, sort_order, status_, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.name,
        value.slug,
        value.logo,
        value.web,
        value.description,
        value.country,
        value.sortOrder,
        value.status,
        now,
        now,
      ]
    );

    const rows = await queryRows<BrandRow>(`${SELECT_BRANDS} WHERE b.id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return NextResponse.json({ brand: rows[0] ? mapBrand(rows[0]) : null }, { status: 201 });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin brand create error",
      error,
      "Khong the tao thuong hieu."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "brands", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<BrandPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const brandId = toPositiveInt(parsed.data.id);

    if (!brandId) {
      return badRequest("Thiếu id thương hiệu.");
    }

    const { error, value } = parseBrandPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE brands
        SET name = ?, slug = ?, logo = ?, web = ?, description = ?, country = ?,
            sort_order = ?, status_ = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.name,
        value.slug,
        value.logo,
        value.web,
        value.description,
        value.country,
        value.sortOrder,
        value.status,
        new Date(),
        brandId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy thương hiệu.");
    }

    const rows = await queryRows<BrandRow>(`${SELECT_BRANDS} WHERE b.id = ? LIMIT 1`, [
      brandId,
    ]);

    return NextResponse.json({ brand: rows[0] ? mapBrand(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin brand update error",
      error,
      "Khong the cap nhat thuong hieu."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "brands", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const brandId = toPositiveInt(parsed.data.id);

    if (!brandId) {
      return badRequest("Thiếu id thương hiệu.");
    }

    // Khong cho xoa khi con san pham tham chieu: xoa se de lai san pham mo coi
    // voi brand_id tro toi ban ghi khong ton tai.
    const [usage] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM products WHERE brand_id = ? LIMIT 1",
      [brandId]
    );

    if (Number(usage?.n ?? 0) > 0) {
      return conflict(
        `Còn ${usage.n} sản phẩm thuộc thương hiệu này. Hãy chuyển các sản phẩm đó sang thương hiệu khác trước khi xoá.`
      );
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM brands WHERE id = ?",
      [brandId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy thương hiệu.");
    }

    return NextResponse.json({ id: brandId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin brand delete error",
      error,
      "Khong the xoa thuong hieu."
    );
  }
}
