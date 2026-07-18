// Thư viện ảnh: quản lý ảnh trong public/generated (ảnh AI tạo + ảnh tải lên).
// Ảnh là FILE trên đĩa (volume app-media, storage PHẲNG dùng chung); metadata (tên hiển thị,
// nguồn, CHỦ SỞ HỮU) phủ qua index JSON CÔ LẬP THEO BIZ: .data/biz/<bizId>/image-library.json.
// Server-only.
//
// CÔ LẬP TENANT: index là NGUỒN CHÂN LÝ về "ảnh nào thuộc biz nào". listImages/rename/delete
// CHỈ thao tác trên index của biz hiện tại → user biz A không thấy/sửa/xóa được ảnh biz B.
// KHÔNG quét thẳng thư mục chung (thư mục chứa ảnh của MỌI biz) vì làm vậy sẽ lộ chéo tenant.
//
// Lưu ý: file ảnh vẫn nằm chung 1 thư mục và phục vụ công khai qua /generated/<file> — đây là
// YÊU CẦU chức năng (ảnh nhúng trong bài, đăng lên CMS, làm ảnh OG cho link chia sẻ đều cần URL
// công khai không auth). Tên file có hậu tố ngẫu nhiên nên không liệt kê được; quyền QUẢN LÝ mới
// là thứ được cô lệ ở đây. Ảnh tạo TRƯỚC bản vá này (index global cũ .data/image-library.json)
// không xác định được chủ → không còn hiện trong thư viện của biz nào (vẫn phục vụ qua URL cũ).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bizFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

const DIR = path.join(process.cwd(), 'public', 'generated');
const META_NAME = 'image-library.json';

// Index metadata CỦA BIZ HIỆN TẠI (activeBizId qua ALS/cookie). Gọi trong request-context.
function metaFile(): string {
  return bizFile(META_NAME);
}

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

// Liệt kê ảnh CỦA BIZ HIỆN TẠI: duyệt index của biz (không quét thư mục chung), bỏ ảnh đã bị
// xóa khỏi đĩa. Chỉ ảnh có trong index biz mới hiện → không lộ ảnh biz khác.
export async function listImages(): Promise<LibImage[]> {
  const meta = await readJson<MetaMap>(metaFile(), {});
  const out: LibImage[] = [];
  for (const [f, m] of Object.entries(meta)) {
    if (!SAFE_NAME.test(f) || !IMG_EXT.test(f)) continue;
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(path.join(DIR, f));
    } catch {
      continue; // file đã bị xóa dưới đĩa → bỏ khỏi danh sách
    }
    if (!stat.isFile()) continue;
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

// Ghi nhận ảnh vào index CỦA BIZ HIỆN TẠI (gọi khi tạo/upload — trong request-context nên
// activeBizId đúng). createdAt giữ nguyên nếu đã có. Đây là bước GẮN CHỦ cho ảnh.
export async function registerImage(file: string, kind: 'ai' | 'upload', name?: string): Promise<void> {
  if (!SAFE_NAME.test(file)) return;
  await mutateJson<MetaMap, void>(metaFile(), {}, (cur) => {
    const prev = cur[file] ?? {};
    cur[file] = {
      kind,
      name: name?.trim() || prev.name,
      createdAt: prev.createdAt || new Date().toISOString(),
    };
    return [cur, undefined];
  });
}

// Đổi tên ảnh — CHỈ khi ảnh thuộc biz hiện tại (có trong index biz). File lạ/của biz khác → false
// (không tạo entry mới để tránh "nhận vơ" ảnh biz khác).
export async function renameImage(file: string, name: string): Promise<boolean> {
  if (!SAFE_NAME.test(file)) return false;
  return mutateJson<MetaMap, boolean>(metaFile(), {}, (cur) => {
    if (!cur[file]) return [cur, false]; // không thuộc biz này → từ chối
    cur[file] = { ...cur[file], name: name.trim().slice(0, 200) };
    return [cur, true];
  });
}

export async function deleteImage(file: string): Promise<boolean> {
  return (await deleteImages([file])) > 0;
}

// Xóa nhiều ảnh: CHỈ những ảnh THUỘC biz hiện tại (có trong index biz) mới bị xóa — cả entry
// index lẫn FILE dưới đĩa. Ảnh của biz khác bị bỏ qua hoàn toàn (không đụng đĩa). Trả số ảnh
// đã xóa hợp lệ. Gỡ index TRƯỚC (dưới khóa) để chốt tập được phép, rồi mới xóa file.
export async function deleteImages(files: string[]): Promise<number> {
  const requested = [...new Set(files)].filter((f) => SAFE_NAME.test(f));
  if (!requested.length) return 0;
  const owned = await mutateJson<MetaMap, string[]>(metaFile(), {}, (cur) => {
    const owned = requested.filter((f) => cur[f]); // chỉ file có trong index của biz này
    for (const f of owned) delete cur[f];
    return [cur, owned];
  });
  for (const f of owned) {
    try {
      await fs.rm(path.join(DIR, f), { force: true });
    } catch {
      /* file có thể đã bị xóa */
    }
  }
  return owned.length;
}
