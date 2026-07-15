import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/current';
import { getDriveState } from '@/lib/store/drive';
import { SHEET_HEADERS } from '@/lib/sheets/columns';
import {
  createSpreadsheet,
  ensureHeader,
  ensureTab,
  getSheetsToken,
  getSpreadsheetMeta,
  parseSpreadsheetId,
  SheetsError,
} from '@/lib/sheets/client';
import { clearSheetTarget, DEFAULT_TAB, getSheetTarget, saveSheetTarget } from '@/lib/store/sheet-target';

export const dynamic = 'force-dynamic';

// Ánh xạ lỗi Sheets → {code} để client hiện thông báo i18n phù hợp.
function sheetsError(e: unknown): NextResponse {
  if (e instanceof SheetsError) {
    const status = e.code === 'drive-not-connected' ? 400 : e.code === 'forbidden' ? 403 : e.code === 'not-found' ? 404 : 502;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown', code: 'api' }, { status: 502 });
}

// GET → trạng thái Drive + đích Sheet hiện tại + danh sách cột cố định (để hiển thị).
export async function GET() {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const [drive, target] = await Promise.all([getDriveState(), getSheetTarget()]);
  return NextResponse.json({
    driveConnected: drive.connected,
    driveConfigured: drive.configured,
    driveEmail: drive.email,
    target,
    columns: SHEET_HEADERS,
  });
}

const Schema = z.object({
  mode: z.enum(['create', 'existing']),
  title: z.string().max(120).optional(), // tên spreadsheet khi tạo mới
  spreadsheet: z.string().max(500).optional(), // id hoặc URL khi dùng sheet có sẵn
  tab: z.string().max(80).optional(),
});

// POST → tạo spreadsheet mới HOẶC trỏ vào spreadsheet có sẵn (đảm bảo tab + header cố định).
export async function POST(req: Request) {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tham số không hợp lệ', code: 'invalid' }, { status: 400 });
  const { mode, title, spreadsheet } = parsed.data;
  const tab = (parsed.data.tab ?? '').trim() || DEFAULT_TAB;

  try {
    const token = await getSheetsToken();
    if (mode === 'create') {
      const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(token, (title ?? '').trim() || 'SEO-GEO Articles', tab);
      const saved = await saveSheetTarget({ spreadsheetId, spreadsheetUrl, tab });
      return NextResponse.json({ ok: true, target: saved });
    }
    // existing
    if (!spreadsheet?.trim()) return NextResponse.json({ error: 'Thiếu link/ID Google Sheet', code: 'invalid' }, { status: 400 });
    const id = parseSpreadsheetId(spreadsheet);
    const meta = await getSpreadsheetMeta(token, id); // xác thực tồn tại + lấy URL
    await ensureTab(token, id, tab);
    await ensureHeader(token, id, tab);
    const saved = await saveSheetTarget({ spreadsheetId: id, spreadsheetUrl: meta.spreadsheetUrl, tab });
    return NextResponse.json({ ok: true, target: saved });
  } catch (e) {
    return sheetsError(e);
  }
}

// DELETE → bỏ đích Sheet đã lưu.
export async function DELETE() {
  const g = await guard('content:publish');
  if ('response' in g) return g.response;
  await clearSheetTarget();
  return NextResponse.json({ ok: true });
}
