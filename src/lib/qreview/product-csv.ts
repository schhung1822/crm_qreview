/**
 * CSV helpers used by the product import/export route.
 *
 * Kept dependency-free so the format stays predictable and supports quoted
 * commas, quotes and line breaks (product content often contains all three).
 */

const DANGEROUS_SPREADSHEET_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export type ProductCsvSpecColumn = {
  key: string;
  label: string;
  unit: string | null;
};

export const PRODUCT_CSV_COLUMNS = [
  "name",
  "slug",
  "category_id",
  "category_name",
  "brand_id",
  "brand_name",
  "short_desc",
  "content",
  "price_min",
  "price_max",
  "status",
  "segment_label",
  "compare_enabled",
  "thumbnail_url",
  "image_urls",
] as const;

/** A stable machine key plus a readable label/unit for spreadsheet users. */
export function makeSpecColumn(column: ProductCsvSpecColumn) {
  const clean = (value: string) => value.replaceAll("|", "/").trim();
  return `spec:${clean(column.key)}|${clean(column.label)}|${clean(column.unit ?? "")}`;
}

export function parseSpecColumn(header: string): ProductCsvSpecColumn | null {
  if (!header.toLowerCase().startsWith("spec:")) return null;

  const [rawKey, rawLabel, rawUnit] = header.slice(5).split("|");
  const key = rawKey?.trim();
  if (!key) return null;

  return {
    key,
    label: rawLabel?.trim() || key,
    unit: rawUnit?.trim() || null,
  };
}

/**
 * Excel/Sheets can execute cells beginning with =, +, - or @ as formulas.
 * Prefixing an apostrophe makes exports safe; import removes only the prefix
 * added by this function so a CSV round trip remains lossless.
 */
export function protectSpreadsheetCell(value: unknown) {
  const text = String(value ?? "");
  return DANGEROUS_SPREADSHEET_PREFIX.test(text) ||
    (text.startsWith("'") && DANGEROUS_SPREADSHEET_PREFIX.test(text.slice(1)))
    ? `'${text}`
    : text;
}

export function restoreSpreadsheetCell(value: string) {
  if (
    value.startsWith("''") &&
    DANGEROUS_SPREADSHEET_PREFIX.test(value.slice(2))
  ) {
    return value.slice(1);
  }

  return value.startsWith("'") && DANGEROUS_SPREADSHEET_PREFIX.test(value.slice(1))
    ? value.slice(1)
    : value;
}

function encodeCell(value: unknown) {
  const text = protectSpreadsheetCell(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n");
}

/** RFC 4180-style parser with support for BOM, CRLF and multiline fields. */
export function parseCsv(input: string) {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(restoreSpreadsheetCell(cell));
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      if (source[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV có ô chưa đóng dấu ngoặc kép.");
  }

  if (cell.length || row.length) pushRow();

  // Spreadsheet applications often append one or more completely empty rows.
  while (rows.length && rows[rows.length - 1].every((value) => !value.trim())) {
    rows.pop();
  }

  return rows;
}

export function parseImageSources(value: string) {
  const text = value.trim();
  if (!text) return [] as string[];

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall back to the human-editable newline/pipe format below.
    }
  }

  return text
    .split(/\r?\n|\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}
