// Ghi chú/nhận xét trên bài viết theo biz - lưu .data/biz/<bizId>/comments.json. Server-only.
import { randomBytes } from 'node:crypto';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface Comment {
  id: string;
  articleId: string;
  userId: string;
  userName: string; // chụp tên lúc viết (khỏi tra lại; user có thể bị xóa)
  body: string;
  createdAt: string;
}

type Store = Record<string, Comment[]>; // articleId → danh sách ghi chú (cũ → mới)

const NAME = 'comments.json';
const MAX_LEN = 4000;

export async function listComments(articleId: string): Promise<Comment[]> {
  const store = await readJson<Store>(bizFile(NAME), {});
  return store[articleId] ?? [];
}

export async function addComment(input: {
  articleId: string;
  userId: string;
  userName: string;
  body: string;
}): Promise<Comment> {
  const comment: Comment = {
    id: 'cmt_' + randomBytes(6).toString('hex'),
    articleId: input.articleId,
    userId: input.userId,
    userName: input.userName,
    body: input.body.trim().slice(0, MAX_LEN),
    createdAt: new Date().toISOString(),
  };
  await mutateJson<Store, void>(bizFile(NAME), {}, (cur) => {
    const list = cur[input.articleId] ?? [];
    list.push(comment);
    cur[input.articleId] = list;
    return [cur, undefined];
  });
  return comment;
}

// Xóa ghi chú: người viết tự xóa, HOẶC người quản lý (isManager=true) xóa bất kỳ.
export async function deleteComment(
  articleId: string,
  commentId: string,
  userId: string,
  isManager: boolean,
): Promise<boolean> {
  return mutateJson<Store, boolean>(bizFile(NAME), {}, (cur) => {
    const list = cur[articleId] ?? [];
    const c = list.find((x) => x.id === commentId);
    if (!c) return [cur, false];
    if (c.userId !== userId && !isManager) return [cur, false];
    cur[articleId] = list.filter((x) => x.id !== commentId);
    return [cur, true];
  });
}
