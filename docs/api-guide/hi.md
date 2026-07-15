# प्लेटफ़ॉर्म एडमिन API गाइड

एडमिन API (users, orders, biz और coupons को list/read/update करना) उपयोग करने की चरण-दर-चरण गाइड।

---

## 1. त्वरित शुरुआत (3 चरण)

**चरण 1 — एक token बनाएँ।** **Platform Admin → API tab** पर जाएँ → एक नाम दर्ज करें (जैसे `n8n-prod`), अपनी आवश्यक
scopes चुनें → **Create token**। Token `sga_...` जैसा दिखता है और **केवल एक बार दिखाया जाता है** — इसे कॉपी करें और
किसी गुप्त स्थान (environment variable, secret manager) में संग्रहीत करें। आप इसे दोबारा नहीं देख सकते।

**चरण 2 — API को कॉल करें** header में token के साथ:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**चरण 3 — response को संभालें।** सफलता पर `{ "ok": true, "data": {...} }` लौटता है; त्रुटियों पर
`{ "ok": false, "error": { "code": "...", "message": "..." } }` संबंधित HTTP status के साथ लौटता है।

> Base URL = आपका domain, जैसे `{{BASE_URL}}`। token की सुरक्षा के लिए हमेशा **HTTPS** पर कॉल करें।

---

## 2. Authentication और scopes

- हर request को header `Authorization: Bearer sga_...` की आवश्यकता होती है।
- Tokens की सीमित **scopes** होती हैं: `orders`, `users`, `biz`, `coupons`। scope से बाहर किसी resource को कॉल करने पर → `403 forbidden`।
- यदि किसी token के निर्माता को `SUPERADMIN_EMAILS` से हटा दिया जाता है, तो वह token **स्वतः निष्क्रिय** हो जाता है।
- Rate limit: **120 requests/minute/token** (इससे अधिक होने पर → `429 rate_limited`)।
- किसी भी समय API tab में token को रद्द करें (**Revoke** बटन) → token तुरंत काम करना बंद कर देता है।

**सुरक्षा अनुशंसाएँ**
- प्रति integration एक समर्पित token, स्पष्ट रूप से नामित, केवल आवश्यक न्यूनतम scopes देते हुए।
- कभी भी tokens को code/commits में embed न करें; environment variables का उपयोग करें।
- Tokens को समय-समय पर घुमाएँ (नया बनाएँ → integration अपडेट करें → पुराना रद्द करें)।

---

## 3. Endpoint संदर्भ (resource के अनुसार)

सभी endpoints `{{BASE_URL}}/api/v1/admin/` के अंतर्गत रहते हैं। हर resource को उसकी संबंधित scope की आवश्यकता होती है। List endpoints
`limit` का समर्थन करते हैं (server-side पर सीमित)। सभी write operations audit-logged होते हैं।

### 3.1. Users — scope `users`

| Method | Endpoint | विवरण |
|---|---|---|
| GET | `/users?q=&limit=` | Users को list करें। `q` email/name से filter करता है; `limit` default 500 (max 2000)। |
| GET | `/users/{id}` | एक user + current subscription (plan, status, period)। |
| PATCH | `/users` | एक user को update करें। JSON body में हमेशा `action` + `userId` होता है। |

**PATCH `action` मान** — body `{ "action": "…", "userId": "usr_123", … }`:

| action | अतिरिक्त params | प्रभाव |
|---|---|---|
| `update` | `name` | display name बदलें |
| `activate` / `suspend` | — | account को सक्षम / अक्षम करें (login) |
| `setPassword` | `password` (≥ 8 chars) | password रीसेट करें |
| `setPlan` | `plan`, `months?` (1/3/6/12) | N महीनों के लिए एक plan दें (default 1) |
| `cancelSubscription` | — | plan रद्द करें (एक email भेजता है) |
| `addOverage` | `overage` (integer) | plan से अतिरिक्त article credits जोड़ें |
| `setUnlimited` | `unlimited` (boolean) | असीमित articles को toggle करें |

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

| Method | Endpoint | विवरण |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | Orders को list करें। `status` और/या `userId` से filter करें। |
| GET | `/orders/{id}` | एक order (पूर्ण विवरण)। |
| PATCH | `/orders` | status बदलें: body `{ "id": "…", "status": "…" }`। |

`status` इनमें से एक है `pending` · `paid` · `canceled` · `refunded`। **पहली बार** `paid` सेट करना
plan/credits को सक्रिय करता है और **paymentReceived** रसीद email भेजता है (idempotent — दूसरा `paid` कुछ नहीं करता)।

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (organizations) — scope `biz`

| Method | Endpoint | विवरण |
|---|---|---|
| GET | `/biz?limit=` | Biz को list करें। |
| GET | `/biz/{id}` | एक biz + members की सूची। |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`। |

`action` इनमें से एक है `suspend` · `activate` · `transfer` (`newOwnerId` की आवश्यकता) · `delete` (**अपरिवर्तनीय** — उस biz का
सारा workspace data हटा देता है)।

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | विवरण |
|---|---|---|
| GET | `/coupons` | Coupons को list करें। |
| GET | `/coupons/{code}` | code द्वारा एक coupon। |
| POST | `/coupons` | एक coupon बनाएँ **या** update करें (`code` द्वारा keyed)। |
| DELETE | `/coupons?code=…` | एक coupon हटाएँ। |

POST body: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = असीमित), `expiresAt?` (ISO 8601),
`plans?` (plan ids का array), `active?` (boolean)।

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. सामान्य परिदृश्य

### 4.1. ग्राहक द्वारा भुगतान transfer करने के बाद plan को मैन्युअल रूप से सक्रिय करना
ग्राहक ने भुगतान कर दिया है लेकिन webhook मेल नहीं खाया → order को `paid` के रूप में चिह्नित करें। यह **plan को सक्रिय करता है और
ग्राहक को रसीद email भेजता है** (UI में करने के समान)।
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. किसी account के लिए plan देना/upgrade करना
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. एक plan रद्द करना (ग्राहक को एक सूचना email भेजता है)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. उल्लंघन करने वाले account/biz को निलंबित करना
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. भाषा के अनुसार उदाहरण

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

## 6. API के माध्यम से बदलावों पर emails (महत्वपूर्ण)

API **UI के बिल्कुल समान logic का पुनः उपयोग करता है**, इसलिए emails अभी भी भेजे जाते हैं:

| API action | भेजा गया email |
|---|---|
| Order को `paid` सेट करना (पहली बार) | **paymentReceived** (रसीद) + plan सक्रियण + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Biz actions | (कोई email नहीं — UI के अनुरूप) |

> Emails तभी **वास्तव में भेजे जाते हैं** जब Platform Email **सक्षम** हो और SMTP/Gmail वैध रूप से कॉन्फ़िगर किया गया हो
> (Platform Admin → Email tab)। यदि अक्षम या अनकॉन्फ़िगर हो, तो action फिर भी सफल होता है लेकिन कोई email नहीं भेजा जाता।

---

## 7. Error codes

| HTTP | code | अर्थ और कैसे संभालें |
|---|---|---|
| 401 | `unauthorized` | गायब/गलत token → header `Authorization: Bearer sga_...` जाँचें |
| 403 | `forbidden` | Token में scope नहीं है, या निर्माता अब superadmin नहीं है |
| 400 | `invalid_params` | गलत body/parameters → parameter docs से मिलान करें |
| 404 | `not_found` | id/code द्वारा order/user/biz/coupon नहीं मिला |
| 400 | `operation_failed` | Operation अस्वीकृत (जैसे owner की भूमिका को निलंबित/बदलना) — `message` पढ़ें |
| 429 | `rate_limited` | 120 req/min से अधिक → `message` के अनुसार प्रतीक्षा करें फिर पुनः प्रयास करें |

**सुझाव:** हमेशा `res.ok` (HTTP) या body में `ok` फ़ील्ड जाँचें; वर्गीकृत करने के लिए `error.code` को log करें।

---

## 8. Monitoring और audit

API के माध्यम से हर WRITE operation log किया जाता है (कौन/token, action, resource, IP, परिणाम)।
`GET /api/admin/admin-audit?limit=200` (superadmin session के साथ authenticated) के माध्यम से देखें।

---

## 9. FAQ

**यदि मैं एक token खो दूँ तो क्या होगा?** इसे दोबारा नहीं देखा जा सकता (केवल एक hash संग्रहीत होता है)। एक नया token बनाएँ,
integration अपडेट करें, और पुराना रद्द करें।

**क्या biz token और इस token में कोई अंतर है?** हाँ। एक biz token (`sg_...`, `/api/v1/*`) एक
व्यक्तिगत biz के लिए है; यह token (`sga_...`, `/api/v1/admin/*`) के पास PLATFORM एडमिन अधिकार हैं और इसे केवल एक superadmin द्वारा बनाया जा सकता है।

**क्या किसी order को दो बार `paid` सेट करने से यह दो बार सक्रिय/चार्ज होता है?** नहीं। केवल पहला `paid` में परिवर्तन इसे सक्रिय करता है
(idempotent)।

**क्या किसी biz को हटाना पूर्ववत किया जा सकता है?** नहीं — किसी biz को हटाना उस biz का सारा workspace data हटा देता है।
