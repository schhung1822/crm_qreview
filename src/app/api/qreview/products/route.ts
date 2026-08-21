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
import { getDbPool, normalizeNumericValue, queryRows } from "@/lib/qreview/db";
import { extractYouTubeVideoId } from "@/lib/qreview/youtube";

export const runtime = "nodejs";

/**
 * Quan tri san pham.
 *
 * LUU Y ve ten cot: bang `products` dung `created_time` (khong phai
 * `create_time` nhu cac bang khac). Ban cu cua API ghi nham `create_time` nen
 * moi lenh them san pham deu that bai.
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
  rating_avg: number | null;
  review_count: number | null;
  comment_count: number | null;
  created_time: Date | string | null;
  update_time: Date | string | null;
  brand_name: string | null;
  category_name: string | null;
  image_count: number | null;
  link_count: number | null;
  thumbnail: string | null;
};

const LIMITS = {
  name: 255,
  slug: 191,
  shortDesc: 1000,
  content: 50_000,
  segmentLabel: 100,
  seoTitle: 191,
  seoDescription: 300,
  specKey: 100,
  specLabel: 191,
  specValue: 1000,
  unit: 50,
  maxImages: 20,
  maxVideos: 10,
  maxSpecs: 100,
  maxColors: 30,
  maxLinks: 50,
  colorName: 100,
  merchantName: 150,
  linkPrice: 50,
  linkNote: 500,
  videoTitle: 255,
};

const PRODUCT_STATUSES = new Set(["active", "inactive", "draft"]);

/**
 * `products.status_` trong du lieu cu dang luu "1"/"0" chu khong phai chu.
 * Quy doi ve mot bo gia tri thong nhat de giao dien khong hien "1" kho hieu.
 */
function normalizeProductStatus(raw: unknown) {
  const text = String(raw ?? "").trim().toLowerCase();

  if (text === "1" || text === "active") {
    return "active";
  }

  if (text === "0" || text === "inactive") {
    return "inactive";
  }

  return PRODUCT_STATUSES.has(text) ? text : "active";
}

function mapProduct(row: ProductRow) {
  return {
    id: String(row.id),
    name: (row.name ?? "").trim(),
    slug: (row.slug ?? "").trim(),
    brandId: (row.brand_id ?? "").trim() || null,
    brandName: row.brand_name ?? null,
    categoryId: (row.category_id ?? "").trim() || null,
    categoryName: row.category_name ?? null,
    tagId: (row.tag_id ?? "").trim() || null,
    shortDesc: row.short_desc ?? null,
    content: row.content ?? null,
    priceMin: normalizeNumericValue(row.price_min),
    priceMax: normalizeNumericValue(row.price_max),
    status: normalizeProductStatus(row.status_),
    segmentLabel: row.segment_label ?? null,
    specGroupId: row.spec_group_id ? String(row.spec_group_id) : null,
    compareEnabled: Number(row.compare_enabled ?? 1) === 1,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    ratingAvg: normalizeNumericValue(row.rating_avg),
    reviewCount: Number(row.review_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    imageCount: Number(row.image_count ?? 0),
    linkCount: Number(row.link_count ?? 0),
    thumbnail: row.thumbnail ?? null,
    createdAt: toIsoDate(row.created_time),
    updatedAt: toIsoDate(row.update_time),
  };
}

const SELECT_PRODUCTS = `
  SELECT
    p.id, p.name, p.slug, p.brand_id, p.category_id, p.tag_id, p.short_desc,
    p.content, p.price_min, p.price_max, p.status_, p.segment_label,
    p.spec_group_id, p.compare_enabled, p.seo_title, p.seo_description,
    p.rating_avg, p.review_count, p.comment_count, p.created_time, p.update_time,
    b.name AS brand_name,
    c.name AS category_name,
    (SELECT COUNT(*) FROM product_images i WHERE i.product_id = CAST(p.id AS CHAR)) AS image_count,
    (SELECT COUNT(*) FROM affiliate_links l WHERE l.product_id = CAST(p.id AS CHAR)) AS link_count,
    (
      SELECT i2.image_url FROM product_images i2
      WHERE i2.product_id = CAST(p.id AS CHAR)
      ORDER BY (i2.is_thumbnail = '1') DESC, COALESCE(i2.sort_order, 0) ASC, i2.id ASC
      LIMIT 1
    ) AS thumbnail
  FROM products p
  LEFT JOIN brands b ON b.id = CAST(p.brand_id AS UNSIGNED)
  LEFT JOIN categories c ON c.id = CAST(p.category_id AS UNSIGNED)
`;

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "products" });

    if (guard.response) {
      return guard.response;
    }

    const url = new URL(request.url);
    const search = sanitizeText(url.searchParams.get("q"), 100);
    const categoryId = toPositiveInt(url.searchParams.get("categoryId"));
    const brandId = toPositiveInt(url.searchParams.get("brandId"));

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push("(p.name LIKE ? OR p.slug LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    if (categoryId) {
      conditions.push("p.category_id = ?");
      params.push(categoryId);
    }

    if (brandId) {
      conditions.push("p.brand_id = ?");
      params.push(brandId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await queryRows<ProductRow>(
      `${SELECT_PRODUCTS} ${whereClause} ORDER BY p.id DESC LIMIT 300`,
      params
    );

    return NextResponse.json({ products: rows.map(mapProduct) });
  } catch (error) {
    return serverErrorResponse(
      "Admin products list error",
      error,
      "Khong the tai danh sach san pham.",
      { products: [] }
    );
  }
}

type SpecInput = {
  specKey?: string;
  label?: string;
  value?: string;
  unit?: string;
  groupId?: string | null;
  sortOrder?: number;
  isComparable?: unknown;
  isHighlight?: unknown;
};

type ProductPayload = {
  id?: string;
  name?: string;
  slug?: string;
  brandId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  shortDesc?: string;
  content?: string;
  priceMin?: number;
  priceMax?: number;
  status?: string;
  segmentLabel?: string;
  specGroupId?: string | null;
  compareEnabled?: unknown;
  images?: unknown;
  videos?: unknown;
  thumbnailIndex?: number;
  specs?: unknown;
  colors?: unknown;
  affiliateLinks?: unknown;
};

type ParsedImage = {
  url: string;
  isThumbnail: boolean;
  colorClientId: string | null;
};

type ParsedVideo = {
  videoId: string;
  title: string | null;
};

function parseVideos(videos: unknown): {
  error: string | null;
  items: ParsedVideo[];
} {
  if (!Array.isArray(videos)) return { error: null, items: [] };

  const parsed: ParsedVideo[] = [];
  const seenIds = new Set<string>();

  for (let position = 0; position < videos.slice(0, LIMITS.maxVideos).length; position += 1) {
    const rawItem = videos[position];
    const item = rawItem as {
      url?: unknown;
      videoId?: unknown;
      title?: unknown;
    };
    const raw = typeof rawItem === "string" ? rawItem : item?.videoId ?? item?.url;
    const videoId = extractYouTubeVideoId(raw);

    if (!videoId) {
      return {
        error: `Video ${position + 1}: URL hoặc video ID YouTube không hợp lệ.`,
        items: [],
      };
    }

    if (seenIds.has(videoId)) continue;
    seenIds.add(videoId);
    parsed.push({
      videoId,
      title:
        typeof rawItem === "object" && rawItem !== null
          ? sanitizeText(item.title, LIMITS.videoTitle)
          : null,
    });
  }

  return { error: null, items: parsed };
}

function parseImages(images: unknown, thumbnailIndex: unknown): ParsedImage[] {
  if (!Array.isArray(images)) {
    return [];
  }

  const index = toInt(thumbnailIndex, 0);

  return images
    .slice(0, LIMITS.maxImages)
    .map((item, position) => {
      // Chap nhan ca chuoi URL lan object { url, isThumbnail }.
      const raw =
        typeof item === "string" ? item : (item as { url?: unknown })?.url;
      const url = sanitizeAssetUrl(raw);

      if (!url) {
        return null;
      }

      const explicitFlag =
        typeof item === "object" && item !== null && "isThumbnail" in item
          ? toFlag((item as { isThumbnail?: unknown }).isThumbnail) === 1
          : null;

      return {
        url,
        isThumbnail: explicitFlag ?? position === index,
        colorClientId:
          typeof item === "object" && item !== null
            ? sanitizeText((item as { colorId?: unknown }).colorId, 64)
            : null,
      };
    })
    .filter((item): item is ParsedImage => Boolean(item));
}

type ParsedColor = {
  clientId: string;
  name: string;
  hexCode: string;
  sortOrder: number;
  status: string;
};

function normalizeHexColor(value: unknown) {
  const raw = String(value ?? "").trim();
  const expanded = /^#[0-9a-f]{3}$/i.test(raw)
    ? `#${raw.slice(1).split("").map((char) => char + char).join("")}`
    : raw;
  return /^#[0-9a-f]{6}$/i.test(expanded) ? expanded.toUpperCase() : "#9CA3AF";
}

function parseColors(colors: unknown): ParsedColor[] {
  if (!Array.isArray(colors)) return [];

  return colors
    .slice(0, LIMITS.maxColors)
    .map((item, position) => {
      const color = item as {
        id?: unknown;
        clientId?: unknown;
        name?: unknown;
        hexCode?: unknown;
        sortOrder?: unknown;
        status?: unknown;
      };
      const name = sanitizeText(color?.name, LIMITS.colorName);
      if (!name) return null;

      return {
        clientId:
          sanitizeText(color.clientId ?? color.id, 64) ?? `color-${position + 1}`,
        name,
        hexCode: normalizeHexColor(color.hexCode),
        sortOrder: toInt(color.sortOrder, position),
        status: toStatus(color.status),
      };
    })
    .filter((item): item is ParsedColor => Boolean(item));
}

type ParsedAffiliateLink = {
  networkId: string;
  affiliateUrl: string;
  price: string | null;
  merchantName: string | null;
  isBest: number;
  sortOrder: number;
  status: string;
  note: string | null;
};

function parseAffiliateLinks(
  links: unknown
): { error: string | null; items: ParsedAffiliateLink[] } {
  if (!Array.isArray(links)) {
    return { error: null as string | null, items: [] as ParsedAffiliateLink[] };
  }

  const parsed: ParsedAffiliateLink[] = [];

  const limitedLinks = links.slice(0, LIMITS.maxLinks);

  for (let position = 0; position < limitedLinks.length; position += 1) {
    const raw = limitedLinks[position];
    const link = raw as {
      networkId?: unknown;
      affiliateUrl?: unknown;
      price?: unknown;
      merchantName?: unknown;
      isBest?: unknown;
      sortOrder?: unknown;
      status?: unknown;
      note?: unknown;
    };

    const hasAnyValue = Object.values(link ?? {}).some((value) =>
      String(value ?? "").trim()
    );
    if (!hasAnyValue) continue;

    const networkId = toPositiveInt(link.networkId);
    if (!networkId) {
      return { error: `Link mua hàng ${position + 1}: vui lòng chọn sàn TMĐT.`, items: [] };
    }

    const affiliateUrl = sanitizeHttpUrl(link.affiliateUrl);
    if (!affiliateUrl) {
      return {
        error: `Link mua hàng ${position + 1}: URL phải bắt đầu bằng http:// hoặc https://.`,
        items: [],
      };
    }

    parsed.push({
      networkId,
      affiliateUrl,
      price: sanitizeText(link.price, LIMITS.linkPrice),
      merchantName: sanitizeText(link.merchantName, LIMITS.merchantName),
      isBest: toFlag(link.isBest),
      sortOrder: toInt(link.sortOrder, position),
      status: toStatus(link.status),
      note: sanitizeText(link.note, LIMITS.linkNote),
    });
  }

  // Chỉ cho phép một nơi bán được đánh dấu tốt nhất.
  let foundBest = false;
  for (const link of parsed) {
    if (link.isBest && !foundBest) foundBest = true;
    else link.isBest = 0;
  }

  return { error: null as string | null, items: parsed };
}

type ParsedSpec = {
  specKey: string;
  label: string;
  value: string;
  unit: string | null;
  groupId: string | null;
  sortOrder: number;
  isComparable: number;
  isHighlight: number;
};

function parseSpecs(specs: unknown): ParsedSpec[] {
  if (!Array.isArray(specs)) {
    return [];
  }

  return specs
    .slice(0, LIMITS.maxSpecs)
    .map((item, position) => {
      const spec = item as SpecInput;
      const value = sanitizeText(spec?.value, LIMITS.specValue);

      // Thong so khong co gia tri thi bo qua — form co the gui o trong.
      if (!value) {
        return null;
      }

      const label = sanitizeText(spec?.label, LIMITS.specLabel);
      const rawKey = sanitizeText(spec?.specKey, LIMITS.specKey);
      const specKey = slugifyVietnamese(rawKey || label || "");

      if (!specKey || !label) {
        return null;
      }

      return {
        specKey,
        label,
        value,
        unit: sanitizeText(spec?.unit, LIMITS.unit),
        groupId: toPositiveInt(spec?.groupId),
        sortOrder: toInt(spec?.sortOrder, position),
        isComparable: spec?.isComparable === undefined ? 1 : toFlag(spec.isComparable),
        isHighlight: toFlag(spec?.isHighlight),
      };
    })
    .filter((item): item is ParsedSpec => Boolean(item));
}

function parseProductPayload(body: ProductPayload) {
  const name = sanitizeText(body.name, LIMITS.name);

  if (!name) {
    return { error: "Vui lòng nhập tên sản phẩm.", value: null };
  }

  const slug = slugifyVietnamese(sanitizeText(body.slug, LIMITS.slug) || name);

  if (!slug) {
    return { error: "Không tạo được slug từ tên này, vui lòng nhập slug thủ công.", value: null };
  }

  const categoryId = toPositiveInt(body.categoryId);

  if (!categoryId) {
    return { error: "Vui lòng chọn danh mục cho sản phẩm.", value: null };
  }

  const brandId = toPositiveInt(body.brandId);

  if (!brandId) {
    return { error: "Vui lòng chọn thương hiệu cho sản phẩm.", value: null };
  }

  const priceMin = Math.max(0, Math.round(normalizeNumericValue(body.priceMin)));
  const priceMaxRaw = Math.max(0, Math.round(normalizeNumericValue(body.priceMax)));
  const priceMax = priceMaxRaw || priceMin;

  if (priceMin && priceMax && priceMax < priceMin) {
    return { error: "Giá cao nhất không được nhỏ hơn giá thấp nhất.", value: null };
  }

  const status = String(body.status ?? "active").trim().toLowerCase();
  const shortDesc = sanitizeText(body.shortDesc, LIMITS.shortDesc);
  const parsedLinks = parseAffiliateLinks(body.affiliateLinks);
  const parsedVideos = parseVideos(body.videos);

  if (parsedLinks.error) {
    return { error: parsedLinks.error, value: null };
  }

  if (parsedVideos.error) {
    return { error: parsedVideos.error, value: null };
  }

  return {
    error: null as string | null,
    value: {
      name,
      slug,
      brandId,
      categoryId,
      tagId: toPositiveInt(body.tagId),
      shortDesc,
      content: sanitizeText(body.content, LIMITS.content),
      priceMin,
      priceMax,
      status: PRODUCT_STATUSES.has(status) ? status : "active",
      segmentLabel: sanitizeText(body.segmentLabel, LIMITS.segmentLabel),
      specGroupId: toPositiveInt(body.specGroupId),
      compareEnabled: body.compareEnabled === undefined ? 1 : toFlag(body.compareEnabled),

      // SEO suy ra tu noi dung san pham, khong nhap rieng: tieu de lay ten san
      // pham, mo ta lay mo ta ngan. Bot mot cho phai nho cap nhat, va tranh
      // tinh trang doi ten san pham nhung the SEO van giu ten cu.
      seoTitle: name.slice(0, LIMITS.seoTitle),
      seoDescription: shortDesc ? shortDesc.slice(0, LIMITS.seoDescription) : null,

      images: parseImages(body.images, body.thumbnailIndex),
      videos: parsedVideos.items,
      specs: parseSpecs(body.specs),
      colors: parseColors(body.colors),
      affiliateLinks: parsedLinks.items,
    },
  };
}

/** Ghi lai toan bo anh cua san pham (xoa cu, chen moi). */
async function replaceImages(
  productId: string | number,
  images: ParsedImage[],
  colorIds: Map<string, number> = new Map()
) {
  const pool = getDbPool();
  await pool.query("DELETE FROM product_images WHERE product_id = ?", [productId]);

  if (!images.length) {
    return;
  }

  // Bao dam dung mot anh dai dien: neu form khong danh dau anh nao, lay anh dau.
  const hasThumbnail = images.some((image) => image.isThumbnail);

  const values = images.map((image, index) => [
    String(productId),
    image.url,
    image.colorClientId ? colorIds.get(image.colorClientId) ?? null : null,
    (hasThumbnail ? image.isThumbnail : index === 0) ? "1" : "0",
    index + 1,
  ]);

  await pool.query(
    "INSERT INTO product_images (product_id, image_url, color_id, is_thumbnail, sort_order) VALUES ?",
    [values]
  );
}

/** Ghi lại danh sách video YouTube của sản phẩm theo đúng thứ tự trên form. */
async function replaceVideos(
  productId: string | number,
  videos: ParsedVideo[]
) {
  const pool = getDbPool();
  await pool.query("DELETE FROM product_videos WHERE product_id = ?", [productId]);
  if (!videos.length) return;

  const now = new Date();
  const values = videos.map((video, index) => [
    String(productId),
    video.videoId,
    video.title,
    index,
    now,
    now,
  ]);

  await pool.query(
    `
      INSERT INTO product_videos
        (product_id, youtube_video_id, title, sort_order, create_time, update_time)
      VALUES ?
    `,
    [values]
  );
}

/** Ghi lại màu và trả về ánh xạ id tạm trên form -> id trong CSDL. */
async function replaceColors(productId: string | number, colors: ParsedColor[]) {
  const pool = getDbPool();
  await pool.query("DELETE FROM product_colors WHERE product_id = ?", [productId]);

  const colorIds = new Map<string, number>();
  const now = new Date();

  for (const color of colors) {
    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO product_colors
          (product_id, name, hex_code, sort_order, status_, create_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(productId),
        color.name,
        color.hexCode,
        color.sortOrder,
        color.status,
        now,
        now,
      ]
    );
    colorIds.set(color.clientId, result.insertId);
  }

  return colorIds;
}

async function getExistingColorIds(productId: string | number) {
  const rows = await queryRows<RowDataPacket & { id: number }>(
    "SELECT id FROM product_colors WHERE product_id = ?",
    [productId]
  );
  return new Map(rows.map((row) => [String(row.id), Number(row.id)]));
}

/** Ghi toàn bộ nơi bán ngay cùng lúc với sản phẩm. */
async function replaceAffiliateLinks(
  productId: string | number,
  links: ParsedAffiliateLink[]
) {
  const pool = getDbPool();
  await pool.query("DELETE FROM affiliate_links WHERE product_id = ?", [productId]);
  if (!links.length) return;

  const now = new Date();
  const values = links.map((link) => [
    String(productId),
    link.networkId,
    link.affiliateUrl,
    link.price,
    link.merchantName,
    link.isBest,
    link.sortOrder,
    link.status,
    link.note,
    now,
    now,
  ]);

  await pool.query(
    `
      INSERT INTO affiliate_links
        (product_id, network_id, affiliate_url, price, merchant_name, is_best,
         sort_order, status_, note, create_time, update_time)
      VALUES ?
    `,
    [values]
  );
}

/** Ghi lai toan bo thong so cua san pham. */
async function replaceSpecs(productId: string | number, specs: ParsedSpec[]) {
  const pool = getDbPool();
  await pool.query("DELETE FROM product_specs WHERE product_id = ?", [productId]);

  if (!specs.length) {
    return;
  }

  const values = specs.map((spec) => [
    String(productId),
    spec.specKey,
    spec.label,
    spec.groupId,
    spec.value,
    spec.unit,
    spec.sortOrder,
    spec.isComparable,
    spec.isHighlight,
  ]);

  await pool.query(
    `
      INSERT INTO product_specs
        (product_id, spec_key, spec_label, spec_group, spec_value, unit,
         sort_order, is_comparable, highlight_priority)
      VALUES ?
    `,
    [values]
  );
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "products", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<ProductPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const { error, value } = parseProductPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const now = new Date();

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        INSERT INTO products
          (name, slug, brand_id, category_id, tag_id, short_desc, content,
           price_min, price_max, status_, segment_label, spec_group_id,
           compare_enabled, seo_title, seo_description, created_time, update_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        value.name,
        value.slug,
        value.brandId,
        value.categoryId,
        value.tagId,
        value.shortDesc,
        value.content,
        value.priceMin,
        value.priceMax,
        value.status,
        value.segmentLabel,
        value.specGroupId,
        value.compareEnabled,
        value.seoTitle,
        value.seoDescription,
        now,
        now,
      ]
    );

    const productId = result.insertId;

    const colorIds = await replaceColors(productId, value.colors);
    await replaceImages(productId, value.images, colorIds);
    await replaceVideos(productId, value.videos);
    await replaceSpecs(productId, value.specs);
    await replaceAffiliateLinks(productId, value.affiliateLinks);

    const rows = await queryRows<ProductRow>(`${SELECT_PRODUCTS} WHERE p.id = ? LIMIT 1`, [
      productId,
    ]);

    return NextResponse.json(
      { product: rows[0] ? mapProduct(rows[0]) : null },
      { status: 201 }
    );
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin product create error",
      error,
      "Khong the tao san pham."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "products", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<ProductPayload>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const productId = toPositiveInt(parsed.data.id);

    if (!productId) {
      return badRequest("Thiếu id sản phẩm.");
    }

    const { error, value } = parseProductPayload(parsed.data);

    if (error || !value) {
      return badRequest(error ?? "Dữ liệu không hợp lệ.");
    }

    const [result] = await getDbPool().query<ResultSetHeader>(
      `
        UPDATE products
        SET name = ?, slug = ?, brand_id = ?, category_id = ?, tag_id = ?,
            short_desc = ?, content = ?, price_min = ?, price_max = ?, status_ = ?,
            segment_label = ?, spec_group_id = ?, compare_enabled = ?,
            seo_title = ?, seo_description = ?, update_time = ?
        WHERE id = ?
      `,
      [
        value.name,
        value.slug,
        value.brandId,
        value.categoryId,
        value.tagId,
        value.shortDesc,
        value.content,
        value.priceMin,
        value.priceMax,
        value.status,
        value.segmentLabel,
        value.specGroupId,
        value.compareEnabled,
        value.seoTitle,
        value.seoDescription,
        new Date(),
        productId,
      ]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy sản phẩm.");
    }

    // Anh va thong so chi ghi de khi client thuc su gui len, de mot lan sua
    // chi doi ten khong lam mat toan bo anh.
    let colorIds = await getExistingColorIds(productId);
    if (parsed.data.colors !== undefined) {
      colorIds = await replaceColors(productId, value.colors);
    }

    if (parsed.data.images !== undefined) {
      await replaceImages(productId, value.images, colorIds);
    }

    if (parsed.data.videos !== undefined) {
      await replaceVideos(productId, value.videos);
    }

    if (parsed.data.specs !== undefined) {
      await replaceSpecs(productId, value.specs);
    }

    if (parsed.data.affiliateLinks !== undefined) {
      await replaceAffiliateLinks(productId, value.affiliateLinks);
    }

    const rows = await queryRows<ProductRow>(`${SELECT_PRODUCTS} WHERE p.id = ? LIMIT 1`, [
      productId,
    ]);

    return NextResponse.json({ product: rows[0] ? mapProduct(rows[0]) : null });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin product update error",
      error,
      "Khong the cap nhat san pham."
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "products", write: true });

    if (guard.response) {
      return guard.response;
    }

    const parsed = await readAdminBody<{ id?: string }>(request);

    if (parsed.error) {
      return parsed.error;
    }

    const productId = toPositiveInt(parsed.data.id);

    if (!productId) {
      return badRequest("Thiếu id sản phẩm.");
    }

    const pool = getDbPool();

    // Don sach du lieu phu thuoc truoc, neu khong se con lai ban ghi mo coi tro
    // toi san pham khong con ton tai.
    const dependants = [
      "DELETE FROM product_images WHERE product_id = ?",
      "DELETE FROM product_videos WHERE product_id = ?",
      "DELETE FROM product_colors WHERE product_id = ?",
      "DELETE FROM product_specs WHERE product_id = ?",
      "DELETE FROM affiliate_links WHERE product_id = ?",
      "DELETE FROM product_variant WHERE product_id = ?",
      "DELETE FROM product_comments WHERE product_id = ?",
      "DELETE FROM reviews WHERE product_id = ?",
      "DELETE FROM product_comparison_items WHERE product_id = ?",
      "DELETE FROM product_relations WHERE product_id = ? OR related_product_id = ?",
    ];

    for (const sql of dependants) {
      try {
        const params = sql.includes("related_product_id")
          ? [productId, productId]
          : [productId];
        await pool.query(sql, params);
      } catch {
        // Bang khong ton tai trong mot so ban cai — bo qua.
      }
    }

    const [result] = await pool.query<ResultSetHeader>(
      "DELETE FROM products WHERE id = ?",
      [productId]
    );

    if (!result.affectedRows) {
      return notFound("Không tìm thấy sản phẩm.");
    }

    return NextResponse.json({ id: productId });
  } catch (error) {
    const translated = translateDbError(error);

    if (translated) {
      return translated;
    }

    return serverErrorResponse(
      "Admin product delete error",
      error,
      "Khong the xoa san pham."
    );
  }
}
