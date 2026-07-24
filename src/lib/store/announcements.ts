// Thanh THÔNG BÁO CHẠY ở header (marquee). Cấu hình toàn cục - .data/announcements.json.
// Nội dung do superadmin soạn (không dịch), chạy lặp liên tục, tốc độ + link nhúng chỉnh được.
// Nội dung công khai (mọi user đăng nhập đều thấy) nên KHÔNG mã hóa. Server-only.
import { randomBytes } from 'node:crypto';
import { mutateGlobalConfig, readGlobalConfig } from '../data/config-store';

export interface AnnouncementItem {
  id: string;
  text: string;
  url?: string; // http(s)://… mở tab mới; /duong-dan nội bộ same-tab. Rỗng = không phải link.
  enabled: boolean;
}
export interface AnnouncementConfig {
  enabled: boolean; // bật/tắt cả thanh
  speed: number; // px/giây - tốc độ trượt (cao = nhanh)
  items: AnnouncementItem[];
}

const FILE = 'announcements.json';
const DEFAULT: AnnouncementConfig = { enabled: false, speed: 60, items: [] };

function clampSpeed(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT.speed;
  return Math.min(300, Math.max(10, v));
}

// Chuẩn hóa 1 mục: cắt độ dài, chỉ giữ url http(s) tuyệt đối hoặc đường dẫn nội bộ "/…".
function normItem(raw: Partial<AnnouncementItem>): AnnouncementItem {
  const text = String(raw.text ?? '').trim().slice(0, 300);
  let url = String(raw.url ?? '').trim().slice(0, 500);
  if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) url = '';
  return {
    id: (raw.id && String(raw.id).slice(0, 40)) || randomBytes(8).toString('hex'),
    text,
    ...(url ? { url } : {}),
    enabled: raw.enabled !== false,
  };
}

// Cấu hình đầy đủ cho admin sửa.
export async function readAnnouncements(): Promise<AnnouncementConfig> {
  const d = await readGlobalConfig<Partial<AnnouncementConfig>>(FILE, DEFAULT);
  return {
    enabled: d.enabled === true,
    speed: clampSpeed(d.speed),
    items: Array.isArray(d.items) ? d.items.map(normItem) : [],
  };
}

// Bản công khai cho thanh chạy: chỉ trả mục đang bật + text không rỗng (đỡ dữ liệu thừa).
export async function readAnnouncementsPublic(): Promise<AnnouncementConfig> {
  const d = await readAnnouncements();
  if (!d.enabled) return { enabled: false, speed: d.speed, items: [] };
  return { enabled: true, speed: d.speed, items: d.items.filter((i) => i.enabled && i.text) };
}

// Đầu vào lưu: item có thể thiếu id (server tự sinh trong normItem).
export interface AnnouncementPatch {
  enabled?: boolean;
  speed?: number;
  items?: Array<Partial<AnnouncementItem>>;
}

// Lưu toàn bộ cấu hình (admin gửi cả danh sách). Chuẩn hóa lại trước khi ghi.
export async function saveAnnouncements(patch: AnnouncementPatch): Promise<AnnouncementConfig> {
  return mutateGlobalConfig<Partial<AnnouncementConfig>, AnnouncementConfig>(FILE, DEFAULT, (cur) => {
    const next: AnnouncementConfig = {
      enabled: patch.enabled !== undefined ? patch.enabled === true : cur.enabled === true,
      speed: patch.speed !== undefined ? clampSpeed(patch.speed) : clampSpeed(cur.speed),
      items: Array.isArray(patch.items)
        ? patch.items.slice(0, 30).map(normItem)
        : Array.isArray(cur.items)
          ? cur.items.map(normItem)
          : [],
    };
    return [next, next];
  });
}
