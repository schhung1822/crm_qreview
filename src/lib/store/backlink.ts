// Kho BACKLINK theo biz: giữ 1 bản quét MỚI NHẤT (.data/biz/<id>/backlink.json). Bền qua reload:
// UI poll GET để hiện tiến độ + khôi phục sau khi đóng tab. Server-only.
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import type { BacklinkScan, BacklinkSuggestion, SuggestionStatus } from '../backlink/types';

const NAME = 'backlink.json';
// Bản quét 'running' quá lâu (tiến trình chết giữa chừng) → coi là hỏng để UI cho quét lại.
export const STALE_SCAN_MS = 10 * 60 * 1000;

export async function getScan(): Promise<BacklinkScan | null> {
  return readJson<BacklinkScan | null>(bizFile(NAME), null);
}

// Ghi đè toàn bộ bản quét (bắt đầu quét mới = thay bản cũ).
export async function setScan(scan: BacklinkScan): Promise<void> {
  await mutateJson<BacklinkScan | null, void>(bizFile(NAME), null, () => [scan, undefined]);
}

// Vá bản quét hiện tại (cập nhật tiến độ/kết quả). Chỉ vá đúng scan theo id để không đè bản mới hơn.
export async function patchScan(id: string, patch: Partial<BacklinkScan>): Promise<void> {
  await mutateJson<BacklinkScan | null, void>(bizFile(NAME), null, (cur) => {
    if (!cur || cur.id !== id) return [cur, undefined];
    return [{ ...cur, ...patch, updatedAt: new Date().toISOString() }, undefined];
  });
}

// Cập nhật trạng thái 1 đề xuất (áp dụng/từ chối) trong bản quét hiện tại.
export async function updateSuggestion(
  scanId: string,
  suggestionId: string,
  patch: Partial<Pick<BacklinkSuggestion, 'status' | 'appliedAt' | 'error' | 'anchorA' | 'anchorB'>>,
): Promise<void> {
  await mutateJson<BacklinkScan | null, void>(bizFile(NAME), null, (cur) => {
    if (!cur || cur.id !== scanId) return [cur, undefined];
    const suggestions = cur.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, ...patch } : s,
    );
    return [{ ...cur, suggestions, updatedAt: new Date().toISOString() }, undefined];
  });
}

// Đặt hàng loạt trạng thái (dùng khi áp dụng theo lô).
export async function setSuggestionStatuses(
  scanId: string,
  updates: Array<{ id: string; status: SuggestionStatus; appliedAt?: string; error?: string }>,
): Promise<void> {
  const byId = new Map(updates.map((u) => [u.id, u]));
  await mutateJson<BacklinkScan | null, void>(bizFile(NAME), null, (cur) => {
    if (!cur || cur.id !== scanId) return [cur, undefined];
    const suggestions = cur.suggestions.map((s) => {
      const u = byId.get(s.id);
      return u ? { ...s, status: u.status, appliedAt: u.appliedAt, error: u.error } : s;
    });
    return [{ ...cur, suggestions, updatedAt: new Date().toISOString() }, undefined];
  });
}
