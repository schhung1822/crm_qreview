export const USER_GUIDE_MD = `# Hướng dẫn sử dụng

CRM QReview là hệ thống nội bộ, dùng một không gian làm việc và giao diện tiếng Việt.

---

## 1. Bắt đầu nhanh

1. Vào **Quản lý kết nối** để thêm khóa API AI, kết nối website và kết nối mạng xã hội.
2. Vào **Từ khóa** để nghiên cứu chủ đề và lưu bộ từ khóa.
3. Dùng **Kế hoạch** hoặc **Trình soạn thảo** để tạo bài viết.
4. Kiểm tra SEO/AEO/GEO, duyệt nội dung rồi xuất bản.
5. Dùng **Đăng mạng xã hội** hoặc API ngoài để tạo bài chờ duyệt trước khi đăng.

---

## 2. Kết nối

- Thêm khóa API cho Claude, OpenAI, Gemini, DeepSeek hoặc nhà cung cấp được hỗ trợ.
- Kết nối WordPress, Wix, Shopify, Haravan hoặc Sapo.
- Kết nối Facebook Fanpage, Instagram, Threads, TikTok hoặc YouTube để đăng bài mạng xã hội.
- Có thể cấu hình Google Drive, DataForSEO và Apify cho các luồng liên quan.
- Khóa bí mật được mã hóa bằng \`ENCRYPTION_KEY\`; cần giữ key này cố định sau khi đã lưu kết nối.

---

## 3. Nội dung

- **Từ khóa**: nghiên cứu và nhóm từ khóa tiếng Việt.
- **Kế hoạch**: lập danh sách bài cần triển khai.
- **Trình soạn thảo**: tạo, chỉnh sửa, nhân hóa và kiểm chứng bài viết.
- **Bài viết**: quản lý trạng thái nháp, chờ duyệt và đã đăng.
- **Tối ưu**: kiểm tra SEO/AEO/GEO, liên kết nội bộ và cập nhật bài cũ.

---

## 4. Đăng mạng xã hội

Trang **Đăng mạng xã hội** cho phép đăng nội dung lên một hoặc nhiều kênh đã kết nối.

- Chọn loại nội dung: bài viết, hình ảnh hoặc video.
- **Nguồn bài viết** (tùy chọn): ghi tên nguồn hoặc URL bài gốc để biết nội dung lấy từ đâu. Trường này chỉ hiển thị nội bộ ở trang **Bài đăng mạng xã hội**, không gửi lên mạng xã hội.
- **Link affiliate** (tùy chọn): mỗi dòng một link. Sau khi đăng lên Facebook, mỗi link được đăng thành **một comment riêng** dưới bài. Các nền tảng khác bỏ qua trường này. Nếu một comment lỗi, bài đăng vẫn giữ nguyên và hệ thống báo rõ link nào chưa đăng được.
- Có thể nhập nhiều URL ảnh, mỗi dòng một ảnh.
- Có thể bật/tắt xử lý ảnh trước khi đăng.
- Khi bật xử lý ảnh, hệ thống tải ảnh về, mặc định cắt vuông 1:1 (có thể tắt để giữ tỷ lệ gốc), scale theo cấu hình, thêm khung trắng và logo.
- Ảnh xử lý xong xuất JPEG chất lượng cao, kích thước tới 2048px nếu ảnh gốc đủ lớn (ảnh nhỏ giữ nguyên khung 1080px, không phóng to). Toàn bộ chỉnh sửa chỉ nén một lần duy nhất nên ảnh gần như giữ nguyên chất lượng gốc.
- Nếu tắt xử lý ảnh, hệ thống dùng nguyên URL đã dán và không lưu ảnh về máy chủ.
- Sau khi đăng, lịch sử được lưu tại **Bài đăng mạng xã hội**.

---

## 5. API đăng mạng xã hội từ bên ngoài

API ngoài dùng để hệ thống khác đẩy nội dung vào QReview. API này **không đăng thẳng lên mạng xã hội**. Nội dung sẽ được lưu ở trạng thái **Chờ duyệt**, sau đó người dùng vào app để xem, chỉnh sửa và bấm đăng.

### Endpoint

\`POST /api/v1/social-publish\`

Ví dụ URL đầy đủ:

\`https://your-domain.com/api/v1/social-publish\`

### Xác thực

Gửi Bearer token trong header:

\`Authorization: Bearer <API_TOKEN>\`

Token được tạo tại **Quản lý kết nối** → tab **Khác** → khung **API token cho API ngoài**. Giữ token như mật khẩu.

### Cho phép domain gọi API

Trong file \`.env\` trên server, khai báo domain được phép gọi API:

\`SOCIAL_PUBLISH_ALLOWED_ORIGINS=https://example.com,https://app.example.com\`

Giá trị phải là origin đầy đủ gồm scheme và host. Không thêm path phía sau.

Khi gọi từ n8n hoặc server-to-server, request thường không tự có header \`Origin\`. Hãy thêm header:

\`X-QReview-Origin: https://example.com\`

Giá trị này phải trùng với một origin trong \`SOCIAL_PUBLISH_ALLOWED_ORIGINS\`.

### Chọn nền tảng bằng tên viết tắt

Trường \`platforms\` nhận danh sách mã nền tảng:

- \`fb\`: Facebook
- \`ig\`: Instagram
- \`th\`: Threads
- \`tk\`: TikTok
- \`yt\`: YouTube

Có thể gửi dạng mảng:

\`"platforms": ["fb", "ig"]\`

Hoặc dạng chuỗi:

\`"platforms": "fb,ig"\`

Hệ thống sẽ tự tìm kết nối active tương ứng với từng nền tảng. Nếu chưa có kết nối cho nền tảng nào, API sẽ trả lỗi để người dùng bổ sung kết nối trước.

### Nguồn bài viết (tùy chọn)

Trường \`articleSource\` (chuỗi, tối đa 300 ký tự) dùng để ghi nhận bài này lấy từ đâu — tên nguồn hoặc URL bài gốc. Giá trị chỉ hiển thị nội bộ ở trang **Bài đăng mạng xã hội** để người duyệt biết xuất xứ nội dung; hệ thống **không** gửi trường này lên mạng xã hội.

\`"articleSource": "https://example.com/bai-goc"\`

Link affiliate không nhận qua API ngoài — thêm trực tiếp trong app trước khi bấm đăng.

### Body mẫu cho bài hình ảnh

Gửi JSON:

\`{
  "platforms": ["fb", "ig"],
  "title": "Tiêu đề bài đăng",
  "articleSource": "https://example.com/bai-goc",
  "text": "Nội dung / chú thích cần đăng",
  "mediaType": "image",
  "mediaUrls": [
    "https://example.com/image-1.jpg",
    "https://example.com/image-2.jpg"
  ],
  "imageProcessing": {
    "enabled": true,
    "cropSquare": true,
    "scale": 1.1,
    "barHeight": 10,
    "showLogo": true
  }
}\`

### Body mẫu cho bài chữ

\`{
  "platforms": "fb,th",
  "title": "Tiêu đề nội bộ",
  "text": "Nội dung bài viết cần duyệt trước khi đăng",
  "mediaType": "text",
  "linkUrl": "https://example.com"
}\`

### Body mẫu cho video

\`{
  "platforms": ["tk", "yt"],
  "title": "Tiêu đề video",
  "text": "Mô tả video",
  "mediaType": "video",
  "mediaUrl": "https://example.com/video.mp4",
  "privacy": "SELF_ONLY"
}\`

### Response thành công

API trả \`202 Accepted\`:

\`{
  "status": "pending_review",
  "message": "Da tao bai cho duyet. Nguoi dung can vao app de chinh sua/duyet truoc khi dang.",
  "batchId": "spb_xxx",
  "reviewUrl": "/social-publish?review=sp_xxx",
  "posts": [
    {
      "id": "sp_xxx",
      "connectionId": "conn_xxx",
      "platform": "facebook",
      "label": "Qreview",
      "status": "pending_review"
    }
  ]
}\`

Người dùng mở \`reviewUrl\`, kiểm tra nội dung, chỉnh sửa nếu cần rồi bấm **Đăng ngay**. Khi đăng thành công, bản chờ duyệt sẽ được dọn khỏi danh sách.

### Curl mẫu

\`curl -X POST https://your-domain.com/api/v1/social-publish \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "X-QReview-Origin: https://example.com" \\
  -H "Content-Type: application/json" \\
  -d '{"platforms":["fb","ig"],"title":"Tiêu đề","text":"Nội dung cần duyệt","mediaType":"image","mediaUrls":["https://example.com/image.jpg"]}'\`

---

## 6. Cộng tác

Quản trị viên có thể tạo tài khoản cho nhân viên, phân quyền, giao bài, duyệt bài và trao đổi bằng bình luận. Danh sách tài khoản được quản lý tại **Quản trị**.

---

## 7. Xuất bản và lịch

Chọn bài, kết nối đích và trạng thái xuất bản. Khi cập nhật bài đã đăng qua cùng kết nối, hệ thống cập nhật bài cũ thay vì tạo bản trùng. Dùng **Lịch** để theo dõi bài đã lên lịch.

---

## 8. Báo cáo và công cụ

- **Báo cáo**: theo dõi nội dung, token, chi phí AI và hoạt động đăng mạng xã hội.
- **Audit / Landing Audit**: rà soát chất lượng trang.
- **Báo cáo Social**: thu thập và phân tích dữ liệu mạng xã hội hoặc sàn thương mại điện tử.
- **Phân tích kịch bản**: phân tích cấu trúc video từ liên kết.
- **Thư viện ảnh**: quản lý ảnh đã tạo hoặc tải lên.

---

## 9. Tài khoản và bảo mật

Vào **Tài khoản** để đổi tên hoặc mật khẩu. Không chia sẻ khóa API, mật khẩu, Bearer token hay liên kết chia sẻ có nội dung nhạy cảm. Khi cần hỗ trợ, liên hệ quản trị viên hệ thống.
`;

export function getUserGuideMd(_locale?: string): string {
  return USER_GUIDE_MD;
}
