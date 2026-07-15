# Guide de l'API Platform Admin

Un guide pas à pas pour utiliser l'API admin (lister/lire/mettre à jour les utilisateurs, commandes, biz et coupons).

---

## 1. Démarrage rapide (3 étapes)

**Étape 1 — Créer un token.** Rendez-vous dans **Platform Admin → onglet API** → saisissez un nom (par ex. `n8n-prod`), choisissez les
scopes dont vous avez besoin → **Create token**. Le token ressemble à `sga_...` et n'est **affiché qu'une seule fois** — copiez-le et
stockez-le dans un endroit secret (variable d'environnement, gestionnaire de secrets). Vous ne pourrez plus le consulter par la suite.

**Étape 2 — Appeler l'API** avec le token dans l'en-tête :
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**Étape 3 — Traiter la réponse.** En cas de succès, le retour est `{ "ok": true, "data": {...} }` ; en cas d'erreur, le retour est
`{ "ok": false, "error": { "code": "...", "message": "..." } }` avec le statut HTTP correspondant.

> URL de base = votre domaine, par ex. `{{BASE_URL}}`. Appelez toujours en **HTTPS** pour protéger le token.

---

## 2. Authentification et scopes

- Chaque requête nécessite l'en-tête `Authorization: Bearer sga_...`.
- Les tokens ont des **scopes** limités : `orders`, `users`, `biz`, `coupons`. Appeler une ressource en dehors du scope → `403 forbidden`.
- Un token est **automatiquement désactivé** si son créateur est retiré de `SUPERADMIN_EMAILS`.
- Limite de débit : **120 requêtes/minute/token** (dépassement → `429 rate_limited`).
- Révoquez un token à tout moment dans l'onglet API (bouton **Revoke**) → le token cesse de fonctionner immédiatement.

**Recommandations de sécurité**
- Un token dédié par intégration, clairement nommé, n'accordant que le minimum de scopes nécessaires.
- N'intégrez jamais de tokens dans le code/les commits ; utilisez des variables d'environnement.
- Effectuez une rotation périodique des tokens (créer un nouveau → mettre à jour l'intégration → révoquer l'ancien).

---

## 3. Référence des endpoints (par ressource)

Tous les endpoints se trouvent sous `{{BASE_URL}}/api/v1/admin/`. Chaque ressource nécessite le scope correspondant. Les endpoints de listing
prennent en charge `limit` (plafonné côté serveur). Toutes les opérations d'écriture sont enregistrées dans le journal d'audit.

### 3.1. Users — scope `users`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?q=&limit=` | Lister les utilisateurs. `q` filtre par email/nom ; `limit` par défaut 500 (max 2000). |
| GET | `/users/{id}` | Un utilisateur + abonnement en cours (plan, statut, période). |
| PATCH | `/users` | Mettre à jour un utilisateur. Le corps JSON contient toujours `action` + `userId`. |

**Valeurs de `action` pour PATCH** — corps `{ "action": "…", "userId": "usr_123", … }` :

| action | Paramètres supplémentaires | Effet |
|---|---|---|
| `update` | `name` | Modifier le nom d'affichage |
| `activate` / `suspend` | — | Activer / désactiver le compte (connexion) |
| `setPassword` | `password` (≥ 8 caractères) | Réinitialiser le mot de passe |
| `setPlan` | `plan`, `months?` (1/3/6/12) | Accorder un plan pour N mois (par défaut 1) |
| `cancelSubscription` | — | Annuler le plan (envoie un email) |
| `addOverage` | `overage` (entier) | Ajouter des crédits d'articles supplémentaires au-delà du plan |
| `setUnlimited` | `unlimited` (booléen) | Basculer les articles illimités |

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
| GET | `/orders?status=&userId=&limit=` | Lister les commandes. Filtrer par `status` et/ou `userId`. |
| GET | `/orders/{id}` | Une commande (détail complet). |
| PATCH | `/orders` | Modifier le statut : corps `{ "id": "…", "status": "…" }`. |

`status` prend l'une des valeurs `pending` · `paid` · `canceled` · `refunded`. Définir `paid` pour la **première fois** active
le plan/les crédits et envoie l'email de reçu **paymentReceived** (idempotent — un second `paid` n'a aucun effet).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (organisations) — scope `biz`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/biz?limit=` | Lister les biz. |
| GET | `/biz/{id}` | Un biz + liste des membres. |
| PATCH | `/biz` | Corps `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action` prend l'une des valeurs `suspend` · `activate` · `transfer` (nécessite `newOwnerId`) · `delete` (**irréversible** — supprime
toutes les données du workspace de ce biz).

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — scope `coupons`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/coupons` | Lister les coupons. |
| GET | `/coupons/{code}` | Un coupon par code. |
| POST | `/coupons` | Créer **ou** mettre à jour un coupon (indexé par `code`). |
| DELETE | `/coupons?code=…` | Supprimer un coupon. |

Corps du POST : `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = illimité), `expiresAt?` (ISO 8601),
`plans?` (tableau d'ids de plans), `active?` (booléen).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. Scénarios courants

### 4.1. Activer un plan manuellement après qu'un client a effectué un virement
Le client a payé mais le webhook n'a pas fait la correspondance → marquez la commande comme `paid`. Cela **active le plan et
envoie un email de reçu** au client (comme le faire dans l'interface).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. Accorder/mettre à niveau un plan pour un compte
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. Annuler un plan (envoie un email de notification au client)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. Suspendre un compte/biz en infraction
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. Exemples par langage

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

## 6. Emails lors des modifications via l'API (important)

L'API **réutilise exactement la même logique que l'interface**, les emails sont donc toujours envoyés :

| API action | Email envoyé |
|---|---|
| Commande passée à `paid` (première fois) | **paymentReceived** (reçu) + activation du plan + Conversion API |
| User `cancelSubscription` | **subscriptionCanceled** |
| Actions Biz | (aucun email — cohérent avec l'interface) |

> Les emails ne sont **réellement envoyés** que lorsque Platform Email est **activé** et que SMTP/Gmail est correctement configuré
> (Platform Admin → onglet Email). S'il est désactivé ou non configuré, l'action réussit tout de même mais aucun email n'est envoyé.

---

## 7. Codes d'erreur

| HTTP | code | Signification et traitement |
|---|---|---|
| 401 | `unauthorized` | Token manquant/incorrect → vérifiez l'en-tête `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Le token n'a pas le scope, ou le créateur n'est plus superadmin |
| 400 | `invalid_params` | Corps/paramètres incorrects → recoupez avec la documentation des paramètres |
| 404 | `not_found` | Commande/utilisateur/biz/coupon introuvable par id/code |
| 400 | `operation_failed` | Opération rejetée (par ex. suspendre/modifier le rôle du propriétaire) — lisez `message` |
| 429 | `rate_limited` | Dépassement de 120 req/min → attendez selon `message` puis réessayez |

**Astuce :** vérifiez toujours `res.ok` (HTTP) OU le champ `ok` dans le corps ; journalisez `error.code` pour classifier.

---

## 8. Surveillance et audit

Chaque opération d'ÉCRITURE via l'API est journalisée (qui/token, action, ressource, IP, résultat).
Consultez via `GET /api/admin/admin-audit?limit=200` (authentifié avec une session superadmin).

---

## 9. FAQ

**Que faire si je perds un token ?** Il ne peut plus être consulté (seul un hash est stocké). Créez un nouveau token, mettez à jour
l'intégration et révoquez l'ancien.

**Y a-t-il une différence entre un token biz et ce token ?** Oui. Un token biz (`sg_...`, `/api/v1/*`) concerne un
biz individuel ; ce token (`sga_...`, `/api/v1/admin/*`) dispose des droits d'administration de la PLATEFORME et ne peut être créé que par un superadmin.

**Définir une commande sur `paid` deux fois active/facture-t-il deux fois ?** Non. Seule la PREMIÈRE transition vers `paid` l'active
(idempotent).

**La suppression d'un biz peut-elle être annulée ?** Non — supprimer un biz supprime toutes les données de workspace de ce biz.
