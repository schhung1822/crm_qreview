// Lịch sử Revision - snapshot nội dung TRƯỚC mỗi lần ghi đè bài trên CMS, để có thể
// diff & rollback (CLAUDE.md §5: "không bao giờ ghi đè bài mà không tạo Revision trước").
// Lưu file .data/revisions.json. Server-only.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { mutateJson, readJson } from '../data/json-store';

export interface RevisionRecord {
  id: string;
  connectionId: string;
  cmsPostId: string;
  // Ảnh chụp nội dung CŨ (trước khi update). Có thể rỗng nếu không tải được bản cũ.
  title: string;
  contentHtml: string;
  metaDescription?: string;
  snapshotOk: boolean; // true = chụp được bản cũ; false = chỉ ghi nhận (không tải được)
  reason: string; // vd 'pre-update'
  createdAt: string;
}

const FILE = path.join(process.cwd(), '.data', 'revisions.json');
// Giữ tối đa N revision gần nhất để file không phình vô hạn.
const MAX_REVISIONS = 500;

export async function listRevisions(filter?: {
  connectionId?: string;
  cmsPostId?: string;
}): Promise<RevisionRecord[]> {
  const all = await readJson<RevisionRecord[]>(FILE, []);
  const rows = filter
    ? all.filter(
        (r) =>
          (!filter.connectionId || r.connectionId === filter.connectionId) &&
          (!filter.cmsPostId || r.cmsPostId === filter.cmsPostId),
      )
    : all;
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function saveRevision(
  input: Omit<RevisionRecord, 'id' | 'createdAt'>,
): Promise<RevisionRecord> {
  const record: RevisionRecord = {
    ...input,
    id: 'rev_' + randomBytes(8).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  await mutateJson<RevisionRecord[], void>(FILE, [], (rows) => {
    const next = [...rows, record];
    // Cắt bớt bản cũ nhất nếu vượt ngưỡng (giữ N bản mới nhất theo createdAt).
    next.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return [next.slice(0, MAX_REVISIONS), undefined];
  });
  return record;
}
