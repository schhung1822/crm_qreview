# Platform Admin API Guide

A step-by-step guide to using the admin API (list/read/update users, orders, biz, and coupons).

---

## 1. Quick start (3 steps)

**Step 1 — Create a token.** Go to **Platform Admin → API tab** → enter a name (e.g. `n8n-prod`), pick the
scopes you need → **Create token**. The token looks like `sga_...` and is **shown only once** — copy it and
store it somewhere secret (environment variable, secret manager). You cannot view it again.

**Step 2 — Call the API** with the token in the header:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**Step 3 — Handle the response.** Success returns `{ "ok": true, "data": {...} }`; errors return
`{ "ok": false, "error": { "code": "...", "message": "..." } }` with the matching HTTP status.

> Base URL = your domain, e.g. `{{BASE_URL}}`. Always call over **HTTPS** to protect the token.

---

## 2. Authentication & scopes

- Every request needs the header `Authorization: Bearer sga_...`.
- Tokens have limited **scopes**: `orders`, `users`, `biz`, `coupons`. Calling a resource outside the scope → `403 forbidden`.
- A token is **automatically disabled** if its creator is removed from `SUPERADMIN_EMAILS`.
- Rate limit: **120 requests/minute/token** (exceeding → `429 rate_limited`).
- Revoke a token anytime in the API tab (**Revoke** button) → the token stops working immediately.

**Security recommendations**
- One dedicated token per integration, clearly named, granting only the minimum scopes needed.
- Never embed tokens in code/commits; use environment variables.
- Rotate tokens periodically (create new → update integration → revoke old).

---

## 3. Endpoint reference (by resource)

All endpoints live under `{{BASE_URL}}/api/v1/admin/`. Each resource needs its matching scope. List endpoints
support `limit` (capped server-side). All write operations are audit-logged.

### 3.1. Users — scope `users`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?q=&limit=` | List users. `q` filters by email/name; `limit` default 500 (max 2000). |
| GET | `/users/{id}` | One user + current subscription (plan, status, period). |
| PATCH | `/users` | Update a user. JSON body always has `action` + `userId`. |

**PATCH `action` values** — body `{ "action": "…", "userId": "usr_123", … }`:

| action | Extra params | Effect |
|---|---|---|
| `update` | `name` | Change the display name |
| `activate` / `suspend` | — | Enable / disable the account (login) |
| `setPassword` | `password` (≥ 8 chars) | Reset the password |
| `setPlan` | `plan`, `months?` (1/3/6/12) | Grant a plan for N months (default 1) |
| `cancelSubscription` | — | Cancel the plan (sends an email) |
| `addOverage` | `overage` (integer) | Add extra article credits beyond the plan |
| `setUnlimited` | `unlimited` (boolean) | Toggle unlimited articles |

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

| Method | Endpoint | Description |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | List orders. Filter by `status` and/or `userId`. |
| GET | `/orders/{id}` | One order (full detail). |
| PATCH | `/orders` | Change status: body `{ "id": "…", "status": "…" }`. |

`status` is one of `pending` · `paid` · `canceled` · `refunded`. Setting `paid` for the **first time** activates
the plan/credits and sends the **paymentReceived** receipt email (idempotent — a second `paid` does nothing).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (organizations) — scope `biz`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/biz?limit=` | List biz. |
| GET | `/biz/{id}` | One biz + members list. |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action` is one of `suspend` · `activate` · `transfer` (requires `newOwnerId`) · `delete` (**irreversible** — removes
all workspace data of that biz).

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/coupons` | List coupons. |
| GET | `/coupons/{code}` | One coupon by code. |
| POST | `/coupons` | Create **or** update a coupon (keyed by `code`). |
| DELETE | `/coupons?code=…` | Delete a coupon. |

POST body: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = unlimited), `expiresAt?` (ISO 8601),
`plans?` (array of plan ids), `active?` (boolean).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. Common scenarios

### 4.1. Activate a plan manually after a customer transfers payment
The customer has paid but the webhook has not matched → mark the order `paid`. This **activates the plan and
sends a receipt email** to the customer (same as doing it in the UI).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. Grant/upgrade a plan for an account
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. Cancel a plan (sends a notification email to the customer)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. Suspend a violating account/biz
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. Examples by language

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

## 6. Emails on changes via the API (important)

The API **reuses the exact same logic as the UI**, so emails are still sent:

| API action | Email sent |
|---|---|
| Order set to `paid` (first time) | **paymentReceived** (receipt) + plan activation + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Biz actions | (no email — consistent with the UI) |

> Emails are only **actually sent** when Platform Email is **enabled** and SMTP/Gmail is validly configured
> (Platform Admin → Email tab). If disabled or unconfigured, the action still succeeds but no email is sent.

---

## 7. Error codes

| HTTP | code | Meaning & how to handle |
|---|---|---|
| 401 | `unauthorized` | Missing/wrong token → check the header `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Token lacks the scope, or the creator is no longer a superadmin |
| 400 | `invalid_params` | Wrong body/parameters → cross-check the parameter docs |
| 404 | `not_found` | Order/user/biz/coupon not found by id/code |
| 400 | `operation_failed` | Operation rejected (e.g. suspending/changing the owner's role) — read `message` |
| 429 | `rate_limited` | Exceeded 120 req/min → wait per `message` then retry |

**Tip:** always check `res.ok` (HTTP) OR the `ok` field in the body; log `error.code` to classify.

---

## 8. Monitoring & audit

Every WRITE operation via the API is logged (who/token, action, resource, IP, result).
View via `GET /api/admin/admin-audit?limit=200` (authenticated with a superadmin session).

---

## 9. FAQ

**What if I lose a token?** It cannot be viewed again (only a hash is stored). Create a new token, update the
integration, and revoke the old one.

**Is there a difference between a biz token and this token?** Yes. A biz token (`sg_...`, `/api/v1/*`) is for an
individual biz; this token (`sga_...`, `/api/v1/admin/*`) has PLATFORM admin rights and can only be created by a superadmin.

**Does setting an order to `paid` twice activate/charge twice?** No. Only the FIRST transition to `paid` activates
it (idempotent).

**Can deleting a biz be undone?** No — deleting a biz removes all of that biz's workspace data.
