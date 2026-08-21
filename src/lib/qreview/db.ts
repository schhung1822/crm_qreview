import mysql, { Pool, RowDataPacket } from "mysql2/promise";

/**
 * Ket noi toi CSDL cua WEBSITE Qreview — KHAC voi CSDL cua CRM.
 *
 * CRM dung Prisma tro vao `crm_qreview` (bien DATABASE_URL). Khu quan tri
 * website lam viec tren mot CSDL rieng (`qreview`) nam cung may chu, nen phai
 * co bo bien moi truong rieng: QREVIEW_DB_*. Dung chung DB_* se khien truy van
 * cua khu quan tri ban ra CSDL CRM.
 *
 * Toan bo SQL cua khu quan tri duoc giu nguyen tu du an Qreview, vi vay lop
 * ket noi nay cung giu nguyen hanh vi (ke ca collation).
 */

const dbPassword = process.env.QREVIEW_DB_PASSWORD ?? process.env.QREVIEW_DB_PASS;

let pool: Pool | null = null;

export function ensureDatabaseConfig() {
  if (!dbPassword) {
    throw new Error(
      "Thieu mat khau CSDL website Qreview. Kiem tra QREVIEW_DB_PASSWORD trong .env"
    );
  }
}

export function getDbPool() {
  ensureDatabaseConfig();

  if (!pool) {
    pool = mysql.createPool({
      host: process.env.QREVIEW_DB_HOST,
      port: Number(process.env.QREVIEW_DB_PORT ?? 3306),
      user: process.env.QREVIEW_DB_USER,
      password: dbPassword,
      database: process.env.QREVIEW_DB_NAME,
      connectionLimit: 10,

      /**
       * Phai khop collation cua CSDL (utf8mb4_0900_ai_ci — mac dinh cua MySQL 8).
       *
       * mysql2 mac dinh dung utf8mb4_general_ci/utf8mb4_unicode_ci cho ket noi.
       * Khi do bieu thuc nhu `CAST(p.id AS CHAR)` mang collation cua KET NOI,
       * con cot TEXT trong bang mang collation cua BANG — so sanh hai cai do
       * lam MySQL bao loi "Illegal mix of collations" va lam hong ca truy van.
       *
       * Doi CSDL sang collation khac thi phai doi gia tri nay theo.
       */
      charset: "utf8mb4_0900_ai_ci",
    });
  }

  return pool;
}

export async function queryRows<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = []
) {
  const [rows] = await getDbPool().query<T[]>(sql, params);
  return rows;
}

// Kiem soat quyen vao khu quan tri nam o `src/lib/qreview/guard.ts` — dung
// phien dang nhap CUA CRM chu khong phai phien cua website Qreview.

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeTextValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function normalizeNumericValue(value: unknown, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function asStringId(value: unknown) {
  return String(value ?? "").trim();
}

export function toIsoDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type ProductIdentifierRow = RowDataPacket & {
  id: number | string;
  slug?: string | null;
  name?: string | null;
};

export async function resolveProductId(productIdentifier: unknown) {
  const rawIdentifier = asStringId(productIdentifier);

  if (!rawIdentifier) {
    throw new Error("Missing product identifier.");
  }

  if (/^\d+$/.test(rawIdentifier)) {
    return rawIdentifier;
  }

  const normalizedIdentifier = normalizeSlug(rawIdentifier);

  const exactRows = await queryRows<ProductIdentifierRow>(
    `
      SELECT id, slug, name
      FROM products
      WHERE LOWER(TRIM(slug)) = LOWER(?)
      LIMIT 1
    `,
    [normalizedIdentifier]
  );

  if (exactRows[0]?.id !== undefined && exactRows[0]?.id !== null) {
    return asStringId(exactRows[0].id);
  }

  const searchPattern = `%${normalizedIdentifier.replace(/-/g, "%")}%`;
  const candidateRows = await queryRows<ProductIdentifierRow>(
    `
      SELECT id, slug, name
      FROM products
      WHERE LOWER(COALESCE(slug, '')) LIKE ?
         OR LOWER(COALESCE(name, '')) LIKE ?
      LIMIT 50
    `,
    [searchPattern, searchPattern]
  );

  const matchedRow =
    candidateRows.find(
      (row) =>
        normalizeSlug(String(row.slug ?? row.name ?? "")) === normalizedIdentifier
    ) ?? candidateRows[0];

  if (matchedRow?.id !== undefined && matchedRow?.id !== null) {
    return asStringId(matchedRow.id);
  }

  throw new Error(`Product not found for identifier: ${rawIdentifier}`);
}
