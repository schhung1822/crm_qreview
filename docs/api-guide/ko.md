# 플랫폼 관리자 API 가이드

관리자 API(사용자, 주문, biz, 쿠폰의 조회/읽기/수정)를 사용하는 단계별 가이드입니다.

---

## 1. 빠른 시작 (3단계)

**1단계 — 토큰 생성.** **Platform Admin → API 탭**으로 이동 → 이름을 입력하고(예: `n8n-prod`), 필요한
스코프를 선택 → **Create token**. 토큰은 `sga_...` 형태이며 **한 번만 표시됩니다** — 복사한 뒤
안전한 곳(환경 변수, 시크릿 매니저)에 보관하세요. 다시 확인할 수 없습니다.

**2단계 — API 호출**, 헤더에 토큰을 넣습니다:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**3단계 — 응답 처리.** 성공하면 `{ "ok": true, "data": {...} }`를 반환하고, 오류가 발생하면
해당 HTTP 상태와 함께 `{ "ok": false, "error": { "code": "...", "message": "..." } }`를 반환합니다.

> Base URL = 여러분의 도메인, 예: `{{BASE_URL}}`. 토큰을 보호하려면 항상 **HTTPS**로 호출하세요.

---

## 2. 인증 및 스코프

- 모든 요청에는 `Authorization: Bearer sga_...` 헤더가 필요합니다.
- 토큰은 제한된 **스코프**를 가집니다: `orders`, `users`, `biz`, `coupons`. 스코프를 벗어난 리소스를 호출하면 → `403 forbidden`.
- 토큰 생성자가 `SUPERADMIN_EMAILS`에서 제거되면 토큰은 **자동으로 비활성화**됩니다.
- 속도 제한: **토큰당 분당 120회 요청**(초과 시 → `429 rate_limited`).
- API 탭에서 언제든지 토큰을 취소할 수 있으며(**Revoke** 버튼) → 토큰은 즉시 작동을 멈춥니다.

**보안 권장 사항**
- 연동마다 하나의 전용 토큰을 두고, 명확하게 이름을 지정하며, 필요한 최소한의 스코프만 부여하세요.
- 절대로 코드나 커밋에 토큰을 포함하지 말고, 환경 변수를 사용하세요.
- 토큰을 주기적으로 교체하세요(새로 생성 → 연동 업데이트 → 기존 토큰 취소).

---

## 3. 엔드포인트 레퍼런스 (리소스별)

모든 엔드포인트는 `{{BASE_URL}}/api/v1/admin/` 아래에 있습니다. 각 리소스에는 해당하는 스코프가 필요합니다. 목록(List) 엔드포인트는
`limit`을 지원합니다(서버 측에서 상한이 적용됨). 모든 쓰기(write) 작업은 감사 로그에 기록됩니다.

### 3.1. Users — 스코프 `users`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?q=&limit=` | 사용자 목록. `q`는 이메일/이름으로 필터링, `limit` 기본값 500(최대 2000). |
| GET | `/users/{id}` | 사용자 1명 + 현재 구독(plan, status, period). |
| PATCH | `/users` | 사용자 수정. JSON 본문에는 항상 `action` + `userId`가 있습니다. |

**PATCH `action` 값** — 본문 `{ "action": "…", "userId": "usr_123", … }`:

| action | Extra params | Effect |
|---|---|---|
| `update` | `name` | 표시 이름 변경 |
| `activate` / `suspend` | — | 계정(로그인) 활성화 / 비활성화 |
| `setPassword` | `password` (≥ 8 chars) | 비밀번호 재설정 |
| `setPlan` | `plan`, `months?` (1/3/6/12) | N개월 동안 플랜 부여(기본 1) |
| `cancelSubscription` | — | 플랜 취소(이메일 발송) |
| `addOverage` | `overage` (integer) | 플랜 이외의 추가 아티클 크레딧 부여 |
| `setUnlimited` | `unlimited` (boolean) | 무제한 아티클 토글 |

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

### 3.2. Orders — 스코프 `orders`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | 주문 목록. `status` 및/또는 `userId`로 필터링. |
| GET | `/orders/{id}` | 주문 1건(전체 상세). |
| PATCH | `/orders` | 상태 변경: 본문 `{ "id": "…", "status": "…" }`. |

`status`는 `pending` · `paid` · `canceled` · `refunded` 중 하나입니다. **처음으로** `paid`로 설정하면
플랜/크레딧이 활성화되고 **paymentReceived** 영수증 이메일이 발송됩니다(멱등적 — 두 번째 `paid`는 아무 작업도 하지 않음).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (조직) — 스코프 `biz`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/biz?limit=` | biz 목록. |
| GET | `/biz/{id}` | biz 1건 + 멤버 목록. |
| PATCH | `/biz` | 본문 `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action`은 `suspend` · `activate` · `transfer`(`newOwnerId` 필요) · `delete`(**되돌릴 수 없음** — 해당 biz의
모든 워크스페이스 데이터를 삭제함) 중 하나입니다.

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — 스코프 `coupons`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/coupons` | 쿠폰 목록. |
| GET | `/coupons/{code}` | 코드로 쿠폰 1건 조회. |
| POST | `/coupons` | 쿠폰 생성 **또는** 수정(`code` 기준). |
| DELETE | `/coupons?code=…` | 쿠폰 삭제. |

POST 본문: `code`, `type`(`percent`/`fixed`), `value`, `maxUses?`(0 = 무제한), `expiresAt?`(ISO 8601),
`plans?`(플랜 id 배열), `active?`(boolean).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. 일반적인 시나리오

### 4.1. 고객이 결제를 이체한 후 수동으로 플랜 활성화하기
고객은 결제했지만 웹훅이 매칭되지 않은 경우 → 주문을 `paid`로 표시합니다. 이렇게 하면 **플랜이 활성화되고
고객에게 영수증 이메일이 발송됩니다**(UI에서 하는 것과 동일).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. 계정에 플랜 부여/업그레이드하기
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. 플랜 취소하기(고객에게 알림 이메일 발송)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. 위반한 계정/biz 정지하기
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. 언어별 예제

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

## 6. API를 통한 변경 시 발송되는 이메일 (중요)

API는 **UI와 정확히 동일한 로직을 재사용**하므로 이메일은 그대로 발송됩니다:

| API action | Email sent |
|---|---|
| 주문을 `paid`로 설정(처음) | **paymentReceived**(영수증) + 플랜 활성화 + Conversion API |
| 사용자 `cancelSubscription` | **subscriptionCanceled** |
| Biz 작업 | (이메일 없음 — UI와 일관됨) |

> 이메일은 Platform Email이 **활성화**되어 있고 SMTP/Gmail이 유효하게 구성된 경우에만 **실제로 발송됩니다**
> (Platform Admin → Email 탭). 비활성화되었거나 구성되지 않은 경우, 작업은 여전히 성공하지만 이메일은 발송되지 않습니다.

---

## 7. 오류 코드

| HTTP | code | Meaning & how to handle |
|---|---|---|
| 401 | `unauthorized` | 토큰 누락/오류 → 헤더 `Authorization: Bearer sga_...` 확인 |
| 403 | `forbidden` | 토큰에 스코프가 없거나, 생성자가 더 이상 슈퍼관리자가 아님 |
| 400 | `invalid_params` | 잘못된 본문/파라미터 → 파라미터 문서와 대조 확인 |
| 404 | `not_found` | id/code로 주문/사용자/biz/쿠폰을 찾을 수 없음 |
| 400 | `operation_failed` | 작업이 거부됨(예: 소유자의 역할 정지/변경) — `message`를 확인 |
| 429 | `rate_limited` | 분당 120회 초과 → `message`에 따라 대기 후 재시도 |

**팁:** 항상 `res.ok`(HTTP) 또는 본문의 `ok` 필드를 확인하고, `error.code`를 로깅하여 분류하세요.

---

## 8. 모니터링 및 감사

API를 통한 모든 쓰기(WRITE) 작업은 로그로 기록됩니다(수행자/토큰, action, 리소스, IP, 결과).
`GET /api/admin/admin-audit?limit=200`으로 조회하세요(슈퍼관리자 세션으로 인증).

---

## 9. FAQ

**토큰을 잃어버리면 어떻게 하나요?** 다시 확인할 수 없습니다(해시만 저장됨). 새 토큰을 생성하고, 연동을
업데이트한 뒤, 기존 토큰을 취소하세요.

**biz 토큰과 이 토큰의 차이가 있나요?** 네. biz 토큰(`sg_...`, `/api/v1/*`)은
개별 biz용입니다. 이 토큰(`sga_...`, `/api/v1/admin/*`)은 플랫폼(PLATFORM) 관리자 권한을 가지며 슈퍼관리자만 생성할 수 있습니다.

**주문을 `paid`로 두 번 설정하면 두 번 활성화/청구되나요?** 아니요. 오직 처음(FIRST) `paid`로 전환될 때만
활성화됩니다(멱등적).

**biz 삭제를 되돌릴 수 있나요?** 아니요 — biz를 삭제하면 해당 biz의 모든 워크스페이스 데이터가 제거됩니다.
