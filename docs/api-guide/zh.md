# 平台管理 API 指南

一份分步指南，介绍如何使用管理 API（列出/读取/更新用户、订单、biz 和优惠券）。

---

## 1. 快速开始（3 步）

**第 1 步 — 创建令牌。** 前往 **平台管理 → API 选项卡** → 输入名称（例如 `n8n-prod`），选择你需要的
scope → **Create token**。令牌形如 `sga_...`，且**仅显示一次** — 请复制并
将其存放在安全的地方（环境变量、密钥管理器）。你无法再次查看它。

**第 2 步 — 调用 API**，在请求头中携带令牌：
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**第 3 步 — 处理响应。** 成功时返回 `{ "ok": true, "data": {...} }`；出错时返回
`{ "ok": false, "error": { "code": "...", "message": "..." } }`，并附带相应的 HTTP 状态码。

> Base URL = 你的域名，例如 `{{BASE_URL}}`。请始终通过 **HTTPS** 调用以保护令牌。

---

## 2. 认证与 scope

- 每个请求都需要请求头 `Authorization: Bearer sga_...`。
- 令牌拥有受限的 **scope**：`orders`、`users`、`biz`、`coupons`。调用 scope 之外的资源 → `403 forbidden`。
- 如果令牌的创建者被从 `SUPERADMIN_EMAILS` 中移除，令牌会**自动被禁用**。
- 速率限制：**每个令牌每分钟 120 次请求**（超出 → `429 rate_limited`）。
- 你可以随时在 API 选项卡中吊销令牌（**Revoke** 按钮）→ 令牌会立即失效。

**安全建议**
- 每个集成使用一个专用令牌，命名清晰，仅授予所需的最小 scope。
- 切勿将令牌嵌入代码/提交记录中；请使用环境变量。
- 定期轮换令牌（创建新令牌 → 更新集成 → 吊销旧令牌）。

---

## 3. 端点参考（按资源）

所有端点都位于 `{{BASE_URL}}/api/v1/admin/` 下。每个资源都需要其对应的 scope。列表端点
支持 `limit`（服务端有上限）。所有写操作都会被审计记录。

### 3.1. Users — scope `users`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?q=&limit=` | 列出用户。`q` 按 email/name 过滤；`limit` 默认 500（最大 2000）。 |
| GET | `/users/{id}` | 单个用户 + 当前订阅（plan、status、周期）。 |
| PATCH | `/users` | 更新用户。JSON body 始终包含 `action` + `userId`。 |

**PATCH `action` 取值** — body `{ "action": "…", "userId": "usr_123", … }`：

| action | Extra params | Effect |
|---|---|---|
| `update` | `name` | 更改显示名称 |
| `activate` / `suspend` | — | 启用 / 禁用账户（登录） |
| `setPassword` | `password`（≥ 8 个字符） | 重置密码 |
| `setPlan` | `plan`、`months?`（1/3/6/12） | 授予某个 plan N 个月（默认 1） |
| `cancelSubscription` | — | 取消 plan（会发送一封邮件） |
| `addOverage` | `overage`（整数） | 在 plan 之外增加额外的文章额度 |
| `setUnlimited` | `unlimited`（布尔值） | 切换文章数量是否无限制 |

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
| GET | `/orders?status=&userId=&limit=` | 列出订单。按 `status` 和/或 `userId` 过滤。 |
| GET | `/orders/{id}` | 单个订单（完整详情）。 |
| PATCH | `/orders` | 更改状态：body `{ "id": "…", "status": "…" }`。 |

`status` 为 `pending` · `paid` · `canceled` · `refunded` 之一。**首次**将订单设为 `paid` 会激活
plan/额度，并发送 **paymentReceived** 收据邮件（幂等 — 第二次设为 `paid` 不会有任何影响）。

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz（组织）— scope `biz`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/biz?limit=` | 列出 biz。 |
| GET | `/biz/{id}` | 单个 biz + 成员列表。 |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`。 |

`action` 为 `suspend` · `activate` · `transfer`（需要 `newOwnerId`）· `delete`（**不可逆** — 会删除
该 biz 的所有工作区数据）之一。

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/coupons` | 列出优惠券。 |
| GET | `/coupons/{code}` | 按 code 查询单个优惠券。 |
| POST | `/coupons` | 创建**或**更新优惠券（以 `code` 为键）。 |
| DELETE | `/coupons?code=…` | 删除优惠券。 |

POST body：`code`、`type`（`percent`/`fixed`）、`value`、`maxUses?`（0 = 无限制）、`expiresAt?`（ISO 8601）、
`plans?`（plan id 数组）、`active?`（布尔值）。

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. 常见场景

### 4.1. 客户转账后手动激活 plan
客户已付款但 webhook 尚未匹配上 → 将订单标记为 `paid`。这会**激活 plan 并
向客户发送一封收据邮件**（与在 UI 中操作效果相同）。
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. 为某个账户授予/升级 plan
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. 取消 plan（会向客户发送一封通知邮件）
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. 封禁违规的账户/biz
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. 各语言示例

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

## 6. 通过 API 更改时发送的邮件（重要）

该 API **复用了与 UI 完全相同的逻辑**，因此邮件依然会被发送：

| API action | Email sent |
|---|---|
| 订单设为 `paid`（首次） | **paymentReceived**（收据）+ plan 激活 + Conversion API |
| 用户 `cancelSubscription` | **subscriptionCanceled** |
| Biz 操作 | （无邮件 — 与 UI 保持一致） |

> 只有在平台邮件功能**已启用**且 SMTP/Gmail 已正确配置时，邮件才会**实际发送**
> （平台管理 → Email 选项卡）。如果被禁用或未配置，操作仍会成功，但不会发送邮件。

---

## 7. 错误码

| HTTP | code | Meaning & how to handle |
|---|---|---|
| 401 | `unauthorized` | 缺少/错误的令牌 → 检查请求头 `Authorization: Bearer sga_...` |
| 403 | `forbidden` | 令牌缺少该 scope，或创建者已不再是超级管理员 |
| 400 | `invalid_params` | body/参数错误 → 对照参数文档核查 |
| 404 | `not_found` | 按 id/code 未找到订单/用户/biz/优惠券 |
| 400 | `operation_failed` | 操作被拒绝（例如封禁/更改所有者的角色）— 请阅读 `message` |
| 429 | `rate_limited` | 超过 120 次/分钟 → 按 `message` 等待后重试 |

**提示：** 始终检查 `res.ok`（HTTP）或 body 中的 `ok` 字段；记录 `error.code` 以便分类。

---

## 8. 监控与审计

通过 API 进行的每个写操作都会被记录（操作者/令牌、action、资源、IP、结果）。
可通过 `GET /api/admin/admin-audit?limit=200` 查看（需使用超级管理员会话进行认证）。

---

## 9. 常见问题

**如果我丢失了令牌怎么办？** 它无法再次查看（仅存储了哈希值）。请创建一个新令牌、更新
集成，并吊销旧令牌。

**biz 令牌和这个令牌有区别吗？** 有。biz 令牌（`sg_...`、`/api/v1/*`）用于
单个 biz；而这个令牌（`sga_...`、`/api/v1/admin/*`）拥有平台管理员权限，且只能由超级管理员创建。

**将订单设为 `paid` 两次会激活/扣费两次吗？** 不会。只有**首次**转为 `paid` 才会激活
（幂等）。

**删除 biz 可以撤销吗？** 不可以 — 删除 biz 会移除该 biz 的所有工作区数据。
