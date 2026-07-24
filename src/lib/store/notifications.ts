import { randomBytes } from 'node:crypto';
import { activeBizId, bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';

export type NotifType = 'assigned' | 'reviewRequested' | 'approved' | 'rejected';
export interface Notif { id: string; type: NotifType; articleId?: string; articleTitle?: string; actorName?: string; note?: string; createdAt: string; read: boolean; }
type Store = Record<string, Notif[]>;
const NAME = 'notifications.json';
const MAX_PER_USER = 50;
const isDb = () => storageDriver() === 'prisma';
const biz = () => { const id = activeBizId(); if (!id) throw new Error('Missing active biz context.'); return id; };
const out = (r: { id: string; type: string; articleId?: string | null; articleTitle?: string | null; actorName?: string | null; note?: string | null; createdAt: Date; read: boolean }): Notif => ({ id: r.id, type: r.type as NotifType, articleId: r.articleId ?? undefined, articleTitle: r.articleTitle ?? undefined, actorName: r.actorName ?? undefined, note: r.note ?? undefined, createdAt: r.createdAt.toISOString(), read: r.read });

export async function addNotif(userId: string, input: Omit<Notif, 'id' | 'createdAt' | 'read'>): Promise<void> {
  if (!userId) return;
  if (isDb()) { await prisma.notification.create({ data: { id: 'ntf_' + randomBytes(6).toString('hex'), bizId: biz(), userId, type: input.type, articleId: input.articleId ?? null, articleTitle: input.articleTitle ?? null, actorName: input.actorName ?? null, note: input.note ?? null, read: false } }); return; }
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => { const list = cur[userId] ?? []; list.unshift({ ...input, id: 'ntf_' + randomBytes(6).toString('hex'), createdAt: new Date().toISOString(), read: false }); cur[userId] = list.slice(0, MAX_PER_USER); return [cur, undefined]; });
}

export async function addNotifMany(userIds: string[], input: Omit<Notif, 'id' | 'createdAt' | 'read'>): Promise<void> { for (const uid of [...new Set(userIds.filter(Boolean))]) await addNotif(uid, input); }

export async function listNotifs(userId: string): Promise<Notif[]> {
  if (isDb()) return (await prisma.notification.findMany({ where: { bizId: biz(), userId }, orderBy: { createdAt: 'desc' }, take: MAX_PER_USER })).map(out);
  const store = await readJson<Store>(bizFile(NAME), {});
  return store[userId] ?? [];
}

export async function markRead(userId: string, notifId?: string): Promise<void> {
  if (isDb()) { await prisma.notification.updateMany({ where: { bizId: biz(), userId, ...(notifId ? { id: notifId } : {}) }, data: { read: true } }); return; }
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => { const list = cur[userId] ?? []; for (const n of list) if (!notifId || n.id === notifId) n.read = true; cur[userId] = list; return [cur, undefined]; });
}
