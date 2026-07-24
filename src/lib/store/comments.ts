import { randomBytes } from 'node:crypto';
import { activeBizId, bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { storageDriver } from '../data/repos';
import { prisma } from '../prisma';

export interface Comment { id: string; articleId: string; userId: string; userName: string; body: string; createdAt: string; }
type Store = Record<string, Comment[]>;
const NAME = 'comments.json';
const MAX_LEN = 4000;
const isDb = () => storageDriver() === 'prisma';
const biz = () => { const id = activeBizId(); if (!id) throw new Error('Missing active biz context.'); return id; };
const out = (r: { id: string; articleId: string; userId: string; userName: string; body: string; createdAt: Date }): Comment => ({ ...r, createdAt: r.createdAt.toISOString() });

export async function listComments(articleId: string): Promise<Comment[]> {
  if (isDb()) return (await prisma.comment.findMany({ where: { bizId: biz(), articleId }, orderBy: { createdAt: 'asc' } })).map(out);
  const store = await readJson<Store>(bizFile(NAME), {});
  return store[articleId] ?? [];
}

export async function addComment(input: { articleId: string; userId: string; userName: string; body: string; }): Promise<Comment> {
  const comment: Comment = { id: 'cmt_' + randomBytes(6).toString('hex'), articleId: input.articleId, userId: input.userId, userName: input.userName, body: input.body.trim().slice(0, MAX_LEN), createdAt: new Date().toISOString() };
  if (isDb()) await prisma.comment.create({ data: { ...comment, bizId: biz(), createdAt: new Date(comment.createdAt) } });
  else await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => { const list = cur[input.articleId] ?? []; list.push(comment); cur[input.articleId] = list; return [cur, undefined]; });
  return comment;
}

export async function deleteComment(articleId: string, commentId: string, userId: string, isManager: boolean): Promise<boolean> {
  if (isDb()) {
    const c = await prisma.comment.findFirst({ where: { id: commentId, bizId: biz(), articleId } });
    if (!c) return false;
    if (c.userId !== userId && !isManager) return false;
    await prisma.comment.delete({ where: { id: commentId } });
    return true;
  }
  return mutateJson<Store, boolean>(bizFile(NAME), {}, (cur) => { const list = cur[articleId] ?? []; const c = list.find((x) => x.id === commentId); if (!c) return [cur, false]; if (c.userId !== userId && !isManager) return [cur, false]; cur[articleId] = list.filter((x) => x.id !== commentId); return [cur, true]; });
}
