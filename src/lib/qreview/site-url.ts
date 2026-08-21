/**
 * Địa chỉ công khai của website Qreview.
 *
 * Trước khi chuyển vào CRM, khu quản trị chạy CÙNG tên miền với website nên
 * `href="/"` là đủ để mở trang thật. Bây giờ hai thứ nằm ở hai nơi khác nhau —
 * `/` của CRM là màn hình đăng nhập, không phải website — nên mọi liên kết ra
 * trang thật phải đi qua đây.
 *
 * Đặt `NEXT_PUBLIC_QREVIEW_SITE_URL` trong `.env`. Chưa đặt thì trả về chuỗi
 * rỗng và nơi gọi tự ẩn liên kết đi: một nút mở ra trang trắng còn tệ hơn là
 * không có nút.
 */
export function qreviewSiteUrl(path = '/'): string {
  const base = (process.env.NEXT_PUBLIC_QREVIEW_SITE_URL ?? '').trim().replace(/\/+$/, '');

  if (!base) {
    return '';
  }

  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
