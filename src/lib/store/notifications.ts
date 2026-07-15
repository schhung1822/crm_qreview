// Thông báo trong app theo biz - lưu .data/biz/<bizId>/notifications.json. Server-only.
// Lưu TYPE + tham số (articleId/title/actor) thay vì chuỗi dịch sẵn → client tự render đa ngôn ngữ.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export type NotifType = 'assigned' | 'reviewRequested' | 'approved' | 'rejected';

export interface Notif {
  id: string;
  type: NotifType;
  articleId?: string;
  articleTitle?: string;
  actorName?: string; // người gây ra sự kiện (người giao/gửi/duyệt)
  note?: string; // ghi chú kèm (vd lý do trả lại)
  createdAt: string;
  read: boolean;
}

type Store = Record<string, Notif[]>; // userId → danh sách thông báo (mới nhất trước)

const NAME = 'notifications.json';
const MAX_PER_USER = 50; // giữ gọn, cắt bớt cũ

// Thêm 1 thông báo cho 1 user. Bỏ qua nếu userId rỗng hoặc trùng chính actor (không tự báo mình).
export async function addNotif(
  userId: string,
  input: Omit<Notif, 'id' | 'createdAt' | 'read'>,
): Promise<void> {
  if (!userId) return;
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
    const list = cur[userId] ?? [];
    list.unshift({
      ...input,
      id: 'ntf_' + randomBytes(6).toString('hex'),
      createdAt: new Date().toISOString(),
      read: false,
    });
    cur[userId] = list.slice(0, MAX_PER_USER);
    return [cur, undefined];
  });
}

// Thêm cùng 1 thông báo cho nhiều user (vd báo tất cả người có quyền duyệt).
export async function addNotifMany(
  userIds: string[],
  input: Omit<Notif, 'id' | 'createdAt' | 'read'>,
): Promise<void> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  for (const uid of uniq) await addNotif(uid, input);
}

export async function listNotifs(userId: string): Promise<Notif[]> {
  const store = await readJson<Store>(bizFile(NAME), {});
  return store[userId] ?? [];
}

// Đánh dấu đã đọc: 1 thông báo (notifId) hoặc TẤT CẢ (notifId undefined).
export async function markRead(userId: string, notifId?: string): Promise<void> {
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
    const list = cur[userId] ?? [];
    for (const n of list) if (!notifId || n.id === notifId) n.read = true;
    cur[userId] = list;
    return [cur, undefined];
  });
}
