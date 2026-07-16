// Thông tin hệ thống / thương hiệu DÙNG CHUNG toàn nền tảng - .data/branding.json (toàn cục).
// KHÔNG chứa bí mật → đọc được công khai (layout, trang đăng nhập) mà không lộ gì nhạy cảm.
// Superadmin sửa ở Quản trị nền tảng → tab "Thông tin hệ thống". Server-only.
import { globalFile } from '../data/biz-path';
import { mutateJson, readJson } from '../data/json-store';

export interface Branding {
  title: string; // tiêu đề (tab trình duyệt + metadata)
  description: string; // mô tả (metadata)
  favicon: string; // URL hoặc data URI
  logoAmBan: string; // logo ÂM BẢN (chữ sáng, dùng trên nền tối - hero đăng nhập)
  logoDuongBan: string; // logo DƯƠNG BẢN (chữ tối, dùng trên nền sáng)
  bizLogo: string; // logo ở bộ chuyển biz (header + drawer mobile) và logo top bar
  ogImage: string; // ẢNH BÌA khi chia sẻ link lên MXH (Open Graph). PHẢI là URL http(s) tuyệt đối
  // (Facebook/Zalo không đọc được data URI). Rỗng = fallback về logoDuongBan.
  sourceText: string; // dòng nguồn, ví dụ "by: noti.vn"
  sourceUrl: string; // link của dòng nguồn
  colorPrimary: string; // màu nút chính / điểm nhấn (HEX). Rỗng = mặc định Polaris
  colorHeader: string; // màu nền header (HEX). Rỗng = mặc định Polaris
  colorButtonBorder: string; // màu viền nút (HEX). Rỗng = mặc định
  colorBorder: string; // màu viền khối/thẻ/ô (HEX). Rỗng = mặc định
  colorHome: string; // màu chủ đạo RIÊNG cho trang chủ landing (HEX). Rỗng = theo colorPrimary
  colorHomeGradient: string; // màu thứ 2 của gradient trang chủ (HEX). Rỗng = tự suy sắc đậm
  // Màu RIÊNG cho Báo cáo Social (trang xem + bản xuất PDF/.doc/Drive). Rỗng = mặc định.
  colorSocialAccent: string; // màu nhấn (tiêu đề mục, header bài đăng, chip, link)
  colorSocialStrength: string; // màu khối Điểm mạnh (+ BOFU)
  colorSocialWeakness: string; // màu khối Điểm yếu
  // Màu RIÊNG cho TRANG CHIA SẺ công khai (/share) — nút bấm & nhãn. Rỗng = xanh mặc định.
  colorShareButton: string; // màu nút trên trang chia sẻ (nút "Xem báo cáo" ở màn nhập mật khẩu)
  colorShareBadge: string; // màu nhãn ("Bảo mật" / "Chỉ xem") trên trang chia sẻ
}

// Mặc định = đúng giá trị đang hard-code trước đây (giữ nguyên diện mạo khi chưa cấu hình).
export const DEFAULT_BRANDING: Branding = {
  title: 'GEO & Report - AI Platform by: noti.vn',
  description:
    'Nghiên cứu từ khóa, viết bài mới & tối ưu bài cũ bằng AI, tự động nghiên cứu → tạo báo cáo social và sàn TMĐT',
  favicon: 'https://noti.vn/image/new/favicon.png',
  logoAmBan: 'https://noti.vn/image/new/logo-am-ban.png',
  logoDuongBan: 'https://noti.vn/image/new/logo-duong-ban.png',
  bizLogo: 'https://noti.vn/image/new/favicon.png',
  ogImage: '', // rỗng = dùng logoDuongBan làm ảnh chia sẻ; superadmin đặt ảnh bìa riêng ở đây
  sourceText: 'by: noti.vn',
  sourceUrl: 'https://noti.vn',
  colorPrimary: '', // để trống = dùng màu mặc định Polaris (không ghi đè)
  colorHeader: '',
  colorButtonBorder: '',
  colorBorder: '',
  colorHome: '', // để trống = trang chủ dùng theo colorPrimary
  colorHomeGradient: '',
  colorSocialAccent: '', // để trống = xanh mặc định của báo cáo
  colorSocialStrength: '',
  colorSocialWeakness: '',
  colorShareButton: '', // để trống = xanh #0061ff mặc định
  colorShareBadge: '',
};

const FILE = globalFile('branding.json');

// Bỏ các trường rỗng/chỉ có khoảng trắng → trường bị xóa sẽ TRỞ VỀ mặc định (không để tiêu đề trống).
function nonEmpty(d: Partial<Branding>): Partial<Branding> {
  const out: Partial<Branding> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'string' && v.trim()) out[k as keyof Branding] = v;
  }
  return out;
}

export async function getBranding(): Promise<Branding> {
  const d = await readJson<Partial<Branding>>(FILE, {});
  return { ...DEFAULT_BRANDING, ...nonEmpty(d) };
}

export async function saveBranding(patch: Partial<Branding>): Promise<Branding> {
  await mutateJson<Partial<Branding>, void>(FILE, {}, (cur) => {
    return [{ ...cur, ...patch }, undefined];
  });
  return getBranding();
}

// Khôi phục toàn bộ về mặc định (xóa file cấu hình).
export async function resetBranding(): Promise<Branding> {
  await mutateJson<Partial<Branding>, void>(FILE, {}, () => [{}, undefined]);
  return getBranding();
}
