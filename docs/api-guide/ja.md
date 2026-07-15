# プラットフォーム管理者 API ガイド

管理者 API（ユーザー、注文、biz、クーポンの一覧取得・参照・更新）の使い方を段階的に説明します。

---

## 1. クイックスタート（3 ステップ）

**ステップ 1 — トークンを作成する。** **Platform Admin → API タブ** に移動し、名前を入力（例: `n8n-prod`）して、必要な
スコープを選択 → **Create token**。トークンは `sga_...` のような形式で、**一度しか表示されません** — コピーして
どこか安全な場所（環境変数、シークレットマネージャー）に保管してください。再度表示することはできません。

**ステップ 2 — API を呼び出す**（ヘッダーにトークンを付与）:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**ステップ 3 — レスポンスを処理する。** 成功時は `{ "ok": true, "data": {...} }` を返し、エラー時は
`{ "ok": false, "error": { "code": "...", "message": "..." } }` を対応する HTTP ステータスとともに返します。

> Base URL = あなたのドメイン、例: `{{BASE_URL}}`。トークンを保護するため、必ず **HTTPS** 経由で呼び出してください。

---

## 2. 認証とスコープ

- すべてのリクエストにヘッダー `Authorization: Bearer sga_...` が必要です。
- トークンには限定された **スコープ** があります: `orders`、`users`、`biz`、`coupons`。スコープ外のリソースを呼び出すと → `403 forbidden`。
- トークンは、作成者が `SUPERADMIN_EMAILS` から削除されると **自動的に無効化** されます。
- レート制限: **120 リクエスト/分/トークン**（超過すると → `429 rate_limited`）。
- トークンは API タブでいつでも失効させられます（**Revoke** ボタン）→ トークンは即座に機能しなくなります。

**セキュリティに関する推奨事項**
- 連携ごとに専用のトークンを 1 つ用意し、分かりやすい名前を付け、必要最小限のスコープのみを付与する。
- トークンをコードやコミットに埋め込まないこと。環境変数を使用する。
- トークンは定期的にローテーションする（新規作成 → 連携を更新 → 旧トークンを失効）。

---

## 3. エンドポイントリファレンス（リソース別）

すべてのエンドポイントは `{{BASE_URL}}/api/v1/admin/` 配下にあります。各リソースには対応するスコープが必要です。一覧取得エンドポイントは
`limit`（サーバー側で上限あり）をサポートします。すべての書き込み操作は監査ログに記録されます。

### 3.1. Users — スコープ `users`

| Method | Endpoint | 説明 |
|---|---|---|
| GET | `/users?q=&limit=` | ユーザー一覧。`q` はメール/名前でフィルタ。`limit` はデフォルト 500（最大 2000）。 |
| GET | `/users/{id}` | 単一ユーザー + 現在のサブスクリプション（プラン、ステータス、期間）。 |
| PATCH | `/users` | ユーザーを更新。JSON ボディには常に `action` + `userId` を含む。 |

**PATCH の `action` 値** — ボディ `{ "action": "…", "userId": "usr_123", … }`:

| action | 追加パラメータ | 効果 |
|---|---|---|
| `update` | `name` | 表示名を変更する |
| `activate` / `suspend` | — | アカウント（ログイン）を有効化 / 無効化する |
| `setPassword` | `password`（8 文字以上） | パスワードをリセットする |
| `setPlan` | `plan`、`months?`（1/3/6/12） | N か月分のプランを付与する（デフォルト 1） |
| `cancelSubscription` | — | プランをキャンセルする（メールを送信） |
| `addOverage` | `overage`（整数） | プランを超える追加記事クレジットを付与する |
| `setUnlimited` | `unlimited`（真偽値） | 記事無制限を切り替える |

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

### 3.2. Orders — スコープ `orders`

| Method | Endpoint | 説明 |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | 注文一覧。`status` および/または `userId` でフィルタ。 |
| GET | `/orders/{id}` | 単一注文（全詳細）。 |
| PATCH | `/orders` | ステータスを変更: ボディ `{ "id": "…", "status": "…" }`。 |

`status` は `pending` · `paid` · `canceled` · `refunded` のいずれかです。**初めて** `paid` に設定すると
プラン/クレジットが有効化され、**paymentReceived** の受領メールが送信されます（冪等 — 2 回目の `paid` は何もしません）。

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz（組織） — スコープ `biz`

| Method | Endpoint | 説明 |
|---|---|---|
| GET | `/biz?limit=` | biz 一覧。 |
| GET | `/biz/{id}` | 単一 biz + メンバー一覧。 |
| PATCH | `/biz` | ボディ `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`。 |

`action` は `suspend` · `activate` · `transfer`（`newOwnerId` が必要） · `delete`（**取り消し不可** — その biz の
すべてのワークスペースデータを削除）のいずれかです。

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — スコープ `coupons`

| Method | Endpoint | 説明 |
|---|---|---|
| GET | `/coupons` | クーポン一覧。 |
| GET | `/coupons/{code}` | コードで単一クーポンを取得。 |
| POST | `/coupons` | クーポンを作成 **または** 更新する（`code` をキーとする）。 |
| DELETE | `/coupons?code=…` | クーポンを削除する。 |

POST ボディ: `code`、`type`（`percent`/`fixed`）、`value`、`maxUses?`（0 = 無制限）、`expiresAt?`（ISO 8601）、
`plans?`（プラン ID の配列）、`active?`（真偽値）。

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. よくあるシナリオ

### 4.1. 顧客が入金した後に手動でプランを有効化する
顧客は支払い済みだが Webhook が照合されていない場合 → 注文を `paid` にマークします。これにより **プランが有効化され、
受領メールが顧客に送信されます**（UI で行うのと同じ）。
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. アカウントにプランを付与/アップグレードする
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. プランをキャンセルする（顧客に通知メールを送信）
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. 違反したアカウント/biz を停止する
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. 言語別の例

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

## 6. API 経由の変更に伴うメール（重要）

API は **UI とまったく同じロジックを再利用する** ため、メールは引き続き送信されます:

| API action | 送信されるメール |
|---|---|
| 注文を `paid` に設定（初回） | **paymentReceived**（受領） + プラン有効化 + Conversion API |
| ユーザー `cancelSubscription` | **subscriptionCanceled** |
| Biz の操作 | （メールなし — UI と一致） |

> メールが **実際に送信される** のは、Platform Email が **有効** で、SMTP/Gmail が正しく設定されている場合のみです
> （Platform Admin → Email タブ）。無効または未設定の場合、操作自体は成功しますがメールは送信されません。

---

## 7. エラーコード

| HTTP | code | 意味と対処方法 |
|---|---|---|
| 401 | `unauthorized` | トークンが欠落/誤り → ヘッダー `Authorization: Bearer sga_...` を確認 |
| 403 | `forbidden` | トークンにスコープがない、または作成者がスーパー管理者でなくなっている |
| 400 | `invalid_params` | ボディ/パラメータが誤り → パラメータのドキュメントと照合 |
| 404 | `not_found` | id/code で注文/ユーザー/biz/クーポンが見つからない |
| 400 | `operation_failed` | 操作が拒否された（例: オーナーの停止/ロール変更）— `message` を読む |
| 429 | `rate_limited` | 120 req/min を超過 → `message` に従って待機してから再試行 |

**ヒント:** 常に `res.ok`（HTTP）またはボディ内の `ok` フィールドを確認し、分類のために `error.code` をログに記録してください。

---

## 8. モニタリングと監査

API 経由のすべての書き込み（WRITE）操作はログに記録されます（実行者/トークン、action、リソース、IP、結果）。
`GET /api/admin/admin-audit?limit=200`（スーパー管理者セッションで認証）で確認できます。

---

## 9. FAQ

**トークンを紛失した場合は?** 再度表示することはできません（ハッシュのみ保存）。新しいトークンを作成し、連携を更新して、
古いトークンを失効させてください。

**biz トークンとこのトークンに違いはありますか?** はい。biz トークン（`sg_...`、`/api/v1/*`）は個々の biz 用です。
このトークン（`sga_...`、`/api/v1/admin/*`）はプラットフォーム管理者権限を持ち、スーパー管理者のみが作成できます。

**注文を 2 回 `paid` に設定すると、有効化/課金が 2 回行われますか?** いいえ。`paid` への最初の遷移のみが有効化を行います
（冪等）。

**biz の削除は元に戻せますか?** いいえ — biz を削除すると、その biz のすべてのワークスペースデータが削除されます。
