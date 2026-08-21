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
import { normalizeNumericValue, queryRows } from "@/lib/qreview/db";
import { getYouTubeWatchUrl } from "@/lib/qreview/youtube";

export const runtime = "nodejs";

/**
 * Chi tiet mot san pham kem anh, thong so va link mua hang — du lieu de do vao
 * form sua. Tach khoi endpoint danh sach de trang danh sach khong phai keo
 * theo hang loat truy van con.
 */

type ProductRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  brand_id: string | null;
  category_id: string | null;
  tag_id: string | null;
  short_desc: string | null;
  content: string | null;
  price_min: number | null;
  price_max: number | null;
  status_: string | null;
  segment_label: string | null;
  spec_group_id: number | null;
  compare_enabled: number | null;
  seo_title: string | null;
  seo_description: string | null;
  created_time: Date | string | null;
  update_time: Date | string | null;
};

type ImageRow = RowDataPacket & {
  id: number;
  image_url: string | null;
  color_id: number | null;
  is_thumbnail: string | null;
  sort_order: number | null;
};

type VideoRow = RowDataPacket & {
  id: number;
  youtube_video_id: string;
  title: string | null;
  sort_order: number | null;
};

type ColorRow = RowDataPacket & {
  id: number;
  name: string;
  hex_code: string | null;
  sort_order: number | null;
  status_: string | null;
};

type SpecRow = RowDataPacket & {
  id: number;
  spec_key: string | null;
  spec_label: string | null;
  spec_group: string | null;
  spec_value: string | null;
  unit: string | null;
  sort_order: number | null;
  is_comparable: number | null;
  highlight_priority: number | null;
};

type LinkRow = RowDataPacket & {
  id: number;
  network_id: string | null;
  affiliate_url: string | null;
  price: string | null;
  merchant_name: string | null;
  is_best: number | null;
  sort_order: number | null;
  status_: string | null;
  note: string | null;
  network_name: string | null;
};

function normalizeProductStatus(raw: unknown) {
  const text = String(raw ?? "").trim().toLowerCase();

  if (text === "1" || text === "active") return "active";
  if (text === "0" || text === "inactive") return "inactive";

  return ["active", "inactive", "draft"].includes(text) ? text : "active";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "products" });

    if (guard.response) {
      return guard.response;
    }

    const resolvedParams = await params;
    const productId = toPositiveInt(resolvedParams.id);

    if (!productId) {
      return badRequest("Id sản phẩm không hợp lệ.");
    }

    const [productRow] = await queryRows<ProductRow>(
      `
        SELECT
          id, name, slug, brand_id, category_id, tag_id, short_desc, content,
          price_min, price_max, status_, segment_label, spec_group_id,
          compare_enabled, seo_title, seo_description, created_time, update_time
        FROM products WHERE id = ? LIMIT 1
      `,
      [productId]
    );

    if (!productRow) {
      return notFound("Không tìm thấy sản phẩm.");
    }

    const [images, videos, specs, links, colors] = await Promise.all([
      queryRows<ImageRow>(
        `
          SELECT id, image_url, color_id, is_thumbnail, sort_order
          FROM product_images WHERE product_id = ?
          ORDER BY COALESCE(sort_order, 0) ASC, id ASC
        `,
        [productId]
      ),
      queryRows<VideoRow>(
        `
          SELECT id, youtube_video_id, title, sort_order
          FROM product_videos WHERE product_id = ?
          ORDER BY COALESCE(sort_order, 0) ASC, id ASC
        `,
        [productId]
      ).catch(() => [] as VideoRow[]),
      queryRows<SpecRow>(
        `
          SELECT id, spec_key, spec_label, spec_group, spec_value, unit,
                 sort_order, is_comparable, highlight_priority
          FROM product_specs WHERE product_id = ?
          ORDER BY COALESCE(sort_order, 0) ASC, id ASC
        `,
        [productId]
      ),
      queryRows<LinkRow>(
        `
          SELECT l.id, l.network_id, l.affiliate_url, l.price, l.merchant_name,
                 l.is_best, l.sort_order, l.status_, l.note,
                 n.name AS network_name
          FROM affiliate_links l
          LEFT JOIN affiliate_networks n ON n.id = CAST(l.network_id AS UNSIGNED)
          WHERE l.product_id = ?
          ORDER BY l.is_best DESC, COALESCE(l.sort_order, 0) ASC, l.id ASC
        `,
        [productId]
      ),
      queryRows<ColorRow>(
        `
          SELECT id, name, hex_code, sort_order, status_
          FROM product_colors WHERE product_id = ?
          ORDER BY COALESCE(sort_order, 0) ASC, id ASC
        `,
        [productId]
      ),
    ]);

    return NextResponse.json({
      product: {
        id: String(productRow.id),
        name: (productRow.name ?? "").trim(),
        slug: (productRow.slug ?? "").trim(),
        brandId: (productRow.brand_id ?? "").trim() || null,
        categoryId: (productRow.category_id ?? "").trim() || null,
        tagId: (productRow.tag_id ?? "").trim() || null,
        shortDesc: productRow.short_desc ?? "",
        content: productRow.content ?? "",
        priceMin: normalizeNumericValue(productRow.price_min),
        priceMax: normalizeNumericValue(productRow.price_max),
        status: normalizeProductStatus(productRow.status_),
        segmentLabel: productRow.segment_label ?? "",
        specGroupId: productRow.spec_group_id ? String(productRow.spec_group_id) : null,
        compareEnabled: Number(productRow.compare_enabled ?? 1) === 1,
        // SEO chi de xem: duoc suy ra tu ten va mo ta ngan khi luu.
        seoTitle: productRow.seo_title ?? "",
        seoDescription: productRow.seo_description ?? "",
        createdAt: toIsoDate(productRow.created_time),
        updatedAt: toIsoDate(productRow.update_time),

        images: images
          .filter((row) => row.image_url)
          .map((row) => ({
            url: String(row.image_url),
            colorId: row.color_id ? String(row.color_id) : null,
            isThumbnail: row.is_thumbnail === "1" || row.is_thumbnail === "true",
          })),

        videos: videos.map((row) => ({
          id: String(row.id),
          videoId: row.youtube_video_id,
          url: getYouTubeWatchUrl(row.youtube_video_id),
          title: row.title ?? "",
        })),

        colors: colors.map((row) => ({
          id: String(row.id),
          clientId: String(row.id),
          name: row.name,
          hexCode: row.hex_code ?? "#9CA3AF",
          sortOrder: Number(row.sort_order ?? 0),
          status: (row.status_ ?? "active").trim().toLowerCase() || "active",
        })),

        specs: specs.map((row) => ({
          specKey: row.spec_key ?? "",
          label: row.spec_label ?? row.spec_key ?? "",
          value: row.spec_value ?? "",
          unit: row.unit ?? "",
          // `spec_group` luu id cua spec_groups duoi dang chuoi.
          groupId: (row.spec_group ?? "").trim() || null,
          sortOrder: Number(row.sort_order ?? 0),
          isComparable: Number(row.is_comparable ?? 1) === 1,
          isHighlight: Number(row.highlight_priority ?? 0) === 1,
        })),

        affiliateLinks: links.map((row) => ({
          id: String(row.id),
          networkId: (row.network_id ?? "").trim() || null,
          networkName: row.network_name ?? null,
          affiliateUrl: row.affiliate_url ?? "",
          price: row.price ?? "",
          merchantName: row.merchant_name ?? "",
          isBest: Number(row.is_best ?? 0) === 1,
          sortOrder: Number(row.sort_order ?? 0),
          status: (row.status_ ?? "active").trim().toLowerCase() || "active",
          note: row.note ?? "",
        })),
      },
    });
  } catch (error) {
    return serverErrorResponse(
      "Admin product detail error",
      error,
      "Khong the tai chi tiet san pham.",
      { product: null }
    );
  }
}
