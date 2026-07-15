// Bộ đếm LƯỢT TẠO Báo cáo Social theo THÁNG, gộp theo CHỦ TÀI KHOẢN (owner của biz) -
// giống cách quota token gộp qua các biz owner sở hữu, tránh lách hạn mức bằng cách tạo
// nhiều biz. Store GLOBAL (không theo biz): .data/social-report-usage.json.
// Đếm ở thời điểm TẠO báo cáo (xóa báo cáo không hoàn lại lượt - chi phí thu thập đã tốn).
// Server-only.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

const FILE = globalFile('social-report-usage.json');

// key = `${ownerId}|${YYYY-MM}` → số lượt đã tạo trong tháng đó.
type UsageStore = Record<string, number>;

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function getSocialReportsUsedThisMonth(ownerId: string): Promise<number> {
  const store = await readJson<UsageStore>(FILE, {});
  return store[`${ownerId}|${monthKey()}`] ?? 0;
}

export async function incrSocialReportsUsed(ownerId: string): Promise<void> {
  await mutateJson<UsageStore, void>(FILE, {}, (store) => {
    const key = `${ownerId}|${monthKey()}`;
    store[key] = (store[key] ?? 0) + 1;
    // Dọn key của các tháng cũ (>3 tháng) để file không phình vô hạn.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const min = cutoff.toISOString().slice(0, 7);
    for (const k of Object.keys(store)) {
      const m = k.split('|')[1];
      if (m && m < min) delete store[k];
    }
    return [store, undefined];
  });
}
