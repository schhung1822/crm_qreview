import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  sanitizeAssetUrl,
  sanitizeText,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  notFound,
  readAdminBody,
  slugifyVietnamese,
  toFlag,
  toIsoDate,
  toPositiveInt,
  translateDbError,
} from "@/lib/qreview/api";
import { getDbPool, queryRows } from "@/lib/qreview/db";
import { sanitizePostContent } from "@/lib/qreview/post-content";

export const runtime = "nodejs";

/**
 * Quan tri tin tuc / bai viet.
 *
 * Moi bai viet co the gan kem cac SAN PHAM DE XUAT (`post_products`) — day la
 * cach noi dung dan nguoi doc toi trang san pham co link mua hang, tuc la cach
 * bai viet tao ra doanh thu cho mot trang review affiliate.
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
  product_count: number | null;
};

const LIMITS = {
  title: 255,
  slug: 191,
  excerpt: 500,
  content: 4_000_000,
  seoTitle: 191,
  seoDescription: 300,
  note: 255,
  maxProducts: 30,
};

/** Nhap se hien 512KB body; bai viet dai can nhieu hon. */
const POST_BODY_MAX_BYTES = 2 * 1024 * 1024;

const POST_TYPES = new Set(["news", "article", "review"]);
const POST_STATUSES = new Set(["draft", "published", "hidden"]);

function normalizeType(value: unknown) {
  const text = String(value ?? "news").trim().toLowerCase();
  return POST_TYPES.has(text) ? text : "news";
}

function normalizeStatus(value: unknown) {
  const text = String(value ?? "draft").trim().toLowerCase();
  return POST_STATUSES.has(text) ? text : "draft";
}

function mapPost(row: PostRow) {
  return {
    id: String(row.id),
    title: (row.title ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    type: normalizeType(row.type),
    excerpt: row.excerpt ?? null,
    coverImage: row.cover_image ?? null,
    authorId: row.author_id ? String(row.author_id) : null,
    authorName: row.author_name ?? null,
    status: normalizeStatus(row.status_),
    isFeatured: Number(row.is_featured ?? 0) === 1,
    viewCount: Number(row.view_count ?? 0),
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    productCount: Number(row.product_count ?? 0),
    publishedAt: toIsoDate(row.published_at),
    createdAt: toIsoDate(row.create_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

// Khong lay cot `content` o danh sach: mot bai dai vai tram KB, keo ca 100 bai
// ve chi de hien tieu de la lang phi bang thong lan bo nho.
const SELECT_POSTS = `
  SELECT
    p.id, p.title, p.slug, p.type, p.excerpt, p.cover_image, p.author_id,
    p.status_, p.is_featured, p.view_count, p.seo_title, p.seo_description,
    p.published_at, p.create_time, p.update_time,
    u.name AS author_name,
    (SELECT COUNT(*) FROM post_products pp WHERE pp.post_id = p.id) AS product_count
  FROM posts p
  LEFT JOIN users u ON u.id = p.author_id
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "posts" });

    if (guard.response) {
      return guard.response;
    }

    const url = new URL(request.url);
    const search = sanitizeText(url.searchParams.get("q"), 100);
    const status = sanitizeText(url.searchParams.get("status"), 32)?.toLowerCase();
    const type = sanitizeText(url.searchParams.get("type"), 32)?.toLowerCase();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push("(p.title LIKE ? OR p.slug LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status && POST_STATUSES.has(status)) {
      conditions.push("p.status_ = ?");
      params.push(status);
    }

    if (type && POST_TYPES.has(type)) {
      conditions.push("p.type = ?");
      params.push(type);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await queryRows<PostRow>(
      `${SELECT_POSTS} ${whereClause} ORDER BY p.id DESC LIMIT 300`,
      params
    );

    return NextResponse.json({ posts: rows.map(mapPost) });
  } catch (error) {
    return serverErrorResponse(
      "Admin posts list error",
      error,
      "Khong the tai danh sach bai viet.",
      { posts: [] }
    );
  }
}

type ProductInput = {
  productId?: string;
  note?: string;
};

type PostPayload = {
  id?: string;
  title?: string;
  slug?: string;
  type?: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  status?: string;
  isFeatured?: unknown;
  publishedAt?: string;
  products?: unknown;
};

type ParsedProduct = { productId: string; note: string | null; order: number };

/** Danh sach san pham de xuat: bo trung, gioi han so luong, giu thu tu. */
function parseProducts(products: unknown): ParsedProduct[] {
  if (!Array.isArray(products)) {
    return [];
  }

  const seen = new Set<string>();
  const result: ParsedProduct[] = [];

  for (const item of products.slice(0, LIMITS.maxProducts)) {
    const raw = typeof item === "string" ? { productId: item } : (item as ProductInput);
    const productId = toPositiveInt(raw?.productId);

    if (!productId || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    result.push({
      productId,
      note: sanitizeText(raw?.note, LIMITS.note),
      order: result.length * 10,
    });
  }

  return result;
}

function parsePostPayload(body: PostPayload) {
  const title = sanitizeText(body.title, LIMITS.title);

  if (!title) {
    return { error: "Vui lòng nhập tiêu đề bài viết.", value: null };
  }

  const slug = slugifyVietnamese(sanitizeText(body.slug, LIMITS.slug) || title);

  if (!slug) {
    return { error: "Không tạo được slug từ tiêu đề này, vui lòng nhập slug thủ công.", value: null };
  }

  const excerpt = sanitizeText(body.excerpt, LIMITS.excerpt);
  const status = normalizeStatus(body.status);

  // Ngay dang: nhan tu form, hoac tu dat khi chuyen sang trang thai "da dang".
  let publishedAt: Date | null = null;
  const rawPublished = sanitizeText(body.publishedAt, 40);

  if (rawPublished) {
    const parsed = new Date(rawPublished);
    publishedAt = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    error: null as string | null,
    value: {
      title,
      slug,
      type: normalizeType(body.type),
      excerpt,
      content: sanitizePostContent(body.content, LIMITS.content),
      coverImage: sanitizeAssetUrl(body.coverImage),
      status,
      isFeatured: toFlag(body.isFeatured),
      publishedAt,

      // SEO suy ra tu tieu de va mo ta ngan, giong cach lam o san pham — bot
      // mot cho phai nho cap nhat.
      seoTitle: title.slice(0, LIMITS.seoTitle),
      seoDescription: excerpt ? excerpt.slice(0, LIMITS.seoDescription) : null,

      products: parseProducts(body.products),
    },
  };
}

/** Ghi lai toan bo san pham de xuat cua bai viet (xoa cu, chen moi). */
async function replaceProducts(postId: string | number, products: ParsedProduct[]) {
  const pool = getDbPool();
  await pool.query("DELETE FROM post_products WHERE post_id = ?", [postId]);

  if (!products.length) {
    return;
  }

  const now = new Date();
  const values = products.map((product) => [
    postId,
    product.productId,
    product.order,
    product.note,
    now,
  ]);

  await pool.query(
    "INSERT INTO post_products (post_id, product_id, display_order, note, create_time) VALUES ?",
    [values]
  );
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "posts", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<PostPayload>(request, POST_BODY_MAX_BYTES);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parsePostPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    // Dang bai ma chua chon ngay thi lay thoi diem hien tai.
    const publishedAt =
      value.publishedAt ?? (value.status === "published" ? now : null);

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO posts
          (title, slug, type, excerpt, content, cover_image, author_id, status_,
           is_featured, seo_title, seo_description, published_at, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.title,
        value.slug,
        value.type,
        value.excerpt,
        value.content,
        value.coverImage,
        guard.actorId,
        value.status,
        value.isFeatured,
        value.seoTitle,
        value.seoDescription,
        publishedAt,
        now,
        now,
      ]
    );

    await replaceProducts(result.insertId, value.products);

    const rows = await queryRows<PostRow>(`${SELECT_POSTS} WHERE p.id = ? LIMIT 1`, [
      result.insertId,
    ]);

    return NextResponse.json({ post: rows[0] ? mapPost(rows[0]) : null }, { status: 201 });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse("Admin post create error", error, "Khong the tao bai viet.");
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "posts", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<PostPayload>(request, POST_BODY_MAX_BYTES);

    if (parsed.error) {
      return parsed.error;
    }

    const postId = toPositiveInt(parsed.data.id);

    if (!postId) {
      return badRequest("Thiếu id bài viết.");
    }

    const { error, value } = parsePostPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [existing] = await queryRows<RowDataPacket & { published_at: Date | null }>(
      "SELECT published_at FROM posts WHERE id = ? LIMIT 1",
      [postId]
    );

    if (!existing) {
      return notFound("Không tìm thấy bài viết.");
    }

    // Giu nguyen ngay dang cu neu da co; chi tu dat khi bai lan dau duoc dang.
    const publishedAt =
      value.publishedAt ??
      existing.published_at ??
      (value.status === "published" ? new Date() : null);

    await getDbPool().query<ResultSetHeader>(
      `
        UPDATE posts
        SET title = ?, slug = ?, type = ?, excerpt = ?, content = ?, cover_image = ?,
            status_ = ?, is_featured = ?, seo_title = ?, seo_description = ?,
            published_at = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.title,
        value.slug,
        value.type,
        value.excerpt,
        value.content,
        value.coverImage,
        value.status,
        value.isFeatured,
        value.seoTitle,
        value.seoDescription,
        publishedAt,
        new Date(),
        postId,
      ]
    );

    // Chi ghi de danh sach san pham khi client thuc su gui len.
    if (parsed.data.products !== undefined) {
      await replaceProducts(postId, value.products);
    }

    const rows = await queryRows<PostRow>(`${SELECT_POSTS} WHERE p.id = ? LIMIT 1`, [postId]);

    return NextResponse.json({ post: rows[0] ? mapPost(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin post update error",
      error,
      "Khong the cap nhat bai viet."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "posts", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const postId = toPositiveInt(parsed.data.id);

    if (!postId) {
      return badRequest("Thiếu id bài viết.");
    }

    const pool = getDbPool();

    // Xoa lien ket san pham truoc, neu khong se con ban ghi mo coi tro toi bai
    // viet khong con ton tai.
    await pool.query("DELETE FROM post_products WHERE post_id = ?", [postId]);

    const [result] = await pool.query<ResultSetHeader>("DELETE FROM posts WHERE id = ?", [
      postId,
    ]);

    if (!result.affectedRows) {
      return notFound("Không tìm thấy bài viết.");
    }

    return NextResponse.json({ id: postId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse("Admin post delete error", error, "Khong the xoa bai viet.");
  }
}
