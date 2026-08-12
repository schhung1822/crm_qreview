export const USER_GUIDE_MD = `# Hướng dẫn sử dụng

CRM QReview là hệ thống nội bộ, dùng một không gian làm việc và giao diện tiếng Việt.

---

## 1. Bắt đầu nhanh

1. Vào **Kết nối** để thêm khóa API AI và kết nối website.
2. Vào **Từ khóa** để nghiên cứu chủ đề và lưu bộ từ khóa.
3. Dùng **Kế hoạch** hoặc **Trình soạn thảo** để tạo bài viết.
4. Kiểm tra SEO/AEO/GEO, duyệt nội dung rồi xuất bản.

---

## 2. Kết nối

- Thêm khóa API cho Claude, OpenAI, Gemini, DeepSeek hoặc nhà cung cấp được hỗ trợ.
- Kết nối WordPress, Wix, Shopify, Haravan hoặc Sapo.
- Có thể cấu hình Google Drive, DataForSEO và Apify cho các luồng liên quan.
- Khóa bí mật được mã hóa và không hiển thị đầy đủ sau khi lưu.

---

## 3. Nội dung

- **Từ khóa**: nghiên cứu và nhóm từ khóa tiếng Việt.
- **Kế hoạch**: lập danh sách bài cần triển khai.
- **Trình soạn thảo**: tạo, chỉnh sửa, nhân hóa và kiểm chứng bài viết.
- **Bài viết**: quản lý trạng thái nháp, chờ duyệt và đã đăng.
- **Tối ưu**: kiểm tra SEO/AEO/GEO, liên kết nội bộ và cập nhật bài cũ.

---

## 4. Cộng tác

Quản trị viên có thể tạo tài khoản cho nhân viên, phân quyền, giao bài, duyệt bài và trao đổi bằng bình luận. Danh sách tài khoản được quản lý tại **Quản trị**.

---

## 5. Xuất bản và lịch

Chọn bài, kết nối đích và trạng thái xuất bản. Khi cập nhật bài đã đăng qua cùng kết nối, hệ thống cập nhật bài cũ thay vì tạo bản trùng. Dùng **Lịch** để theo dõi bài đã lên lịch.

---

## 6. Báo cáo và công cụ

- **Báo cáo**: theo dõi token và chi phí AI.
- **Audit / Landing Audit**: rà soát chất lượng trang.
- **Báo cáo Social**: thu thập và phân tích dữ liệu mạng xã hội hoặc sàn thương mại điện tử.
- **Phân tích kịch bản**: phân tích cấu trúc video từ liên kết.
- **Thư viện ảnh**: quản lý ảnh đã tạo hoặc tải lên.

---

## 7. Tài khoản và bảo mật

Vào **Tài khoản** để đổi tên hoặc mật khẩu. Không chia sẻ khóa API, mật khẩu hay liên kết chia sẻ có nội dung nhạy cảm. Khi cần hỗ trợ, liên hệ quản trị viên hệ thống.
`;

export function getUserGuideMd(_locale?: string): string {
  return USER_GUIDE_MD;
}
