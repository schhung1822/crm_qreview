import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  sanitizeHttpUrl,
  sanitizeText,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  notFound,
  readAdminBody,
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
 * Link mua hang tro toi san TMDT — trai tim cua mo hinh affiliate.
 *
 * Moi san pham co the co nhieu link (Shopee, Lazada, TikTok Shop...), moi link
 * kem gia ban hien tai de nguoi doc so sanh noi nao dang re hon.
 */

type LinkRow = RowDataPacket & {
  id: number;
  product_id: string | null;
  network_id: string | null;
  affiliate_url: string | null;
  price: string | null;
  merchant_name: string | null;
  is_best: number | null;
  sort_order: number | null;
  status_: string | null;
  note: string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  product_name: string | null;
  network_name: string | null;
  network_logo: string | null;
};

const LIMITS = { price: 50, merchant: 150, note: 500 };

function mapLink(row: LinkRow) {
  return {
    id: String(row.id),
    productId: (row.product_id ?? "").trim() || null,
    productName: row.product_name ?? null,
    networkId: (row.network_id ?? "").trim() || null,
    networkName: row.network_name ?? null,
    networkLogo: row.network_logo ?? null,
    affiliateUrl: row.affiliate_url ?? null,
    price: row.price ?? null,
    merchantName: row.merchant_name ?? null,
    isBest: Number(row.is_best ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status_ ?? "active").trim().toLowerCase() || "active",
    note: row.note ?? null,
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

// affiliate_links luu product_id/network_id kieu TEXT (do cong cu cu sinh ra),
// nen phai CAST khi join voi khoa chinh kieu INT.
const SELECT_LINKS = `
  SELECT
    l.id, l.product_id, l.network_id, l.affiliate_url, l.price, l.merchant_name,
    l.is_best, l.sort_order, l.status_, l.note, l.create_time, l.update_time,
    p.name AS product_name,
    n.name AS network_name,
    n.logo AS network_logo
  FROM affiliate_links l
  LEFT JOIN products p ON p.id = CAST(l.product_id AS UNSIGNED)
  LEFT JOIN affiliate_networks n ON n.id = CAST(l.network_id AS UNSIGNED)
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "affiliate-links" });

    if (guard.response) {
      return guard.response;
    }

    const url = new URL(request.url);
    const productId = toPositiveInt(url.searchParams.get("productId"));

    const rows = productId
      ? await queryRows<LinkRow>(
          `${SELECT_LINKS} WHERE l.product_id = ? ORDER BY l.is_best DESC, l.sort_order ASC, l.id ASC`,
          [productId]
        )
      : await queryRows<LinkRow>(
          `${SELECT_LINKS} ORDER BY l.id DESC LIMIT 500`
        );

    return NextResponse.json({ links: rows.map(mapLink) });
  } catch (error) {
    return serverErrorResponse(
      "Admin affiliate links list error",
      error,
      "Khong the tai danh sach link mua hang.",
      { links: [] }
    );
  }
}

type LinkPayload = {
  id?: string;
  productId?: string;
  networkId?: string;
  affiliateUrl?: string;
  price?: string;
  merchantName?: string;
  isBest?: unknown;
  sortOrder?: number;
  status?: string;
  note?: string;
};

function parseLinkPayload(body: LinkPayload) {
  const productId = toPositiveInt(body.productId);

  if (!productId) {
    return { error: "Vui lòng chọn sản phẩm.", value: null };
  }

  const networkId = toPositiveInt(body.networkId);

  if (!networkId) {
    return { error: "Vui lòng chọn sàn thương mại điện tử.", value: null };
  }

  // Chi nhan http(s): link affiliate se duoc render thang vao href, nen
  // `javascript:` hay `data:` o day se thanh lo hong XSS.
  const affiliateUrl = sanitizeHttpUrl(body.affiliateUrl);

  if (!affiliateUrl) {
    return {
      error: "Link mua hàng phải là địa chỉ http:// hoặc https:// hợp lệ.",
      value: null,
    };
  }

  return {
    error: null as string | null,
    value: {
      productId,
      networkId,
      affiliateUrl,
      price: sanitizeText(body.price, LIMITS.price),
      merchantName: sanitizeText(body.merchantName, LIMITS.merchant),
      isBest: toFlag(body.isBest),
      sortOrder: toInt(body.sortOrder, 0),
      status: toStatus(body.status),
      note: sanitizeText(body.note, LIMITS.note),
    },
  };
}

/**
 * Chi mot link duoc danh dau "gia tot nhat" cho moi san pham.
 * Goi sau khi them/sua mot link co is_best = 1.
 */
async function clearOtherBestLinks(productId: string, keepLinkId: string | number) {
  await getDbPool().query(
    "UPDATE affiliate_links SET is_best = 0 WHERE product_id = ? AND id <> ?",
    [productId, keepLinkId]
  );
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "affiliate-links",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<LinkPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseLinkPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO affiliate_links
          (product_id, network_id, affiliate_url, price, merchant_name, is_best,
           sort_order, status_, note, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.productId,
        value.networkId,
        value.affiliateUrl,
        value.price,
        value.merchantName,
        value.isBest,
        value.sortOrder,
        value.status,
        value.note,
        now,
        now,
      ]
    );

    if (value.isBest) {
      await clearOtherBestLinks(value.productId, result.insertId);
    }

    const rows = await queryRows<LinkRow>(`${SELECT_LINKS} WHERE l.id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return NextResponse.json({ link: rows[0] ? mapLink(rows[0]) : null }, { status: 201 });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin affiliate link create error",
      error,
      "Khong the tao link mua hang."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "affiliate-links",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<LinkPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const linkId = toPositiveInt(parsed.data.id);

    if (!linkId) {
      return badRequest("Thiếu id link.");
    }

    const { error, value } = parseLinkPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE affiliate_links
        SET product_id = ?, network_id = ?, affiliate_url = ?, price = ?,
            merchant_name = ?, is_best = ?, sort_order = ?, status_ = ?, note = ?,
            update_time = ?
        WHERE id = ?
      `,
      [
        value.productId,
        value.networkId,
        value.affiliateUrl,
        value.price,
        value.merchantName,
        value.isBest,
        value.sortOrder,
        value.status,
        value.note,
        new Date(),
        linkId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy link mua hàng.");
    }

    if (value.isBest) {
      await clearOtherBestLinks(value.productId, linkId);
    }

    const rows = await queryRows<LinkRow>(`${SELECT_LINKS} WHERE l.id = ? LIMIT 1`, [linkId]);

    return NextResponse.json({ link: rows[0] ? mapLink(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin affiliate link update error",
      error,
      "Khong the cap nhat link mua hang."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "affiliate-links",
      write: true,
    });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const linkId = toPositiveInt(parsed.data.id);

    if (!linkId) {
      return badRequest("Thiếu id link.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      "DELETE FROM affiliate_links WHERE id = ?",
      [linkId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy link mua hàng.");
    }

    return NextResponse.json({ id: linkId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin affiliate link delete error",
      error,
      "Khong the xoa link mua hang."
    );
  }
}
