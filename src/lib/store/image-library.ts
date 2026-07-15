// Thư viện ảnh: quản lý MỌI ảnh trong public/generated (ảnh AI tạo + ảnh tải lên).
// Ảnh là FILE trên đĩa (volume app-media); ở đây phủ thêm metadata (tên hiển thị, nguồn) qua index
// JSON toàn cục image-library.json. Danh sách ảnh = QUÉT thư mục (nên ảnh cũ chưa có index vẫn hiện).
// Server-only.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

const DIR = path.join(process.cwd(), 'public', 'generated');
const META = globalFile('image-library.json');

// Chỉ cho tên file "phẳng" (chống path traversal khi xóa/đổi tên).
const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;
const IMG_EXT = /\.(webp|png|jpe?g|gif|avif|svg)$/i;

interface Meta {
  name?: string;
  kind?: 'ai' | 'upload';
  createdAt?: string;
}
type MetaMap = Record<string, Meta>;

export interface LibImage {
  file: string; // tên file (id)
  url: string; // /generated/<file>
  name: string; // tên hiển thị (metadata) — mặc định = tên file
  kind: 'ai' | 'upload' | 'other';
  size: number; // bytes
  createdAt: string; // ISO
}

export async function listImages(): Promise<LibImage[]> {
  let files: string[] = [];
  try {
    files = await fs.readdir(DIR);
  } catch {
    files = [];
  }
  const meta = await readJson<MetaMap>(META, {});
  const out: LibImage[] = [];
  for (const f of files) {
    if (!IMG_EXT.test(f)) continue;
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(path.join(DIR, f));
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const m = meta[f] ?? {};
    out.push({
      file: f,
      url: `/generated/${f}`,
      name: m.name || f,
      kind: m.kind ?? 'other',
      size: stat.size,
      createdAt: m.createdAt || stat.mtime.toISOString(),
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // mới nhất trước
  return out;
}

// Ghi nhận ảnh vào index (gọi khi tạo/upload). createdAt giữ nguyên nếu đã có.
export async function registerImage(file: string, kind: 'ai' | 'upload', name?: string): Promise<void> {
  if (!SAFE_NAME.test(file)) return;
  await mutateJson<MetaMap, void>(META, {}, (cur) => {
    const prev = cur[file] ?? {};
    cur[file] = {
      kind,
      name: name?.trim() || prev.name,
      createdAt: prev.createdAt || new Date().toISOString(),
    };
    return [cur, undefined];
  });
}

export async function renameImage(file: string, name: string): Promise<boolean> {
  if (!SAFE_NAME.test(file)) return false;
  await mutateJson<MetaMap, void>(META, {}, (cur) => {
    cur[file] = { ...(cur[file] ?? {}), name: name.trim().slice(0, 200) };
    return [cur, undefined];
  });
  return true;
}

export async function deleteImage(file: string): Promise<boolean> {
  if (!SAFE_NAME.test(file)) return false;
  try {
    await fs.rm(path.join(DIR, file), { force: true });
  } catch {
    /* file có thể đã bị xóa */
  }
  await mutateJson<MetaMap, void>(META, {}, (cur) => {
    delete cur[file];
    return [cur, undefined];
  });
  return true;
}
