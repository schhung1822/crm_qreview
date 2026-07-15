# Panduan Platform Admin API

Panduan langkah demi langkah untuk menggunakan admin API (list/baca/perbarui users, orders, biz, dan coupons).

---

## 1. Mulai cepat (3 langkah)

**Langkah 1 — Buat token.** Buka **Platform Admin → tab API** → masukkan sebuah nama (mis. `n8n-prod`), pilih
scope yang Anda butuhkan → **Create token**. Token akan terlihat seperti `sga_...` dan **hanya ditampilkan sekali** — salin dan
simpan di tempat yang rahasia (environment variable, secret manager). Anda tidak dapat melihatnya lagi.

**Langkah 2 — Panggil API** dengan token pada header:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**Langkah 3 — Tangani respons.** Keberhasilan mengembalikan `{ "ok": true, "data": {...} }`; error mengembalikan
`{ "ok": false, "error": { "code": "...", "message": "..." } }` dengan status HTTP yang sesuai.

> Base URL = domain Anda, mis. `{{BASE_URL}}`. Selalu panggil melalui **HTTPS** untuk melindungi token.

---

## 2. Autentikasi & scope

- Setiap request memerlukan header `Authorization: Bearer sga_...`.
- Token memiliki **scope** terbatas: `orders`, `users`, `biz`, `coupons`. Memanggil resource di luar scope → `403 forbidden`.
- Sebuah token **otomatis dinonaktifkan** jika pembuatnya dihapus dari `SUPERADMIN_EMAILS`.
- Rate limit: **120 request/menit/token** (melebihi → `429 rate_limited`).
- Cabut token kapan saja pada tab API (tombol **Revoke**) → token berhenti bekerja seketika.

**Rekomendasi keamanan**
- Satu token khusus per integrasi, diberi nama yang jelas, hanya memberikan scope minimum yang diperlukan.
- Jangan pernah menanamkan token di dalam kode/commit; gunakan environment variable.
- Rotasi token secara berkala (buat baru → perbarui integrasi → cabut yang lama).

---

## 3. Referensi endpoint (per resource)

Semua endpoint berada di bawah `{{BASE_URL}}/api/v1/admin/`. Setiap resource memerlukan scope yang sesuai. Endpoint list
mendukung `limit` (dibatasi di sisi server). Semua operasi write dicatat dalam audit-log.

### 3.1. Users — scope `users`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/users?q=&limit=` | List users. `q` memfilter berdasarkan email/nama; `limit` default 500 (maks 2000). |
| GET | `/users/{id}` | Satu user + subscription saat ini (plan, status, periode). |
| PATCH | `/users` | Perbarui seorang user. Body JSON selalu memiliki `action` + `userId`. |

**Nilai PATCH `action`** — body `{ "action": "…", "userId": "usr_123", … }`:

| action | Param tambahan | Efek |
|---|---|---|
| `update` | `name` | Mengubah nama tampilan |
| `activate` / `suspend` | — | Mengaktifkan / menonaktifkan akun (login) |
| `setPassword` | `password` (≥ 8 karakter) | Mereset password |
| `setPlan` | `plan`, `months?` (1/3/6/12) | Memberikan sebuah plan selama N bulan (default 1) |
| `cancelSubscription` | — | Membatalkan plan (mengirim email) |
| `addOverage` | `overage` (integer) | Menambah kredit artikel ekstra di luar plan |
| `setUnlimited` | `unlimited` (boolean) | Mengalihkan artikel tak terbatas |

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

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | List orders. Filter berdasarkan `status` dan/atau `userId`. |
| GET | `/orders/{id}` | Satu order (detail lengkap). |
| PATCH | `/orders` | Mengubah status: body `{ "id": "…", "status": "…" }`. |

`status` adalah salah satu dari `pending` · `paid` · `canceled` · `refunded`. Menetapkan `paid` untuk **pertama kali** mengaktifkan
plan/kredit dan mengirim email tanda terima **paymentReceived** (idempotent — `paid` kedua tidak melakukan apa-apa).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (organisasi) — scope `biz`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/biz?limit=` | List biz. |
| GET | `/biz/{id}` | Satu biz + daftar member. |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action` adalah salah satu dari `suspend` · `activate` · `transfer` (memerlukan `newOwnerId`) · `delete` (**tidak dapat dibatalkan** — menghapus
semua data workspace dari biz tersebut).

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/coupons` | List coupons. |
| GET | `/coupons/{code}` | Satu coupon berdasarkan code. |
| POST | `/coupons` | Membuat **atau** memperbarui sebuah coupon (dikunci berdasarkan `code`). |
| DELETE | `/coupons?code=…` | Menghapus sebuah coupon. |

Body POST: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = tak terbatas), `expiresAt?` (ISO 8601),
`plans?` (array of plan ids), `active?` (boolean).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. Skenario umum

### 4.1. Mengaktifkan plan secara manual setelah pelanggan mentransfer pembayaran
Pelanggan telah membayar tetapi webhook belum cocok → tandai order sebagai `paid`. Ini **mengaktifkan plan dan
mengirim email tanda terima** ke pelanggan (sama seperti melakukannya di UI).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. Memberikan/meningkatkan plan untuk sebuah akun
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. Membatalkan plan (mengirim email notifikasi ke pelanggan)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. Menangguhkan akun/biz yang melanggar
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. Contoh per bahasa

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

## 6. Email saat ada perubahan via API (penting)

API **menggunakan kembali logika yang persis sama dengan UI**, sehingga email tetap dikirim:

| Aksi API | Email yang dikirim |
|---|---|
| Order diset ke `paid` (pertama kali) | **paymentReceived** (tanda terima) + aktivasi plan + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Aksi biz | (tidak ada email — konsisten dengan UI) |

> Email hanya **benar-benar dikirim** ketika Platform Email **diaktifkan** dan SMTP/Gmail dikonfigurasi secara valid
> (Platform Admin → tab Email). Jika dinonaktifkan atau belum dikonfigurasi, aksi tetap berhasil tetapi tidak ada email yang dikirim.

---

## 7. Kode error

| HTTP | code | Arti & cara menangani |
|---|---|---|
| 401 | `unauthorized` | Token hilang/salah → periksa header `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Token tidak memiliki scope, atau pembuatnya bukan lagi superadmin |
| 400 | `invalid_params` | Body/parameter salah → periksa silang dokumentasi parameter |
| 404 | `not_found` | Order/user/biz/coupon tidak ditemukan berdasarkan id/code |
| 400 | `operation_failed` | Operasi ditolak (mis. menangguhkan/mengubah role owner) — baca `message` |
| 429 | `rate_limited` | Melebihi 120 req/menit → tunggu sesuai `message` lalu coba lagi |

**Tip:** selalu periksa `res.ok` (HTTP) ATAU field `ok` pada body; catat `error.code` untuk mengklasifikasikan.

---

## 8. Monitoring & audit

Setiap operasi WRITE via API dicatat (siapa/token, action, resource, IP, hasil).
Lihat via `GET /api/admin/admin-audit?limit=200` (terautentikasi dengan sesi superadmin).

---

## 9. FAQ

**Bagaimana jika saya kehilangan sebuah token?** Token tidak dapat dilihat lagi (hanya hash yang disimpan). Buat token baru, perbarui
integrasi, dan cabut yang lama.

**Apakah ada perbedaan antara token biz dan token ini?** Ya. Token biz (`sg_...`, `/api/v1/*`) untuk satu
biz individual; token ini (`sga_...`, `/api/v1/admin/*`) memiliki hak admin PLATFORM dan hanya dapat dibuat oleh superadmin.

**Apakah menetapkan sebuah order ke `paid` dua kali mengaktifkan/menagih dua kali?** Tidak. Hanya transisi PERTAMA ke `paid` yang mengaktifkannya
(idempotent).

**Bisakah penghapusan sebuah biz dibatalkan?** Tidak — menghapus sebuah biz menghapus semua data workspace dari biz tersebut.
