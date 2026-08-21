import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import {
  sanitizeAssetUrl,
  sanitizeText,
  serverErrorResponse,
} from "@/lib/qreview/api-security";
import {
  badRequest,
  guardAdminRequest,
  slugifyVietnamese,
  toPositiveInt,
} from "@/lib/qreview/api";
import {
  PRODUCT_CSV_COLUMNS,
  makeSpecColumn,
  parseCsv,
  parseImageSources,
  parseSpecColumn,
  serializeCsv,
  type ProductCsvSpecColumn,
} from "@/lib/qreview/product-csv";
import { downloadPublicRasterImage } from "@/lib/qreview/remote-image";
import { getDbPool, queryRows } from "@/lib/qreview/db";
import { convertRasterToWebp } from "@/lib/qreview/server-image";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const MAX_COLUMNS = 250;
const MAX_IMAGES_PER_PRODUCT = 20;
const MAX_ERROR_DETAILS = 100;

type GroupRow = RowDataPacket & {
  id: number;
  name: string;
  slug: string;
};

type DefinitionRow = RowDataPacket & {
  id: number;
  spec_key: string;
  label: string;
  unit: string | null;
  sort_order: number | null;
  is_comparable: number | null;
  is_highlight: number | null;
};

type ExportProductRow = RowDataPacket & {
  id: number;
  name: string | null;
  slug: string | null;
  category_id: string | null;
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  short_desc: string | null;
  content: string | null;
  price_min: number | null;
  price_max: number | null;
  status_: string | null;
  segment_label: string | null;
  compare_enabled: number | null;
};

type ExportImageRow = RowDataPacket & {
  product_id: string;
  image_url: string;
  is_thumbnail: string | number | null;
  sort_order: number | null;
};

type ExportSpecRow = RowDataPacket & {
  product_id: string;
  spec_key: string;
  spec_label: string | null;
  spec_value: string | null;
  unit: string | null;
  sort_order: number | null;
};

type TaxonomyRow = RowDataPacket & {
  id: number;
  name: string;
};

type ImportSpec = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  sortOrder: number;
  isComparable: number;
  isHighlight: number;
};

type MaterializedImage = {
  url: string;
  isThumbnail: boolean;
};

class RowImportError extends Error {}

async function getGroup(groupId: string) {
  const [group] = await queryRows<GroupRow>(
    "SELECT id, name, slug FROM spec_groups WHERE id = ? LIMIT 1",
    [groupId]
  );
  return group ?? null;
}

async function getDefinitions(groupId: string) {
  return queryRows<DefinitionRow>(
    `
      SELECT id, spec_key, label, unit, sort_order, is_comparable, is_highlight
      FROM spec_definitions
      WHERE group_id = ?
      ORDER BY COALESCE(sort_order, 0) ASC, id ASC
    `,
    [groupId]
  );
}

function normalizeProductStatus(value: unknown) {
  const status = String(value ?? "active").trim().toLowerCase();
  if (status === "1") return "active";
  if (status === "0") return "inactive";
  return ["active", "inactive", "draft"].includes(status) ? status : "active";
}

function isThumbnailFlag(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true";
}

function buildExportSpecColumns(
  definitions: DefinitionRow[],
  specs: ExportSpecRow[]
) {
  const columns = new Map<string, ProductCsvSpecColumn>();

  for (const definition of definitions) {
    columns.set(definition.spec_key, {
      key: definition.spec_key,
      label: definition.label,
      unit: definition.unit,
    });
  }

  // Keep legacy/custom values visible so exporting then importing never drops
  // specifications which are not currently part of the selected definition set.
  for (const spec of specs) {
    if (!columns.has(spec.spec_key)) {
      columns.set(spec.spec_key, {
        key: spec.spec_key,
        label: spec.spec_label?.trim() || spec.spec_key,
        unit: spec.unit,
      });
    }
  }

  return Array.from(columns.values());
}

export async function GET(request: Request) {
  try {
    const guard = await guardAdminRequest(request, { bucket: "product-csv" });
    if (guard.response) return guard.response;

    const groupId = toPositiveInt(new URL(request.url).searchParams.get("specGroupId"));
    if (!groupId) return badRequest("Vui lòng chọn nhóm thông số cần xuất.");

    const group = await getGroup(groupId);
    if (!group) return badRequest("Không tìm thấy nhóm thông số đã chọn.");

    const [definitions, products] = await Promise.all([
      getDefinitions(groupId),
      queryRows<ExportProductRow>(
        `
          SELECT
            p.id, p.name, p.slug, p.category_id, c.name AS category_name,
            p.brand_id, b.name AS brand_name, p.short_desc, p.content,
            p.price_min, p.price_max, p.status_, p.segment_label, p.compare_enabled
          FROM products p
          LEFT JOIN categories c ON c.id = CAST(p.category_id AS UNSIGNED)
          LEFT JOIN brands b ON b.id = CAST(p.brand_id AS UNSIGNED)
          WHERE p.spec_group_id = ?
          ORDER BY p.id ASC
        `,
        [groupId]
      ),
    ]);

    const productIds = products.map((product) => String(product.id));
    const [images, specs] = productIds.length
      ? await Promise.all([
          queryRows<ExportImageRow>(
            `
              SELECT product_id, image_url, is_thumbnail, sort_order
              FROM product_images
              WHERE product_id IN (?)
              ORDER BY COALESCE(sort_order, 0) ASC, id ASC
            `,
            [productIds]
          ),
          queryRows<ExportSpecRow>(
            `
              SELECT product_id, spec_key, spec_label, spec_value, unit, sort_order
              FROM product_specs
              WHERE product_id IN (?)
              ORDER BY COALESCE(sort_order, 0) ASC, id ASC
            `,
            [productIds]
          ),
        ])
      : [[], []] as [ExportImageRow[], ExportSpecRow[]];

    const specColumns = buildExportSpecColumns(definitions, specs);
    const imageMap = new Map<string, ExportImageRow[]>();
    const specMap = new Map<string, Map<string, string>>();

    for (const image of images) {
      const bucket = imageMap.get(String(image.product_id)) ?? [];
      bucket.push(image);
      imageMap.set(String(image.product_id), bucket);
    }

    for (const spec of specs) {
      const bucket = specMap.get(String(spec.product_id)) ?? new Map<string, string>();
      bucket.set(spec.spec_key, spec.spec_value ?? "");
      specMap.set(String(spec.product_id), bucket);
    }

    const header = [
      ...PRODUCT_CSV_COLUMNS,
      ...specColumns.map((column) => makeSpecColumn(column)),
    ];

    const rows: unknown[][] = [header];

    for (const product of products) {
      const productImages = imageMap.get(String(product.id)) ?? [];
      const thumbnail = productImages.find((image) => isThumbnailFlag(image.is_thumbnail));
      const productSpecs = specMap.get(String(product.id)) ?? new Map<string, string>();

      rows.push([
        product.name ?? "",
        product.slug ?? "",
        product.category_id ?? "",
        product.category_name ?? "",
        product.brand_id ?? "",
        product.brand_name ?? "",
        product.short_desc ?? "",
        product.content ?? "",
        product.price_min ?? 0,
        product.price_max ?? product.price_min ?? 0,
        normalizeProductStatus(product.status_),
        product.segment_label ?? "",
        Number(product.compare_enabled ?? 1) === 1 ? "1" : "0",
        thumbnail?.image_url ?? productImages[0]?.image_url ?? "",
        JSON.stringify(productImages.map((image) => image.image_url)),
        ...specColumns.map((column) => productSpecs.get(column.key) ?? ""),
      ]);
    }

    const csv = `\uFEFF${serializeCsv(rows)}`;
    const fileSlug = slugifyVietnamese(group.slug || group.name) || groupId;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="san-pham-${fileSlug}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverErrorResponse(
      "Product CSV export error",
      error,
      "Không thể xuất danh sách sản phẩm."
    );
  }
}

function taxonomyNameKey(value: string) {
  return value.trim().toLocaleLowerCase("vi-VN");
}

function buildTaxonomyMaps(rows: TaxonomyRow[]) {
  return {
    ids: new Set(rows.map((row) => String(row.id))),
    names: new Map(rows.map((row) => [taxonomyNameKey(row.name), String(row.id)])),
  };
}

function resolveTaxonomy(
  rawId: string,
  rawName: string,
  maps: ReturnType<typeof buildTaxonomyMaps>,
  label: string
) {
  const id = toPositiveInt(rawId);
  if (id && maps.ids.has(id)) return id;

  const name = rawName.trim();
  const byName = name ? maps.names.get(taxonomyNameKey(name)) : null;
  if (byName) return byName;

  throw new RowImportError(`${label} không tồn tại; hãy kiểm tra cột id hoặc tên.`);
}

function parsePrice(value: string, fieldLabel: string) {
  const raw = value.trim();
  if (!raw) return 0;

  // Accept raw numbers and common VND thousands formats such as 1.299.000.
  const normalized = /^\d{1,3}([.,]\d{3})+$/.test(raw)
    ? raw.replace(/[.,]/g, "")
    : raw.replace(/[,\s]/g, "");
  const number = Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new RowImportError(`${fieldLabel} phải là số không âm.`);
  }

  return Math.round(number);
}

function parseCompareEnabled(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return 1;
  return ["0", "false", "no", "không", "khong"].includes(text) ? 0 : 1;
}

function cellAt(row: string[], indexes: Map<string, number>, key: string) {
  const index = indexes.get(key);
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

async function removeFiles(files: string[]) {
  await Promise.allSettled(files.map((file) => unlink(file)));
}

async function materializeImages(
  sources: string[],
  thumbnailSource: string
): Promise<{ images: MaterializedImage[]; createdFiles: string[]; downloaded: number }> {
  const uniqueSources: string[] = [];
  const seen = new Set<string>();

  for (const rawSource of [...sources, thumbnailSource]) {
    const source = rawSource.trim();
    if (!source) continue;

    const sanitized = sanitizeAssetUrl(source);
    if (!sanitized) {
      throw new RowImportError(`Đường dẫn ảnh không hợp lệ: ${source}`);
    }
    if (seen.has(sanitized)) continue;
    seen.add(sanitized);
    uniqueSources.push(sanitized);
  }

  if (uniqueSources.length > MAX_IMAGES_PER_PRODUCT) {
    throw new RowImportError(`Mỗi sản phẩm chỉ được có tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh.`);
  }

  const sanitizedThumbnail = sanitizeAssetUrl(thumbnailSource);
  const uploadDir = path.join(process.cwd(), "public", "images", "products");
  const createdFiles: string[] = [];
  const images: MaterializedImage[] = [];
  let downloaded = 0;

  try {
    for (const source of uniqueSources) {
      if (source.startsWith("/")) {
        images.push({ url: source, isThumbnail: source === sanitizedThumbnail });
        continue;
      }

      let buffer: Buffer;
      try {
        buffer = await downloadPublicRasterImage(source);
      } catch (error) {
        throw new RowImportError(
          `Không tải được ảnh ${source}: ${(error as Error).message || "lỗi không xác định"}`
        );
      }

      let webpBuffer: Buffer;
      try {
        webpBuffer = await convertRasterToWebp(buffer);
      } catch {
        throw new RowImportError(`Ảnh ${source} bị lỗi hoặc không đọc được.`);
      }

      await mkdir(uploadDir, { recursive: true });
      const fileName = `${Date.now()}-${randomUUID()}.webp`;
      const filePath = path.join(uploadDir, fileName);
      if (!filePath.startsWith(uploadDir + path.sep)) {
        throw new RowImportError("Đường dẫn lưu ảnh không hợp lệ.");
      }

      await writeFile(filePath, webpBuffer);
      createdFiles.push(filePath);
      images.push({
        url: `/images/products/${fileName}`,
        isThumbnail: source === sanitizedThumbnail,
      });
      downloaded += 1;
    }

    if (images.length && !images.some((image) => image.isThumbnail)) {
      images[0].isThumbnail = true;
    }

    return { images, createdFiles, downloaded };
  } catch (error) {
    await removeFiles(createdFiles);
    throw error;
  }
}

async function replaceImportedImages(
  connection: PoolConnection,
  productId: number,
  images: MaterializedImage[]
) {
  const [existingRows] = await connection.query<
    (RowDataPacket & { image_url: string; color_id: number | null })[]
  >(
    "SELECT image_url, color_id FROM product_images WHERE product_id = ?",
    [productId]
  );
  const existingColorIds = new Map(
    existingRows.map((image) => [image.image_url, image.color_id])
  );

  await connection.query("DELETE FROM product_images WHERE product_id = ?", [productId]);
  if (!images.length) return;

  const values = images.map((image, index) => [
    String(productId),
    image.url,
    existingColorIds.get(image.url) ?? null,
    image.isThumbnail ? "1" : "0",
    index + 1,
  ]);
  await connection.query(
    "INSERT INTO product_images (product_id, image_url, color_id, is_thumbnail, sort_order) VALUES ?",
    [values]
  );
}

async function replaceImportedSpecs(
  connection: PoolConnection,
  productId: number,
  groupId: string,
  specs: ImportSpec[]
) {
  await connection.query("DELETE FROM product_specs WHERE product_id = ?", [productId]);
  if (!specs.length) return;

  const values = specs.map((spec) => [
    String(productId),
    spec.key,
    spec.label,
    groupId,
    spec.value,
    spec.unit,
    spec.sortOrder,
    spec.isComparable,
    spec.isHighlight,
  ]);
  await connection.query(
    `
      INSERT INTO product_specs
        (product_id, spec_key, spec_label, spec_group, spec_value, unit,
         sort_order, is_comparable, highlight_priority)
      VALUES ?
    `,
    [values]
  );
}

function rowErrorMessage(error: unknown) {
  if (error instanceof RowImportError) return error.message;
  if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
    return "Slug sản phẩm đã tồn tại hoặc bị trùng dữ liệu.";
  }

  console.error("Unexpected product CSV row error:", error);
  return "Không thể lưu dòng này vào cơ sở dữ liệu.";
}

export async function POST(request: Request) {
  try {
    const guard = await guardAdminRequest(request, {
      bucket: "product-csv",
      write: true,
    });
    if (guard.response) return guard.response;

    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CSV_BYTES + 256 * 1024) {
      return NextResponse.json({ error: "File CSV không được vượt quá 5MB." }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const groupId = toPositiveInt(formData.get("specGroupId"));

    if (!groupId) return badRequest("Vui lòng chọn nhóm thông số khi nhập file.");
    if (!(file instanceof File)) return badRequest("Vui lòng chọn một file CSV.");
    if (file.size > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "File CSV không được vượt quá 5MB." }, { status: 413 });
    }

    const group = await getGroup(groupId);
    if (!group) return badRequest("Không tìm thấy nhóm thông số đã chọn.");

    let rows: string[][];
    try {
      rows = parseCsv(await file.text());
    } catch (error) {
      return badRequest((error as Error).message || "File CSV không hợp lệ.");
    }

    if (!rows.length) return badRequest("File CSV đang trống.");
    if (rows[0].length > MAX_COLUMNS) {
      return badRequest(`File CSV chỉ được có tối đa ${MAX_COLUMNS} cột.`);
    }

    const headers = rows[0].map((header) => header.trim());
    const indexes = new Map<string, number>();

    for (let index = 0; index < headers.length; index += 1) {
      const normalized = headers[index].toLowerCase();
      if (!normalized) continue;
      if (indexes.has(normalized)) return badRequest(`Cột "${headers[index]}" đang bị lặp.`);
      indexes.set(normalized, index);
    }

    if (!indexes.has("name")) return badRequest('File CSV thiếu cột bắt buộc "name".');
    if (!indexes.has("category_id") && !indexes.has("category_name")) {
      return badRequest('File CSV cần có cột "category_id" hoặc "category_name".');
    }
    if (!indexes.has("brand_id") && !indexes.has("brand_name")) {
      return badRequest('File CSV cần có cột "brand_id" hoặc "brand_name".');
    }

    const dataRows = rows
      .slice(1)
      .map((row, index) => ({ row, number: index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim()));

    if (dataRows.length > MAX_IMPORT_ROWS) {
      return badRequest(`Mỗi lần chỉ được nhập tối đa ${MAX_IMPORT_ROWS} sản phẩm.`);
    }

    const definitions = await getDefinitions(groupId);
    const definitionsByKey = new Map(definitions.map((item) => [item.spec_key, item]));
    const specColumns: Array<ProductCsvSpecColumn & { index: number }> = [];
    const seenSpecKeys = new Set<string>();

    headers.forEach((header, index) => {
      const parsed = parseSpecColumn(header);
      if (!parsed) return;

      const key = slugifyVietnamese(parsed.key);
      if (!key || seenSpecKeys.has(key)) {
        throw new RowImportError(`Cột thông số "${header}" không hợp lệ hoặc bị lặp.`);
      }
      seenSpecKeys.add(key);
      specColumns.push({ ...parsed, key, index });
    });

    const [categories, brands] = await Promise.all([
      queryRows<TaxonomyRow>("SELECT id, name FROM categories"),
      queryRows<TaxonomyRow>("SELECT id, name FROM brands"),
    ]);
    const categoryMaps = buildTaxonomyMaps(categories);
    const brandMaps = buildTaxonomyMaps(brands);
    const hasImageColumns = indexes.has("image_urls") || indexes.has("thumbnail_url");
    const pool = getDbPool();

    let created = 0;
    let updated = 0;
    let downloadedImages = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const seenSlugs = new Set<string>();

    for (const item of dataRows) {
      let createdFiles: string[] = [];

      try {
        const name = sanitizeText(cellAt(item.row, indexes, "name"), 255);
        if (!name) throw new RowImportError("Tên sản phẩm đang trống.");

        const slug = slugifyVietnamese(cellAt(item.row, indexes, "slug") || name);
        if (!slug) throw new RowImportError("Không tạo được slug từ tên sản phẩm.");
        if (seenSlugs.has(slug)) throw new RowImportError(`Slug "${slug}" bị lặp trong file.`);
        seenSlugs.add(slug);

        const categoryId = resolveTaxonomy(
          cellAt(item.row, indexes, "category_id"),
          cellAt(item.row, indexes, "category_name"),
          categoryMaps,
          "Danh mục"
        );
        const brandId = resolveTaxonomy(
          cellAt(item.row, indexes, "brand_id"),
          cellAt(item.row, indexes, "brand_name"),
          brandMaps,
          "Thương hiệu"
        );
        const priceMin = parsePrice(cellAt(item.row, indexes, "price_min"), "Giá thấp nhất");
        const priceMaxInput = parsePrice(
          cellAt(item.row, indexes, "price_max"),
          "Giá cao nhất"
        );
        const priceMax = priceMaxInput || priceMin;
        if (priceMin && priceMax < priceMin) {
          throw new RowImportError("Giá cao nhất không được nhỏ hơn giá thấp nhất.");
        }

        const shortDesc = sanitizeText(cellAt(item.row, indexes, "short_desc"), 1000);
        const content = sanitizeText(cellAt(item.row, indexes, "content"), 50_000);
        const segmentLabel = sanitizeText(cellAt(item.row, indexes, "segment_label"), 100);
        const status = normalizeProductStatus(cellAt(item.row, indexes, "status"));
        const compareEnabled = parseCompareEnabled(
          cellAt(item.row, indexes, "compare_enabled")
        );

        const importedSpecs: ImportSpec[] = [];
        for (let position = 0; position < specColumns.length; position += 1) {
          const column = specColumns[position];
          const value = sanitizeText(item.row[column.index] ?? "", 1000);
          if (!value) continue;

          const definition = definitionsByKey.get(column.key);
          importedSpecs.push({
            key: column.key,
            label: sanitizeText(definition?.label ?? column.label, 191) ?? column.key,
            value,
            unit: sanitizeText(definition?.unit ?? column.unit ?? "", 50),
            sortOrder: Number(definition?.sort_order ?? position),
            isComparable: Number(definition?.is_comparable ?? 1) === 1 ? 1 : 0,
            isHighlight: Number(definition?.is_highlight ?? 0) === 1 ? 1 : 0,
          });
        }

        const thumbnailSource = cellAt(item.row, indexes, "thumbnail_url");
        const imageSources = parseImageSources(cellAt(item.row, indexes, "image_urls"));
        let materialized: Awaited<ReturnType<typeof materializeImages>> = {
          images: [],
          createdFiles: [],
          downloaded: 0,
        };

        if (hasImageColumns) {
          materialized = await materializeImages(imageSources, thumbnailSource);
          createdFiles = materialized.createdFiles;
        }

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          const [existingRows] = await connection.query<(RowDataPacket & { id: number })[]>(
            "SELECT id FROM products WHERE slug = ? LIMIT 1 FOR UPDATE",
            [slug]
          );
          const existingId = existingRows[0]?.id;
          const now = new Date();
          let productId: number;

          if (existingId) {
            productId = Number(existingId);
            await connection.query(
              `
                UPDATE products
                SET name = ?, brand_id = ?, category_id = ?, short_desc = ?, content = ?,
                    price_min = ?, price_max = ?, status_ = ?, segment_label = ?,
                    spec_group_id = ?, compare_enabled = ?, seo_title = ?,
                    seo_description = ?, update_time = ?
                WHERE id = ?
              `,
              [
                name,
                brandId,
                categoryId,
                shortDesc,
                content,
                priceMin,
                priceMax,
                status,
                segmentLabel,
                groupId,
                compareEnabled,
                name.slice(0, 191),
                shortDesc?.slice(0, 300) ?? null,
                now,
                productId,
              ]
            );
          } else {
            const [result] = await connection.query<ResultSetHeader>(
              `
                INSERT INTO products
                  (name, slug, brand_id, category_id, tag_id, short_desc, content,
                   price_min, price_max, status_, segment_label, spec_group_id,
                   compare_enabled, seo_title, seo_description, created_time, update_time)
                VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                name,
                slug,
                brandId,
                categoryId,
                shortDesc,
                content,
                priceMin,
                priceMax,
                status,
                segmentLabel,
                groupId,
                compareEnabled,
                name.slice(0, 191),
                shortDesc?.slice(0, 300) ?? null,
                now,
                now,
              ]
            );
            productId = result.insertId;
          }

          if (hasImageColumns) {
            await replaceImportedImages(connection, productId, materialized.images);
          }
          if (specColumns.length) {
            await replaceImportedSpecs(connection, productId, groupId, importedSpecs);
          }

          await connection.commit();
          downloadedImages += materialized.downloaded;
          if (existingId) updated += 1;
          else created += 1;
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        await removeFiles(createdFiles);
        if (errors.length < MAX_ERROR_DETAILS) {
          errors.push({ row: item.number, message: rowErrorMessage(error) });
        }
      }
    }

    return NextResponse.json({
      result: {
        total: dataRows.length,
        created,
        updated,
        failed: dataRows.length - created - updated,
        downloadedImages,
        errors,
      },
    });
  } catch (error) {
    if (error instanceof RowImportError) return badRequest(error.message);

    return serverErrorResponse(
      "Product CSV import error",
      error,
      "Không thể nhập danh sách sản phẩm."
    );
  }
}
