// Khóa + nhãn cho "nguồn bài viết". Dùng CHUNG giữa store (ghi articleSourceKey xuống DB để lọc
// bằng index) và giao diện (thẻ nguồn, bộ lọc) — hai nơi phải gom nhóm giống hệt nhau.
// Hàm thuần, không phụ thuộc server: import được từ cả client component.

export function isSourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// URL gom theo domain (nhiều bài cùng site = một nguồn), còn lại lấy nguyên chữ đã chuẩn hóa.
// Trả '' khi không có nguồn.
export function sourceKey(value: string | undefined | null): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (isSourceUrl(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // URL hỏng → rơi về so khớp theo chữ.
    }
  }
  return raw.toLowerCase();
}

// Nhãn hiển thị: domain cho URL, chữ rút gọn cho nguồn dạng tên.
export function sourceLabel(value: string): string {
  const raw = value.trim();
  if (isSourceUrl(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./i, '');
    } catch {
      // bỏ qua, dùng nhánh rút gọn bên dưới
    }
  }
  return raw.length > 40 ? `${raw.slice(0, 40)}...` : raw;
}
