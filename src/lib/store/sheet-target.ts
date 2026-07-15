// Đích Google Sheet của biz hiện tại (spreadsheet + tab để đăng bài). Lưu .data/biz/<bizId>/sheet-target.json.
// Không nhạy cảm (chỉ id/url/tab); xác thực dùng OAuth Drive (đã mã hoá riêng). Server-only, cô lập theo biz.
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface SheetTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  tab: string; // tên trang tính (tab)
  connectedAt: string;
}

const NAME = 'sheet-target.json';
export const DEFAULT_TAB = 'Articles';

export async function getSheetTarget(): Promise<SheetTarget | null> {
  const d = await readJson<Partial<SheetTarget>>(bizFile(NAME), {});
  if (!d.spreadsheetId) return null;
  return {
    spreadsheetId: d.spreadsheetId,
    spreadsheetUrl: d.spreadsheetUrl ?? '',
    tab: d.tab || DEFAULT_TAB,
    connectedAt: d.connectedAt ?? '',
  };
}

export async function saveSheetTarget(t: { spreadsheetId: string; spreadsheetUrl: string; tab: string }): Promise<SheetTarget> {
  return mutateJson<Partial<SheetTarget>, SheetTarget>(bizFile(NAME), {}, () => {
    const next: SheetTarget = {
      spreadsheetId: t.spreadsheetId,
      spreadsheetUrl: t.spreadsheetUrl,
      tab: t.tab || DEFAULT_TAB,
      connectedAt: new Date().toISOString(),
    };
    return [next, next];
  });
}

export async function clearSheetTarget(): Promise<void> {
  await mutateJson<Partial<SheetTarget>, void>(bizFile(NAME), {}, () => [{}, undefined]);
}
