// Google Sheets API v4 client (raw fetch). Tái dùng OAuth Google Drive (token per-biz) — không thêm
// package. Server-only. Dùng để ĐĂNG BÀI vào Google Sheet: header cố định + upsert dòng theo slug.
import { refreshAccessToken } from '../drive/client';
import { getDriveCreds, getRefreshToken } from '../store/drive';
import { SHEET_HEADERS, SHEET_LAST_COL } from './columns';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TIMEOUT_MS = 20_000;

// Lỗi có mã để route dịch sang thông báo phù hợp (chưa kết nối / thiếu quyền Sheets...).
export class SheetsError extends Error {
  code: 'drive-not-connected' | 'forbidden' | 'not-found' | 'api';
  constructor(code: SheetsError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function sfetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await sfetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 403) throw new SheetsError('forbidden', 'Thiếu quyền Google Sheets — hãy kết nối lại Google Drive.');
  if (res.status === 404) throw new SheetsError('not-found', 'Không tìm thấy Google Sheet.');
  if (!res.ok) throw new SheetsError('api', `Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// Lấy access token từ kết nối Drive của biz hiện tại. Chưa kết nối → SheetsError('drive-not-connected').
export async function getSheetsToken(): Promise<string> {
  const creds = await getDriveCreds();
  if (creds.source === 'none') throw new SheetsError('drive-not-connected', 'Chưa cấu hình Google Drive.');
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new SheetsError('drive-not-connected', 'Chưa kết nối Google Drive.');
  try {
    return await refreshAccessToken(creds, refreshToken);
  } catch (e) {
    throw new SheetsError('drive-not-connected', e instanceof Error ? e.message : 'refresh failed');
  }
}

// Tách spreadsheetId từ URL đầy đủ hoặc trả nguyên nếu đã là id.
export function parseSpreadsheetId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

// A1 range với tên tab được escape (bọc nháy đơn, nhân đôi nháy trong tên).
function range(tab: string, a1: string): string {
  return `'${tab.replace(/'/g, "''")}'!${a1}`;
}
function enc(r: string): string {
  return encodeURIComponent(r);
}

interface SheetMeta {
  spreadsheetId: string;
  spreadsheetUrl: string;
  tabs: string[];
}
export async function getSpreadsheetMeta(token: string, spreadsheetId: string): Promise<SheetMeta> {
  const d = await call<{ spreadsheetId: string; spreadsheetUrl: string; sheets?: Array<{ properties?: { title?: string } }> }>(
    token,
    `${SHEETS_API}/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,sheets(properties(title))`,
  );
  return {
    spreadsheetId: d.spreadsheetId,
    spreadsheetUrl: d.spreadsheetUrl,
    tabs: (d.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean),
  };
}

// Tạo spreadsheet mới với 1 tab tên `tab` + ghi sẵn header cố định.
export async function createSpreadsheet(
  token: string,
  title: string,
  tab: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const d = await call<{ spreadsheetId: string; spreadsheetUrl: string }>(token, SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: tab } }] }),
  });
  await writeHeader(token, d.spreadsheetId, tab);
  return { spreadsheetId: d.spreadsheetId, spreadsheetUrl: d.spreadsheetUrl };
}

// Thêm tab nếu chưa có (dùng khi trỏ vào spreadsheet có sẵn).
export async function ensureTab(token: string, spreadsheetId: string, tab: string): Promise<void> {
  const meta = await getSpreadsheetMeta(token, spreadsheetId);
  if (meta.tabs.includes(tab)) return;
  await call(token, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
  });
}

function writeHeader(token: string, spreadsheetId: string, tab: string): Promise<unknown> {
  return call(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${enc(range(tab, `A1:${SHEET_LAST_COL}1`))}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [SHEET_HEADERS] }) },
  );
}

// Đảm bảo dòng tiêu đề đúng cột cố định (ghi lại nếu trống/khác).
export async function ensureHeader(token: string, spreadsheetId: string, tab: string): Promise<void> {
  const d = await call<{ values?: string[][] }>(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${enc(range(tab, `A1:${SHEET_LAST_COL}1`))}`,
  );
  const cur = d.values?.[0] ?? [];
  const same = cur.length === SHEET_HEADERS.length && SHEET_HEADERS.every((h, i) => cur[i] === h);
  if (!same) await writeHeader(token, spreadsheetId, tab);
}

// Upsert theo slug (cột A). Trả 'created' | 'updated'.
export async function upsertRow(
  token: string,
  spreadsheetId: string,
  tab: string,
  slug: string,
  row: string[],
): Promise<'created' | 'updated'> {
  // Đọc cột khoá A2:A → tìm dòng trùng slug.
  const d = await call<{ values?: string[][] }>(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${enc(range(tab, 'A2:A'))}?majorDimension=COLUMNS`,
  );
  const keys = d.values?.[0] ?? [];
  const idx = keys.findIndex((k) => k === slug);
  if (idx >= 0) {
    const rowNum = idx + 2; // A2 là dòng dữ liệu đầu tiên
    await call(
      token,
      `${SHEETS_API}/${spreadsheetId}/values/${enc(range(tab, `A${rowNum}:${SHEET_LAST_COL}${rowNum}`))}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [row] }) },
    );
    return 'updated';
  }
  await call(
    token,
    `${SHEETS_API}/${spreadsheetId}/values/${enc(range(tab, 'A1'))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );
  return 'created';
}
