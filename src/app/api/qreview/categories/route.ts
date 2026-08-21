import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  sanitizeAssetUrl,
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

type CategoryRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  image_url: string | null;
  parent_id: string | null;
  description: string | null;
  seo_title: string | null;
  seo_desc: string | null;
  sort_order: number | null;
  status_: string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  product_count: number | null;
};

const LIMITS = {
  name: 150,
  slug: 150,
  description: 2000,
  seoTitle: 191,
  seoDesc: 300,
};

function mapCategory(row: CategoryRow) {
  return {
    id: String(row.id),
    name: (row.name ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    image: row.image_url ?? null,
    parentId: (row.parent_id ?? "").trim() || null,
    description: row.description ?? null,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_desc ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    productCount: Number(row.product_count ?? 0),
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

// `desc` la tu khoa SQL nen bat buoc phai boc backtick o moi noi.
const SELECT_CATEGORIES = `
  SELECT
    c.id, c.name, c.slug, c.image_url, c.parent_id,
    c.\`desc\` AS description, c.seo_title, c.seo_desc,
    c.sort_order, c.status_, c.create_time, c.update_time,
    -- Nhom thong so la khai niem doc lap voi danh muc, khong dem o day.
    (SELECT COUNT(*) FROM products p WHERE p.category_id = CAST(c.id AS CHAR)) AS product_count
  FROM categories c
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "categories" });

    if (guard.response) {
      return guard.response;
    }

    const rows = await queryRows<CategoryRow>(
      `${SELECT_CATEGORIES} ORDER BY c.sort_order ASC, c.name ASC LIMIT 500`
    );

    return NextResponse.json({ categories: rows.map(mapCategory) });
  } catch (error) {
    return serverErrorResponse(
      "Admin categories list error",
      error,
      "Khong the tai danh sach danh muc.",
      { categories: [] }
    );
  }
}

type CategoryPayload = {
  id?: string;
  name?: string;
  slug?: string;
  image?: string;
  parentId?: string | null;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  sortOrder?: number;
  status?: string;
};

function parseCategoryPayload(body: CategoryPayload) {
  const name = sanitizeText(body.name, LIMITS.name);

  if (!name) {
    return { error: "Vui lòng nhập tên danh mục.", value: null };
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
      image: sanitizeAssetUrl(body.image),
      parentId: toPositiveInt(body.parentId),
      description: sanitizeText(body.description, LIMITS.description),
      seoTitle: sanitizeText(body.seoTitle, LIMITS.seoTitle),
      seoDescription: sanitizeText(body.seoDescription, LIMITS.seoDesc),
      sortOrder: toInt(body.sortOrder, 0),
      status: toStatus(body.status),
    },
  };
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "categories", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<CategoryPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseCategoryPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO categories
          (name, slug, image_url, parent_id, \`desc\`, seo_title, seo_desc,
           sort_order, status_, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.name,
        value.slug,
        value.image,
        value.parentId,
        value.description,
        value.seoTitle,
        value.seoDescription,
        value.sortOrder,
        value.status,
        now,
        now,
      ]
    );

    const rows = await queryRows<CategoryRow>(
      `${SELECT_CATEGORIES} WHERE c.id = ? LIMIT 1`,
      [result.insertId]
    );

    return NextResponse.json(
      { category: rows[0] ? mapCategory(rows[0]) : null },
      { status: 201 }
    );
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin category create error",
      error,
      "Khong the tao danh muc."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "categories", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<CategoryPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const categoryId = toPositiveInt(parsed.data.id);

    if (!categoryId) {
      return badRequest("Thiếu id danh mục.");
    }

    const { error, value } = parseCategoryPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    // Danh muc khong the la cha cua chinh no.
    if (value.parentId === categoryId) {
      return badRequest("Danh mục không thể là danh mục cha của chính nó.");
    }

    // Chan vong lap cha-con (A -> B -> A) lam cay danh muc quay vong vo han.
    if (value.parentId) {
      const visited = new Set<string>([categoryId]);
      let cursor: string | null = value.parentId;

      while (cursor) {
        if (visited.has(cursor)) {
          return badRequest("Cấu trúc danh mục bị lặp vòng, vui lòng chọn danh mục cha khác.");
        }

        visited.add(cursor);

        const [parentRow] = await queryRows<RowDataPacket & { parent_id: string | null }>(
          "SELECT parent_id FROM categories WHERE id = ? LIMIT 1",
          [cursor]
        );

        cursor = toPositiveInt(parentRow?.parent_id);
      }
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE categories
        SET name = ?, slug = ?, image_url = ?, parent_id = ?, \`desc\` = ?,
            seo_title = ?, seo_desc = ?, sort_order = ?, status_ = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.name,
        value.slug,
        value.image,
        value.parentId,
        value.description,
        value.seoTitle,
        value.seoDescription,
        value.sortOrder,
        value.status,
        new Date(),
        categoryId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy danh mục.");
    }

    const rows = await queryRows<CategoryRow>(
      `${SELECT_CATEGORIES} WHERE c.id = ? LIMIT 1`,
      [categoryId]
    );

    return NextResponse.json({ category: rows[0] ? mapCategory(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin category update error",
      error,
      "Khong the cap nhat danh muc."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "categories", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const categoryId = toPositiveInt(parsed.data.id);

    if (!categoryId) {
      return badRequest("Thiếu id danh mục.");
    }

    const [products] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM products WHERE category_id = ?",
      [categoryId]
    );

    if (Number(products?.n ?? 0) > 0) {
      return conflict(
        `Còn ${products.n} sản phẩm thuộc danh mục này. Hãy chuyển chúng sang danh mục khác trước khi xoá.`
      );
    }

    const [children] = await queryRows<RowDataPacket & { n: number }>(
      "SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?",
      [categoryId]
    );

    if (Number(children?.n ?? 0) > 0) {
      return conflict(
        `Danh mục này còn ${children.n} danh mục con. Hãy xoá hoặc chuyển chúng trước.`
      );
    }


    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM categories WHERE id = ?",
      [categoryId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy danh mục.");
    }

    return NextResponse.json({ id: categoryId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin category delete error",
      error,
      "Khong the xoa danh muc."
    );
  }
}
