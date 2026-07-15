# คู่มือ Platform Admin API

คู่มือทีละขั้นตอนสำหรับการใช้งาน admin API (แสดงรายการ/อ่าน/อัปเดต users, orders, biz และ coupons)

---

## 1. เริ่มต้นอย่างรวดเร็ว (3 ขั้นตอน)

**ขั้นตอนที่ 1 — สร้าง token** ไปที่ **Platform Admin → API tab** → กรอกชื่อ (เช่น `n8n-prod`) เลือก
scope ที่คุณต้องการ → **Create token** token จะมีลักษณะเป็น `sga_...` และ **จะแสดงเพียงครั้งเดียวเท่านั้น** — คัดลอกและ
เก็บไว้ในที่ปลอดภัย (environment variable, secret manager) คุณจะไม่สามารถดูมันได้อีก

**ขั้นตอนที่ 2 — เรียกใช้ API** โดยใส่ token ไว้ใน header:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**ขั้นตอนที่ 3 — จัดการกับ response** เมื่อสำเร็จจะคืนค่า `{ "ok": true, "data": {...} }`; เมื่อเกิดข้อผิดพลาดจะคืนค่า
`{ "ok": false, "error": { "code": "...", "message": "..." } }` พร้อมกับ HTTP status ที่ตรงกัน

> Base URL = โดเมนของคุณ เช่น `{{BASE_URL}}` เรียกใช้ผ่าน **HTTPS** เสมอเพื่อปกป้อง token

---

## 2. การยืนยันตัวตน (Authentication) และ scope

- ทุก request ต้องมี header `Authorization: Bearer sga_...`
- Token มี **scope** ที่จำกัด: `orders`, `users`, `biz`, `coupons` การเรียกใช้ resource ที่อยู่นอก scope → `403 forbidden`
- Token จะ **ถูกปิดใช้งานโดยอัตโนมัติ** หากผู้สร้างถูกลบออกจาก `SUPERADMIN_EMAILS`
- Rate limit: **120 requests/นาที/token** (หากเกิน → `429 rate_limited`)
- เพิกถอน token ได้ทุกเมื่อใน API tab (ปุ่ม **Revoke**) → token จะหยุดทำงานทันที

**คำแนะนำด้านความปลอดภัย**
- ใช้ token เฉพาะหนึ่งอันต่อการเชื่อมต่อหนึ่งรายการ ตั้งชื่อให้ชัดเจน และให้เฉพาะ scope ขั้นต่ำที่จำเป็น
- อย่าฝัง token ไว้ในโค้ด/commit เด็ดขาด; ให้ใช้ environment variable
- หมุนเวียน token เป็นระยะ (สร้างอันใหม่ → อัปเดตการเชื่อมต่อ → เพิกถอนอันเก่า)

---

## 3. เอกสารอ้างอิง Endpoint (แยกตาม resource)

Endpoint ทั้งหมดอยู่ภายใต้ `{{BASE_URL}}/api/v1/admin/` แต่ละ resource ต้องมี scope ที่ตรงกัน List endpoint
รองรับ `limit` (มีการจำกัดสูงสุดที่ฝั่งเซิร์ฟเวอร์) การดำเนินการเขียน (write) ทั้งหมดจะถูกบันทึกใน audit log

### 3.1. Users — scope `users`

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/users?q=&limit=` | แสดงรายการ users `q` กรองตาม email/name; `limit` ค่าเริ่มต้น 500 (สูงสุด 2000) |
| GET | `/users/{id}` | user หนึ่งราย + subscription ปัจจุบัน (plan, status, period) |
| PATCH | `/users` | อัปเดต user JSON body ต้องมี `action` + `userId` เสมอ |

**ค่าของ `action` สำหรับ PATCH** — body `{ "action": "…", "userId": "usr_123", … }`:

| action | พารามิเตอร์เพิ่มเติม | ผลลัพธ์ |
|---|---|---|
| `update` | `name` | เปลี่ยนชื่อที่แสดง |
| `activate` / `suspend` | — | เปิด / ปิดใช้งานบัญชี (การเข้าสู่ระบบ) |
| `setPassword` | `password` (≥ 8 ตัวอักษร) | รีเซ็ตรหัสผ่าน |
| `setPlan` | `plan`, `months?` (1/3/6/12) | มอบ plan เป็นเวลา N เดือน (ค่าเริ่มต้น 1) |
| `cancelSubscription` | — | ยกเลิก plan (ส่งอีเมล) |
| `addOverage` | `overage` (จำนวนเต็ม) | เพิ่ม credit บทความเพิ่มเติมนอกเหนือจาก plan |
| `setUnlimited` | `unlimited` (boolean) | เปิด/ปิดบทความแบบไม่จำกัด |

```bash
# List (search + limit)
curl "{{BASE_URL}}/api/v1/admin/users?q=gmail&limit=50" -H "Authorization: Bearer sga_..."
# One user
curl {{BASE_URL}}/api/v1/admin/users/usr_123 -H "Authorization: Bearer sga_..."
# Rename a user
curl -X PATCH {{BASE_URL}}/api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "action": "update", "userId": "usr_123", "name": "New name" }'
```

### 3.2. Orders — scope `orders`

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | แสดงรายการ orders กรองตาม `status` และ/หรือ `userId` |
| GET | `/orders/{id}` | order หนึ่งรายการ (รายละเอียดทั้งหมด) |
| PATCH | `/orders` | เปลี่ยน status: body `{ "id": "…", "status": "…" }` |

`status` เป็นหนึ่งใน `pending` · `paid` · `canceled` · `refunded` การตั้งค่า `paid` **เป็นครั้งแรก** จะเปิดใช้งาน
plan/credit และส่งอีเมลใบเสร็จ **paymentReceived** (idempotent — การตั้งค่า `paid` ครั้งที่สองจะไม่มีผลใดๆ)

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (องค์กร) — scope `biz`

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/biz?limit=` | แสดงรายการ biz |
| GET | `/biz/{id}` | biz หนึ่งราย + รายชื่อสมาชิก |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }` |

`action` เป็นหนึ่งใน `suspend` · `activate` · `transfer` (ต้องมี `newOwnerId`) · `delete` (**ไม่สามารถย้อนกลับได้** — ลบ
ข้อมูล workspace ทั้งหมดของ biz นั้น)

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/coupons` | แสดงรายการ coupons |
| GET | `/coupons/{code}` | coupon หนึ่งรายการตาม code |
| POST | `/coupons` | สร้าง **หรือ** อัปเดต coupon (อ้างอิงตาม `code`) |
| DELETE | `/coupons?code=…` | ลบ coupon |

POST body: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = ไม่จำกัด), `expiresAt?` (ISO 8601),
`plans?` (array ของ plan id), `active?` (boolean)

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. สถานการณ์ที่พบบ่อย

### 4.1. เปิดใช้งาน plan ด้วยตนเองหลังจากลูกค้าโอนเงินชำระ
ลูกค้าชำระเงินแล้วแต่ webhook ยังไม่จับคู่ → ทำเครื่องหมาย order เป็น `paid` การกระทำนี้จะ **เปิดใช้งาน plan และ
ส่งอีเมลใบเสร็จ** ให้ลูกค้า (เหมือนกับการทำใน UI)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. มอบ/อัปเกรด plan ให้กับบัญชี
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. ยกเลิก plan (ส่งอีเมลแจ้งเตือนไปยังลูกค้า)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. ระงับบัญชี/biz ที่ละเมิดกฎ
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. ตัวอย่างแยกตามภาษา

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

## 6. อีเมลเมื่อมีการเปลี่ยนแปลงผ่าน API (สำคัญ)

API **ใช้ตรรกะเดียวกันกับ UI ทุกประการ** ดังนั้นอีเมลจะยังคงถูกส่งอยู่:

| API action | อีเมลที่ส่ง |
|---|---|
| Order ตั้งเป็น `paid` (ครั้งแรก) | **paymentReceived** (ใบเสร็จ) + การเปิดใช้งาน plan + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Biz actions | (ไม่มีอีเมล — สอดคล้องกับ UI) |

> อีเมลจะ **ถูกส่งจริง** ก็ต่อเมื่อ Platform Email **เปิดใช้งาน** อยู่ และ SMTP/Gmail ได้รับการตั้งค่าอย่างถูกต้อง
> (Platform Admin → Email tab) หากปิดใช้งานหรือยังไม่ได้ตั้งค่า การกระทำก็ยังคงสำเร็จแต่จะไม่มีการส่งอีเมล

---

## 7. รหัสข้อผิดพลาด (Error codes)

| HTTP | code | ความหมาย & วิธีจัดการ |
|---|---|---|
| 401 | `unauthorized` | token หายไป/ไม่ถูกต้อง → ตรวจสอบ header `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Token ไม่มี scope นั้น หรือผู้สร้างไม่ได้เป็น superadmin อีกต่อไป |
| 400 | `invalid_params` | body/พารามิเตอร์ไม่ถูกต้อง → ตรวจสอบกับเอกสารพารามิเตอร์ |
| 404 | `not_found` | ไม่พบ order/user/biz/coupon ตาม id/code |
| 400 | `operation_failed` | การดำเนินการถูกปฏิเสธ (เช่น การระงับ/เปลี่ยน role ของเจ้าของ) — อ่าน `message` |
| 429 | `rate_limited` | เกิน 120 req/min → รอตาม `message` แล้วลองใหม่ |

**เคล็ดลับ:** ตรวจสอบ `res.ok` (HTTP) หรือฟิลด์ `ok` ใน body เสมอ; บันทึก `error.code` เพื่อจัดหมวดหมู่

---

## 8. การติดตาม (Monitoring) และ audit

การดำเนินการ WRITE ทุกครั้งผ่าน API จะถูกบันทึก (ใคร/token, action, resource, IP, ผลลัพธ์)
ดูได้ผ่าน `GET /api/admin/admin-audit?limit=200` (ยืนยันตัวตนด้วย session ของ superadmin)

---

## 9. คำถามที่พบบ่อย (FAQ)

**จะทำอย่างไรหากทำ token หาย?** ไม่สามารถดูได้อีก (จัดเก็บเฉพาะ hash เท่านั้น) ให้สร้าง token ใหม่ อัปเดต
การเชื่อมต่อ และเพิกถอนอันเก่า

**biz token กับ token นี้แตกต่างกันหรือไม่?** ใช่ biz token (`sg_...`, `/api/v1/*`) ใช้สำหรับ
biz แต่ละราย; token นี้ (`sga_...`, `/api/v1/admin/*`) มีสิทธิ์ระดับ PLATFORM admin และสร้างได้โดย superadmin เท่านั้น

**การตั้งค่า order เป็น `paid` สองครั้งจะเปิดใช้งาน/เรียกเก็บเงินสองครั้งหรือไม่?** ไม่ เฉพาะการเปลี่ยนสถานะเป็น `paid` ครั้งแรกเท่านั้นที่จะเปิดใช้งาน
(idempotent)

**การลบ biz สามารถย้อนกลับได้หรือไม่?** ไม่ได้ — การลบ biz จะลบข้อมูล workspace ทั้งหมดของ biz นั้น
