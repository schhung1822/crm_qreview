// Đường dẫn file dữ liệu, phân biệt:
//  - bizFile(name): dữ liệu THUỘC BIZ → .data/biz/<bizId>/<name> (cô lập theo biz).
//  - globalFile(name): dữ liệu TOÀN CỤC (users, sessions, bizes, email) → .data/<name>.
//
// bizId lấy theo thứ tự: ngữ cảnh ALS (nếu có, vd khi bọc bằng run()) → COOKIE sg_biz của request.
// Vì sao đọc cookie ở đây: enterWith() trong guard() KHÔNG truyền ngữ cảnh sang route handler
// (khác async-frame), nên store cần nguồn request-scoped đáng tin. Cookie sg_biz là httpOnly, CHỈ
// server đặt (luôn là biz user là thành viên) → an toàn để tin.
// Ngoài ngữ cảnh request (worker/test/script) → không có cookie → fallback .data gốc.
import path from 'node:path';
import { cookies } from 'next/headers';
import { currentBizId } from '../biz/context';

const DATA = path.join(process.cwd(), '.data');

// Định dạng bizId hợp lệ: 'biz_' + chữ/số (thực tế là hex, xem store/biz genId). Mục tiêu chính là
// CHẶN path traversal (loại mọi '.', '/', '\\', null byte) phòng khi bizId bẩn lọt vào (cookie giả /
// lời gọi bỏ qua guard trong tương lai). Defense-in-depth: hôm nay guard đã kiểm membership.
const BIZ_ID_RE = /^biz_[a-zA-Z0-9]+$/;

// bizId đang hoạt động của request (ALS → cookie sg_biz). Export để lớp cưỡng chế (quota/gói) lấy
// đúng biz kể cả khi ALS của guard không truyền được sang handler. Trả undefined nếu bizId dị dạng.
export function activeBizId(): string | undefined {
  const fromCtx = currentBizId();
  let raw: string | undefined = fromCtx;
  if (!raw) {
    try {
      raw = cookies().get('sg_biz')?.value || undefined;
    } catch {
      raw = undefined; // không ở trong request (worker/test)
    }
  }
  if (!raw) return undefined;
  return BIZ_ID_RE.test(raw) ? raw : undefined;
}

export function bizFile(name: string): string {
  const bizId = activeBizId();
  return bizId ? path.join(DATA, 'biz', bizId, name) : path.join(DATA, name);
}

export function globalFile(name: string): string {
  return path.join(DATA, name);
}

export function bizDir(bizId: string): string {
  // Chặn traversal: bizId phải đúng định dạng trước khi ghép vào path.
  if (!BIZ_ID_RE.test(bizId)) throw new Error('bizId không hợp lệ');
  return path.join(DATA, 'biz', bizId);
}
