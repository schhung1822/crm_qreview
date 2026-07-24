// Đích Google Sheet của biz hiện tại (spreadsheet + tab để đăng bài). Lưu .data/biz/<bizId>/sheet-target.json.
// Không nhạy cảm (chỉ id/url/tab); xác thực dùng OAuth Drive (đã mã hoá riêng). Server-only, cô lập theo biz.
import { mutateBizConfig, readBizConfig } from '../data/config-store';

export interface SheetTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  tab: string; // tên trang tính (tab)
  connectedAt: string;
}

const NAME = 'sheet-target.json';
export const DEFAULT_TAB = 'Articles';

export async function getSheetTarget(): Promise<SheetTarget | null> {
  const d = await readBizConfig<Partial<SheetTarget>>(NAME, {});
  if (!d.spreadsheetId) return null;
  return {
    spreadsheetId: d.spreadsheetId,
    spreadsheetUrl: d.spreadsheetUrl ?? '',
    tab: d.tab || DEFAULT_TAB,
    connectedAt: d.connectedAt ?? '',
  };
}

export async function saveSheetTarget(t: { spreadsheetId: string; spreadsheetUrl: string; tab: string }): Promise<SheetTarget> {
  return mutateBizConfig<Partial<SheetTarget>, SheetTarget>(NAME, {}, () => {
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
  await mutateBizConfig<Partial<SheetTarget>, void>(NAME, {}, () => [{}, undefined]);
}
