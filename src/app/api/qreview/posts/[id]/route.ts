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
import { sanitizePostContent } from "@/lib/qreview/post-content";

export const runtime = "nodejs";

/**
 * Chi tiet mot bai viet, kem noi dung day du va danh sach san pham de xuat.
 *
 * Tach khoi endpoint danh sach vi `content` co the nang vai tram KB — trang
 * danh sach khong can keo theo.
 */

type PostRow = RowDataPacket & {
  id: number;
  title: string | null;
  slug: string | null;
  type: string | null;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  author_id: number | null;
  status_: string | null;
  is_featured: number | null;
  view_count: number | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: Date | string | null;
  create_time: Date | string | null;
  update_time: Date | string | null;
  author_name: string | null;
};

type PostProductRow = RowDataPacket & {
  product_id: number;
  display_order: number | null;
  note: string | null;
  name: string | null;
  slug: string | null;
  price_min: number | null;
  status_: string | null;
  thumbnail: string | null;
  brand_name: string | null;
  category_name: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "posts" });

    if (guard.response) {
      return guard.response;
    }

    const resolvedParams = await params;
    const postId = toPositiveInt(resolvedParams.id);

    if (!postId) {
      return badRequest("Id bài viết không hợp lệ.");
    }

    const [post] = await queryRows<PostRow>(
      `
        SELECT
          p.id, p.title, p.slug, p.type, p.excerpt, p.content, p.cover_image,
          p.author_id, p.status_, p.is_featured, p.view_count, p.seo_title,
          p.seo_description, p.published_at, p.create_time, p.update_time,
          u.name AS author_name
        FROM posts p
        LEFT JOIN users u ON u.id = p.author_id
        WHERE p.id = ?
        LIMIT 1
      `,
      [postId]
    );

    if (!post) {
      return notFound("Không tìm thấy bài viết.");
    }

    const products = await queryRows<PostProductRow>(
      `
        SELECT
          pp.product_id, pp.display_order, pp.note,
          pr.name, pr.slug, pr.price_min, pr.status_,
          b.name AS brand_name,
          c.name AS category_name,
          (
            SELECT i.image_url FROM product_images i
            WHERE i.product_id = CAST(pr.id AS CHAR)
            ORDER BY (i.is_thumbnail = '1') DESC, COALESCE(i.sort_order, 0) ASC, i.id ASC
            LIMIT 1
          ) AS thumbnail
        FROM post_products pp
        INNER JOIN products pr ON pr.id = pp.product_id
        LEFT JOIN brands b ON b.id = CAST(pr.brand_id AS UNSIGNED)
        LEFT JOIN categories c ON c.id = CAST(pr.category_id AS UNSIGNED)
        WHERE pp.post_id = ?
        ORDER BY COALESCE(pp.display_order, 0) ASC, pp.id ASC
      `,
      [postId]
    );

    return NextResponse.json({
      post: {
        id: String(post.id),
        title: (post.title ?? "").trim(),
        slug: (post.slug ?? "").trim(),
        type: (post.type ?? "news").trim().toLowerCase(),
        excerpt: post.excerpt ?? "",
        content: sanitizePostContent(post.content) ?? "",
        coverImage: post.cover_image ?? "",
        authorName: post.author_name ?? null,
        status: (post.status_ ?? "draft").trim().toLowerCase(),
        isFeatured: Number(post.is_featured ?? 0) === 1,
        viewCount: Number(post.view_count ?? 0),
        // SEO chi de xem: duoc suy ra tu tieu de va mo ta ngan khi luu.
        seoTitle: post.seo_title ?? "",
        seoDescription: post.seo_description ?? "",
        publishedAt: toIsoDate(post.published_at),
        createdAt: toIsoDate(post.create_time),
        updatedAt: toIsoDate(post.update_time),

        products: products.map((row) => ({
          productId: String(row.product_id),
          name: (row.name ?? "").trim(),
          slug: (row.slug ?? "").trim(),
          priceMin: normalizeNumericValue(row.price_min),
          status: (row.status_ ?? "").trim(),
          thumbnail: row.thumbnail ?? null,
          brandName: row.brand_name ?? null,
          categoryName: row.category_name ?? null,
          note: row.note ?? "",
        })),
      },
    });
  } catch (error) {
    return serverErrorResponse(
      "Admin post detail error",
      error,
      "Khong the tai chi tiet bai viet.",
      { post: null }
    );
  }
}
