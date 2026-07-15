// Chuyển phản hồi lỗi từ API admin thành text hiển thị theo NGÔN NGỮ hiện tại.
// Route trả `code` = key i18n (namespace admin) → dịch; nếu chỉ có `error` (chuỗi sẵn) thì dùng
// nguyên; không có gì → dùng 'actionErr'. `t` là hàm dịch của next-intl (namespace admin).
export function apiErrText(
  d: { error?: string; code?: string } | null | undefined,
  t: (key: string) => string,
): string {
  if (d?.code) return t(d.code);
  return d?.error ?? t('actionErr');
}
