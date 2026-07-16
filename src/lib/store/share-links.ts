// Link rút gọn dạng blog cho báo cáo: /<slug>  (slug = bao-cao-<ten>-<timestamp>).
// Index TOÀN CỤC (trang công khai không có cookie biz) map slug → {bizId, reportId, ownerId, token}.
// Bot MXH đọc OG; người dùng thật được chuyển sang /share/<token>. Có override tiêu đề/mô tả/ảnh.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';
import { slugifyTitle } from '../social/share-og';

export interface ShareLinkRow {
  slug: string; // id + path công khai
  bizId: string;
  reportId: string;
  ownerId: string;
  token: string; // token chia sẻ /share/<token> để redirect người dùng thật
  title?: string; // override OG
  description?: string;
  image?: string;
  reportTitle: string; // tên báo cáo lúc tạo (hiển thị ở trang quản lý)
  createdBy: string;
  createdAt: string;
  revoked?: boolean;
}

const FILE = globalFile('share-links.json');
const SLUG_RE = /^[a-z0-9-]{3,120}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

// Tạo slug duy nhất: bao-cao-<ten-khong-dau>-<timestamp>.
function makeSlug(reportTitle: string): string {
  const base = slugifyTitle(reportTitle);
  return `bao-cao-${base ? `${base}-` : ''}${Date.now()}`;
}

export async function createShareLink(input: {
  bizId: string;
  reportId: string;
  ownerId: string;
  token: string;
  reportTitle: string;
  createdBy: string;
}): Promise<ShareLinkRow> {
  const row: ShareLinkRow = {
    slug: makeSlug(input.reportTitle),
    bizId: input.bizId,
    reportId: input.reportId,
    ownerId: input.ownerId,
    token: input.token,
    reportTitle: input.reportTitle,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  await mutateJson<ShareLinkRow[], void>(FILE, [], (rows) => {
    rows.push(row);
    return [rows, undefined];
  });
  return row;
}

// Tra slug công khai → chỉ trả link CÒN hiệu lực (chưa thu hồi).
export async function getShareLink(slug: string): Promise<ShareLinkRow | null> {
  if (!isValidSlug(slug)) return null;
  const rows = await readJson<ShareLinkRow[]>(FILE, []);
  const row = rows.find((r) => r.slug === slug && !r.revoked);
  return row ?? null;
}

// Lấy 1 link (bất kể trạng thái) trong đúng biz — để quản lý (vd đặt mật khẩu theo reportId).
export async function getShareLinkManaged(bizId: string, slug: string): Promise<ShareLinkRow | null> {
  const rows = await readJson<ShareLinkRow[]>(FILE, []);
  return rows.find((r) => r.slug === slug && r.bizId === bizId) ?? null;
}

// Danh sách link của 1 biz (cho trang quản lý — gồm cả đã thu hồi để hiển thị trạng thái).
export async function listShareLinks(bizId: string): Promise<ShareLinkRow[]> {
  const rows = await readJson<ShareLinkRow[]>(FILE, []);
  return rows
    .filter((r) => r.bizId === bizId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Sửa override / thu hồi (revoked). CHỈ trong đúng biz (chống chéo tenant).
export async function patchShareLink(
  bizId: string,
  slug: string,
  patch: { title?: string; description?: string; image?: string; revoked?: boolean },
): Promise<boolean> {
  let ok = false;
  await mutateJson<ShareLinkRow[], void>(FILE, [], (rows) => {
    const r = rows.find((x) => x.slug === slug && x.bizId === bizId);
    if (r) {
      if (patch.title !== undefined) r.title = patch.title.trim() || undefined;
      if (patch.description !== undefined) r.description = patch.description.trim() || undefined;
      if (patch.image !== undefined) r.image = patch.image.trim() || undefined;
      if (patch.revoked !== undefined) r.revoked = patch.revoked;
      ok = true;
    }
    return [rows, undefined];
  });
  return ok;
}

// Thu hồi MỌI link rút gọn của 1 báo cáo (gọi khi tắt/đổi chia sẻ — token cũ chết).
export async function revokeShareLinksForReport(bizId: string, reportId: string): Promise<void> {
  await mutateJson<ShareLinkRow[], void>(FILE, [], (rows) => {
    for (const r of rows) {
      if (r.bizId === bizId && r.reportId === reportId) r.revoked = true;
    }
    return [rows, undefined];
  });
}

export async function deleteShareLink(bizId: string, slug: string): Promise<boolean> {
  let ok = false;
  await mutateJson<ShareLinkRow[], void>(FILE, [], (rows) => {
    const next = rows.filter((r) => {
      const match = r.slug === slug && r.bizId === bizId;
      if (match) ok = true;
      return !match;
    });
    return [next, undefined];
  });
  return ok;
}
