// Thống kê EMAIL đã gửi (toàn cục .data/email-stats.json). Đếm tổng + theo loại sự kiện + theo ngày.
// Ghi tại chokepoint sendPlatformEvent khi gửi THÀNH CÔNG. Server-only.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

interface Data {
  total: number;
  byEvent: Record<string, number>;
  byDay: Record<string, number>; // YYYY-MM-DD → số email gửi trong ngày
}

const FILE = globalFile('email-stats.json');
const MAX_DAYS = 400; // giữ tối đa ~400 ngày gần nhất để file không phình
const today = () => new Date().toISOString().slice(0, 10);

// Ghi nhận 1 email đã gửi thành công. Không ném lỗi (không làm hỏng luồng gửi).
export async function recordEmailSent(event: string): Promise<void> {
  await mutateJson<Data, void>(FILE, { total: 0, byEvent: {}, byDay: {} }, (d) => {
    d.total = (d.total ?? 0) + 1;
    d.byEvent = { ...(d.byEvent ?? {}), [event]: (d.byEvent?.[event] ?? 0) + 1 };
    const day = today();
    d.byDay = { ...(d.byDay ?? {}), [day]: (d.byDay?.[day] ?? 0) + 1 };
    // Cắt bớt ngày cũ nếu vượt ngưỡng.
    const days = Object.keys(d.byDay).sort();
    if (days.length > MAX_DAYS) {
      for (const k of days.slice(0, days.length - MAX_DAYS)) delete d.byDay[k];
    }
    return [d, undefined];
  }).catch(() => {
    /* thống kê lỗi không ảnh hưởng gửi email */
  });
}

// Dữ liệu thô (total + byEvent + byDay) để lớp trên tự dựng chuỗi theo dải ngày tùy ý.
export async function getEmailStatsRaw(): Promise<{ total: number; byEvent: Record<string, number>; byDay: Record<string, number> }> {
  const d = await readJson<Data>(FILE, { total: 0, byEvent: {}, byDay: {} });
  return { total: d.total ?? 0, byEvent: d.byEvent ?? {}, byDay: d.byDay ?? {} };
}

export interface EmailStats {
  total: number;
  byEvent: Record<string, number>;
  series: Array<{ date: string; count: number }>; // theo ngày trong khoảng yêu cầu (lấp ngày trống = 0)
}

// Đọc thống kê. `days` = số ngày gần nhất cho chuỗi thời gian (mặc định 30).
export async function getEmailStats(days = 30): Promise<EmailStats> {
  const d = await readJson<Data>(FILE, { total: 0, byEvent: {}, byDay: {} });
  const n = Math.max(1, Math.min(days, MAX_DAYS));
  const series: Array<{ date: string; count: number }> = [];
  const start = Date.now() - (n - 1) * 86_400_000;
  for (let i = 0; i < n; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    series.push({ date, count: d.byDay?.[date] ?? 0 });
  }
  return { total: d.total ?? 0, byEvent: d.byEvent ?? {}, series };
}
