# API Quản trị nền tảng (Platform Admin API)

API server-to-server cho **superadmin** để thao tác: đổi trạng thái đơn hàng, đổi trạng thái/gói
người dùng, đổi trạng thái/chủ sở hữu biz, và quản lý coupon.

> **Bất biến quan trọng:** API tái dùng ĐÚNG service layer của giao diện quản trị, nên mọi
> side-effect giữ nguyên — đặc biệt **email vẫn được gửi**:
> - Đổi đơn sang `paid` → kích hoạt gói/overage + tăng lượt coupon + gửi email **paymentReceived** + bắn Conversion API.
> - Hủy gói người dùng (`cancelSubscription`) → gửi email **subscriptionCanceled**.
>
> Email chỉ thực gửi khi Email nền tảng đã **bật** và cấu hình SMTP/Gmail hợp lệ (Quản trị nền tảng → Email).

## 1. Xác thực

Tất cả endpoint dùng **Bearer token**:

```
Authorization: Bearer sga_xxxxxxxx...
```

- Token do superadmin tạo ở Quản trị nền tảng (hoặc qua `POST /api/admin/platform-api-tokens`).
- Token thô **chỉ hiện một lần** lúc tạo — lưu ngay, không xem lại được (chỉ lưu hash sha256).
- Token có **scope** giới hạn tài nguyên: `orders`, `users`, `biz`, `coupons` (mặc định đủ 4).
- Token **tự vô hiệu** nếu người tạo không còn là superadmin (`SUPERADMIN_EMAILS`).
- Rate limit: **120 request/phút/token** (vượt → HTTP 429).

## 2. Quy ước phản hồi

```jsonc
// Thành công (HTTP 2xx)
{ "ok": true, "data": { ... } }

// Lỗi (HTTP 4xx/5xx)
{ "ok": false, "error": { "code": "invalid_params", "message": "..." } }
```

Mã lỗi: `unauthorized` (401), `forbidden` (403), `invalid_params` (400), `not_found` (404),
`operation_failed` (400), `rate_limited` (429).

## 3. Endpoints

### 3.1. Đơn hàng — scope `orders`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/admin/orders?status=&userId=&limit=` | Danh sách đơn (lọc tùy chọn) |
| PATCH | `/api/v1/admin/orders` | Đổi trạng thái đơn |

```bash
# Đổi đơn sang đã thanh toán → kích hoạt gói + gửi email biên nhận
curl -X PATCH http://localhost:3000/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```
`status` ∈ `pending | paid | canceled | refunded`. Chuyển sang `paid` LẦN ĐẦU mới kích hoạt (idempotent).

### 3.2. Người dùng — scope `users`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/admin/users?q=&limit=` | Danh sách user (không lộ mật khẩu) |
| PATCH | `/api/v1/admin/users` | Đổi trạng thái/gói user |

`PATCH` body theo `action`:
```jsonc
{ "action": "activate",  "userId": "usr_.." }                        // mở khóa
{ "action": "suspend",   "userId": "usr_.." }                        // khóa (không áp dụng chủ sở hữu)
{ "action": "setPassword","userId": "usr_..", "password": "≥8 ký tự" }
{ "action": "addOverage","userId": "usr_..", "overage": 100 }        // cộng bài mua thêm
{ "action": "setUnlimited","userId": "usr_..", "unlimited": true }
{ "action": "setPlan",   "userId": "usr_..", "plan": "pro", "months": 3 }   // gán gói (active)
{ "action": "cancelSubscription", "userId": "usr_.." }               // hủy gói → EMAIL subscriptionCanceled
```

### 3.3. Biz — scope `biz`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/admin/biz?limit=` | Danh sách biz |
| PATCH | `/api/v1/admin/biz` | Khóa / mở / chuyển chủ / xóa |

```jsonc
{ "bizId": "biz_..", "action": "suspend" }
{ "bizId": "biz_..", "action": "activate" }
{ "bizId": "biz_..", "action": "transfer", "newOwnerId": "usr_.." }
{ "bizId": "biz_..", "action": "delete" }     // xóa biz + toàn bộ dữ liệu workspace
```

### 3.4. Coupon — scope `coupons`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/admin/coupons` | Danh sách coupon |
| POST | `/api/v1/admin/coupons` | Tạo/chỉnh sửa (theo `code`) |
| DELETE | `/api/v1/admin/coupons?code=...` | Xóa coupon |

```bash
curl -X POST http://localhost:3000/api/v1/admin/coupons \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "code":"WELCOME10", "type":"percent", "value":10, "maxUses":100, "active":true,
        "plans":["pro","agency"], "expiresAt":"2026-12-31T00:00:00Z" }'
```
`type` ∈ `percent` (value 1-100) | `fixed` (value = số tiền + `currency`). `maxUses`=0 nghĩa là vô hạn.

## 4. Quản lý token & nhật ký (superadmin, xác thực phiên)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/admin/platform-api-tokens` | Danh sách token (không lộ token thô) |
| POST | `/api/admin/platform-api-tokens` | Tạo token `{ name, scopes? }` → trả `plaintext` một lần |
| DELETE | `/api/admin/platform-api-tokens?id=...` | Thu hồi token |
| GET | `/api/admin/admin-audit?limit=` | Nhật ký thao tác API (ai, làm gì, thành/bại) |

## 5. Ghi chú vận hành

- Mọi thao tác GHI qua API đều được **ghi nhật ký** (`admin-audit.json`): token, hành động, tài nguyên,
  IP, kết quả. Xem qua `GET /api/admin/admin-audit`.
- API dùng chung cơ chế lưu trữ với app (file JSON hoặc Postgres theo `STORAGE_DRIVER`).
- Bảo vệ owner: không khóa/đổi vai trò chủ sở hữu; xóa biz sẽ xóa dữ liệu workspace (không hoàn tác).
- Nên chạy sau HTTPS (đằng sau reverse proxy) để bảo vệ Bearer token trên đường truyền.
