import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { serverErrorResponse } from "@/lib/qreview/api-security";
import { guardAdminRequest } from "@/lib/qreview/api";
import { queryRows } from "@/lib/qreview/db";

export const runtime = "nodejs";

/** So lieu tong quan cho trang chu khu quan tri. */

type CountRow = RowDataPacket & { n: number };

/**
 * Dem an toan: mot so bang co the chua ton tai tren ban cai cu, va mot muc
 * thong ke loi khong nen lam sap ca trang tong quan.
 */
async function safeCount(sql: string, params: unknown[] = []) {
  try {
    const [row] = await queryRows<CountRow>(sql, params);
    return Number(row?.n ?? 0);
  } catch (error) {
    console.error("Admin stats count failed:", sql, error);
    return 0;
  }
}

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "stats" });

    if (guard.response) {
      return guard.response;
    }

    const [
      products,
      activeProducts,
      productsWithoutLink,
      productsWithoutSpec,
      categories,
      brands,
      networks,
      affiliateLinks,
      specDefinitions,
      reviews,
      hiddenReviews,
      comments,
      hiddenComments,
      users,
      posts,
      publishedPosts,
      postsWithoutProduct,
    ] = await Promise.all([
      safeCount("SELECT COUNT(*) AS n FROM products"),
      safeCount(
        "SELECT COUNT(*) AS n FROM products WHERE COALESCE(NULLIF(status_,''),'active') IN ('active','1')"
      ),
      // San pham chua co link mua hang = chua kiem duoc tien, uu tien xu ly.
      safeCount(`
        SELECT COUNT(*) AS n FROM products p
        WHERE NOT EXISTS (
          SELECT 1 FROM affiliate_links l WHERE l.product_id = CAST(p.id AS CHAR)
        )
      `),
      safeCount(`
        SELECT COUNT(*) AS n FROM products p
        WHERE NOT EXISTS (
          SELECT 1 FROM product_specs s WHERE s.product_id = CAST(p.id AS CHAR)
        )
      `),
      safeCount("SELECT COUNT(*) AS n FROM categories"),
      safeCount("SELECT COUNT(*) AS n FROM brands"),
      safeCount("SELECT COUNT(*) AS n FROM affiliate_networks"),
      safeCount("SELECT COUNT(*) AS n FROM affiliate_links"),
      safeCount("SELECT COUNT(*) AS n FROM spec_definitions"),
      safeCount("SELECT COUNT(*) AS n FROM reviews"),
      // Khong con hang cho duyet: chi dem so muc admin da chu dong an di.
      safeCount(
        "SELECT COUNT(*) AS n FROM reviews WHERE COALESCE(NULLIF(status_,''),'approved') <> 'approved'"
      ),
      safeCount("SELECT COUNT(*) AS n FROM product_comments"),
      safeCount(
        "SELECT COUNT(*) AS n FROM product_comments WHERE COALESCE(NULLIF(status_,''),'approved') <> 'approved'"
      ),
      safeCount("SELECT COUNT(*) AS n FROM users"),
      safeCount("SELECT COUNT(*) AS n FROM posts"),
      safeCount("SELECT COUNT(*) AS n FROM posts WHERE status_ = 'published'"),
      // Bai da dang ma khong gan san pham nao thi khong dan duoc nguoi doc toi
      // link mua hang — voi trang affiliate day la co hoi bi bo lo.
      safeCount(`
        SELECT COUNT(*) AS n FROM posts p
        WHERE p.status_ = 'published'
          AND NOT EXISTS (SELECT 1 FROM post_products pp WHERE pp.post_id = p.id)
      `),
    ]);

    return NextResponse.json({
      stats: {
        products,
        activeProducts,
        productsWithoutLink,
        productsWithoutSpec,
        categories,
        brands,
        networks,
        affiliateLinks,
        specDefinitions,
        reviews,
        hiddenReviews,
        comments,
        hiddenComments,
        users,
        posts,
        publishedPosts,
        postsWithoutProduct,
      },
    });
  } catch (error) {
    return serverErrorResponse(
      "Admin stats error",
      error,
      "Khong the tai so lieu tong quan.",
      { stats: null }
    );
  }
}
