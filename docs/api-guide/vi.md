# Hướng dẫn sử dụng API Quản trị nền tảng

Hướng dẫn từng bước để dùng API quản trị (liệt kê/đọc/cập nhật user, đơn hàng, biz, coupon).

---

## 1. Bắt đầu nhanh (3 bước)

**Bước 1 — Tạo token.** Vào **Quản trị nền tảng → tab API** → nhập tên (vd `n8n-prod`), chọn phạm vi
(scope) cần dùng → **Tạo token**. Token dạng `sga_...` **chỉ hiện một lần** — sao chép và lưu vào nơi
bí mật (biến môi trường, secret manager). Không xem lại được.

**Bước 2 — Gọi API** với token ở header:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**Bước 3 — Xử lý phản hồi.** Thành công trả `{ "ok": true, "data": {...} }`; lỗi trả
`{ "ok": false, "error": { "code": "...", "message": "..." } }` kèm mã HTTP tương ứng.

> Base URL = domain của bạn, vd `{{BASE_URL}}`. Luôn gọi qua **HTTPS** để bảo vệ token.

---

## 2. Xác thực & phạm vi

- Mọi request cần header `Authorization: Bearer sga_...`.
- Token có **scope** giới hạn: `orders`, `users`, `biz`, `coupons`. Gọi tài nguyên ngoài scope → `403 forbidden`.
- Token **tự vô hiệu** nếu người tạo bị gỡ khỏi `SUPERADMIN_EMAILS`.
- Giới hạn tần suất: **120 request/phút/token** (vượt → `429 rate_limited`).
- Thu hồi token bất cứ lúc nào ở tab API (nút **Thu hồi**) → token ngừng tác dụng ngay.

**Khuyến nghị bảo mật**
- Mỗi tích hợp một token riêng, đặt tên rõ ràng, chỉ cấp scope tối thiểu cần dùng.
- Không nhúng token vào code/commit; dùng biến môi trường.
- Định kỳ xoay token (tạo mới → cập nhật tích hợp → thu hồi cũ).

---

## 3. Tham chiếu endpoint (theo tài nguyên)

Mọi endpoint nằm dưới `{{BASE_URL}}/api/v1/admin/`. Mỗi tài nguyên cần đúng scope tương ứng. Các endpoint
danh sách nhận `limit` (server tự chặn tối đa). Mọi thao tác GHI đều được ghi nhật ký (audit).

### 3.1. Người dùng (users) — scope `users`

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/users?q=&limit=` | Danh sách user. `q` lọc theo email/tên; `limit` mặc định 500 (tối đa 2000). |
| GET | `/users/{id}` | Chi tiết 1 user + gói cước hiện tại (plan, trạng thái, kỳ hạn). |
| PATCH | `/users` | Cập nhật 1 user. Body JSON luôn có `action` + `userId`. |

**Các giá trị `action` của PATCH** — body `{ "action": "…", "userId": "usr_123", … }`:

| action | Tham số thêm | Tác dụng |
|---|---|---|
| `update` | `name` | Đổi tên hiển thị |
| `activate` / `suspend` | — | Mở / khóa tài khoản (đăng nhập) |
| `setPassword` | `password` (≥ 8 ký tự) | Đặt lại mật khẩu |
| `setPlan` | `plan`, `months?` (1/3/6/12) | Gán gói trong N tháng (mặc định 1) |
| `cancelSubscription` | — | Hủy gói (gửi email) |
| `addOverage` | `overage` (số nguyên) | Cộng thêm lượt bài vượt gói |
| `setUnlimited` | `unlimited` (boolean) | Bật/tắt không giới hạn bài |

```bash
# Danh sách (tìm + giới hạn)
curl "{{BASE_URL}}/api/v1/admin/users?q=gmail&limit=50" -H "Authorization: Bearer sga_..."
# Chi tiết 1 user
curl {{BASE_URL}}/api/v1/admin/users/usr_123 -H "Authorization: Bearer sga_..."
# Đổi tên user
curl -X PATCH {{BASE_URL}}/api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "action": "update", "userId": "usr_123", "name": "Tên mới" }'
```

### 3.2. Đơn hàng (orders) — scope `orders`

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | Danh sách đơn. Lọc theo `status` và/hoặc `userId`. |
| GET | `/orders/{id}` | Chi tiết 1 đơn (đầy đủ). |
| PATCH | `/orders` | Đổi trạng thái: body `{ "id": "…", "status": "…" }`. |

`status` thuộc `pending` · `paid` · `canceled` · `refunded`. Chuyển sang `paid` **lần đầu** sẽ kích hoạt
gói/lượt bài + gửi email biên nhận **paymentReceived** (idempotent — `paid` lần hai không làm gì).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (tổ chức) — scope `biz`

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/biz?limit=` | Danh sách biz. |
| GET | `/biz/{id}` | Chi tiết 1 biz + danh sách thành viên. |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action` thuộc `suspend` · `activate` · `transfer` (cần `newOwnerId`) · `delete` (**không hoàn tác** — xóa toàn
bộ dữ liệu workspace của biz đó).

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupon (coupons) — scope `coupons`

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/coupons` | Danh sách coupon. |
| GET | `/coupons/{code}` | Chi tiết 1 coupon theo mã. |
| POST | `/coupons` | Tạo **hoặc** cập nhật coupon (khóa theo `code`). |
| DELETE | `/coupons?code=…` | Xóa coupon. |

Body POST: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = không giới hạn), `expiresAt?` (ISO 8601),
`plans?` (mảng id gói), `active?` (boolean).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. Các kịch bản thường gặp

### 4.1. Kích hoạt gói thủ công sau khi khách chuyển khoản
Khách đã chuyển khoản nhưng webhook chưa khớp → đánh dấu đơn `paid`. Việc này **kích hoạt gói + gửi
email biên nhận** cho khách (giống thao tác trên giao diện).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. Tặng/nâng gói cho một tài khoản
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. Hủy gói (gửi email thông báo cho khách)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. Khóa tài khoản/biz vi phạm
```bash
# Khóa người dùng
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Tạm khóa biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. Ví dụ theo ngôn ngữ

### Node.js (fetch)
```js
const BASE = '{{BASE_URL}}';
const TOKEN = process.env.ADMIN_API_TOKEN; // sga_...

async function markPaid(orderId) {
  const res = await fetch(`${BASE}/api/v1/admin/orders`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: orderId, status: 'paid' }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json.data.order;
}
```

### Python (requests)
```python
import os, requests
BASE = "{{BASE_URL}}"
TOKEN = os.environ["ADMIN_API_TOKEN"]  # sga_...

r = requests.patch(
    f"{BASE}/api/v1/admin/users",
    headers={"Authorization": f"Bearer {TOKEN}"},
    json={"action": "setUnlimited", "userId": "usr_123", "unlimited": True},
    timeout=20,
)
data = r.json()
if not data["ok"]:
    raise RuntimeError(data["error"]["message"])
print(data["data"])
```

---

## 6. Email khi thay đổi qua API (quan trọng)

API **tái dùng đúng logic của giao diện**, nên email vẫn được gửi:

| Thao tác API | Email gửi |
|---|---|
| Đổi đơn sang `paid` (lần đầu) | **paymentReceived** (biên nhận) + kích hoạt gói + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Các thao tác biz | (không có email — nhất quán với giao diện) |

> Email chỉ **thực gửi** khi Email nền tảng đang **bật** và SMTP/Gmail đã cấu hình hợp lệ
> (Quản trị nền tảng → tab Email). Nếu tắt hoặc chưa cấu hình, thao tác vẫn thành công nhưng
> không có email.

---

## 7. Bảng mã lỗi

| HTTP | code | Ý nghĩa & cách xử lý |
|---|---|---|
| 401 | `unauthorized` | Thiếu/sai token → kiểm header `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Token thiếu scope, hoặc người tạo không còn superadmin |
| 400 | `invalid_params` | Body/tham số sai → đối chiếu tài liệu tham số |
| 404 | `not_found` | Không tìm thấy đơn/user/biz/coupon theo id/code |
| 400 | `operation_failed` | Thao tác bị từ chối (vd khóa/đổi vai trò chủ sở hữu) — đọc `message` |
| 429 | `rate_limited` | Vượt 120 req/phút → chờ theo `message` rồi thử lại |

**Mẹo:** luôn kiểm `res.ok` (HTTP) HOẶC trường `ok` trong body; log `error.code` để phân loại.

---

## 8. Theo dõi & kiểm toán

Mọi thao tác GHI qua API đều được ghi nhật ký (ai/token, hành động, tài nguyên, IP, kết quả).
Xem qua `GET /api/admin/admin-audit?limit=200` (xác thực bằng phiên superadmin).

---

## 9. Câu hỏi thường gặp

**Mất token thì sao?** Không xem lại được (chỉ lưu hash). Tạo token mới, cập nhật tích hợp, thu hồi token cũ.

**Có phân biệt token biz và token này không?** Có. Token biz (`sg_...`, `/api/v1/*`) dành cho từng biz;
token này (`sga_...`, `/api/v1/admin/*`) là quyền quản trị NỀN TẢNG, chỉ superadmin tạo được.

**Đổi đơn `paid` hai lần có kích hoạt/tính tiền hai lần không?** Không. Chỉ lần chuyển sang `paid`
ĐẦU TIÊN mới kích hoạt (idempotent).

**Xóa biz có hoàn tác được không?** Không — xóa biz sẽ xóa toàn bộ dữ liệu workspace của biz đó.
