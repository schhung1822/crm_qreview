# Platform Admin API-Leitfaden

Eine Schritt-für-Schritt-Anleitung zur Nutzung der Admin-API (Benutzer, Bestellungen, Biz und Gutscheine auflisten/lesen/aktualisieren).

---

## 1. Schnellstart (3 Schritte)

**Schritt 1 — Ein Token erstellen.** Gehen Sie zu **Platform Admin → API-Tab** → geben Sie einen Namen ein (z. B. `n8n-prod`), wählen Sie die
benötigten Scopes aus → **Create token**. Das Token sieht aus wie `sga_...` und wird **nur einmal angezeigt** — kopieren Sie es und
bewahren Sie es an einem geheimen Ort auf (Umgebungsvariable, Secret-Manager). Sie können es nicht erneut ansehen.

**Schritt 2 — Die API aufrufen** mit dem Token im Header:
```bash
curl {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_xxxxxxxxxxxx"
```

**Schritt 3 — Die Antwort verarbeiten.** Bei Erfolg wird `{ "ok": true, "data": {...} }` zurückgegeben; Fehler geben
`{ "ok": false, "error": { "code": "...", "message": "..." } }` mit dem passenden HTTP-Status zurück.

> Base-URL = Ihre Domain, z. B. `{{BASE_URL}}`. Rufen Sie die API immer über **HTTPS** auf, um das Token zu schützen.

---

## 2. Authentifizierung & Scopes

- Jede Anfrage benötigt den Header `Authorization: Bearer sga_...`.
- Tokens haben eingeschränkte **Scopes**: `orders`, `users`, `biz`, `coupons`. Der Zugriff auf eine Ressource außerhalb des Scopes → `403 forbidden`.
- Ein Token wird **automatisch deaktiviert**, wenn sein Ersteller aus `SUPERADMIN_EMAILS` entfernt wird.
- Ratenbegrenzung: **120 Anfragen/Minute/Token** (bei Überschreitung → `429 rate_limited`).
- Widerrufen Sie ein Token jederzeit im API-Tab (Schaltfläche **Revoke**) → das Token funktioniert sofort nicht mehr.

**Sicherheitsempfehlungen**
- Ein dediziertes Token pro Integration, klar benannt, das nur die minimal benötigten Scopes gewährt.
- Betten Sie Tokens niemals in Code/Commits ein; verwenden Sie Umgebungsvariablen.
- Rotieren Sie Tokens regelmäßig (neues erstellen → Integration aktualisieren → altes widerrufen).

---

## 3. Endpoint-Referenz (nach Ressource)

Alle Endpoints befinden sich unter `{{BASE_URL}}/api/v1/admin/`. Jede Ressource benötigt ihren passenden Scope. List-Endpoints
unterstützen `limit` (serverseitig begrenzt). Alle Schreiboperationen werden im Audit-Log protokolliert.

### 3.1. Users — Scope `users`

| Method | Endpoint | Beschreibung |
|---|---|---|
| GET | `/users?q=&limit=` | Benutzer auflisten. `q` filtert nach E-Mail/Name; `limit` Standard 500 (max. 2000). |
| GET | `/users/{id}` | Ein Benutzer + aktuelles Abonnement (Plan, Status, Zeitraum). |
| PATCH | `/users` | Einen Benutzer aktualisieren. Der JSON-Body enthält immer `action` + `userId`. |

**PATCH `action`-Werte** — Body `{ "action": "…", "userId": "usr_123", … }`:

| action | Zusätzliche Parameter | Effekt |
|---|---|---|
| `update` | `name` | Den Anzeigenamen ändern |
| `activate` / `suspend` | — | Das Konto aktivieren / deaktivieren (Login) |
| `setPassword` | `password` (≥ 8 Zeichen) | Das Passwort zurücksetzen |
| `setPlan` | `plan`, `months?` (1/3/6/12) | Einen Plan für N Monate gewähren (Standard 1) |
| `cancelSubscription` | — | Den Plan kündigen (sendet eine E-Mail) |
| `addOverage` | `overage` (Ganzzahl) | Zusätzliche Artikel-Credits über den Plan hinaus hinzufügen |
| `setUnlimited` | `unlimited` (boolean) | Unbegrenzte Artikel umschalten |

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

### 3.2. Orders — Scope `orders`

| Method | Endpoint | Beschreibung |
|---|---|---|
| GET | `/orders?status=&userId=&limit=` | Bestellungen auflisten. Filtern nach `status` und/oder `userId`. |
| GET | `/orders/{id}` | Eine Bestellung (vollständige Details). |
| PATCH | `/orders` | Status ändern: Body `{ "id": "…", "status": "…" }`. |

`status` ist eines von `pending` · `paid` · `canceled` · `refunded`. Das **erstmalige** Setzen von `paid` aktiviert
den Plan/die Credits und sendet die **paymentReceived**-Beleg-E-Mail (idempotent — ein zweites `paid` bewirkt nichts).

```bash
curl {{BASE_URL}}/api/v1/admin/orders/ord_abc123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 3.3. Biz (Organisationen) — Scope `biz`

| Method | Endpoint | Beschreibung |
|---|---|---|
| GET | `/biz?limit=` | Biz auflisten. |
| GET | `/biz/{id}` | Ein Biz + Mitgliederliste. |
| PATCH | `/biz` | Body `{ "bizId": "…", "action": "…", "newOwnerId"?: "…" }`. |

`action` ist eines von `suspend` · `activate` · `transfer` (erfordert `newOwnerId`) · `delete` (**unumkehrbar** — entfernt
alle Workspace-Daten dieses Biz).

```bash
curl {{BASE_URL}}/api/v1/admin/biz/biz_123 -H "Authorization: Bearer sga_..."
curl -X PATCH {{BASE_URL}}/api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

### 3.4. Coupons — Scope `coupons`

| Method | Endpoint | Beschreibung |
|---|---|---|
| GET | `/coupons` | Gutscheine auflisten. |
| GET | `/coupons/{code}` | Ein Gutschein nach Code. |
| POST | `/coupons` | Einen Gutschein erstellen **oder** aktualisieren (referenziert über `code`). |
| DELETE | `/coupons?code=…` | Einen Gutschein löschen. |

POST-Body: `code`, `type` (`percent`/`fixed`), `value`, `maxUses?` (0 = unbegrenzt), `expiresAt?` (ISO 8601),
`plans?` (Array von Plan-IDs), `active?` (boolean).

```bash
curl {{BASE_URL}}/api/v1/admin/coupons/TET2026 -H "Authorization: Bearer sga_..."
curl -X POST {{BASE_URL}}/api/v1/admin/coupons -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" \
  -d '{ "code":"TET2026", "type":"percent", "value":20, "maxUses":500,
        "plans":["pro","agency"], "expiresAt":"2026-02-28T00:00:00Z", "active":true }'
```

---

## 4. Häufige Szenarien

### 4.1. Einen Plan manuell aktivieren, nachdem ein Kunde die Zahlung überwiesen hat
Der Kunde hat bezahlt, aber der Webhook hat keine Zuordnung gefunden → markieren Sie die Bestellung als `paid`. Dies **aktiviert den Plan und
sendet eine Beleg-E-Mail** an den Kunden (genauso wie in der UI).
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/orders \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "id": "ord_abc123", "status": "paid" }'
```

### 4.2. Einen Plan für ein Konto gewähren/upgraden
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "setPlan", "userId": "usr_123", "plan": "pro", "months": 3 }'
```

### 4.3. Einen Plan kündigen (sendet eine Benachrichtigungs-E-Mail an den Kunden)
```bash
curl -X PATCH {{BASE_URL}}/api/v1/admin/users \
  -H "Authorization: Bearer sga_..." -H "Content-Type: application/json" \
  -d '{ "action": "cancelSubscription", "userId": "usr_123" }'
```

### 4.4. Ein verstoßendes Konto/Biz sperren
```bash
# Suspend a user
curl -X PATCH .../api/v1/admin/users -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "action": "suspend", "userId": "usr_123" }'
# Suspend a biz
curl -X PATCH .../api/v1/admin/biz -H "Authorization: Bearer sga_..." \
  -H "Content-Type: application/json" -d '{ "bizId": "biz_123", "action": "suspend" }'
```

---

## 5. Beispiele nach Sprache

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

## 6. E-Mails bei Änderungen über die API (wichtig)

Die API **verwendet exakt dieselbe Logik wie die UI**, sodass E-Mails weiterhin gesendet werden:

| API-action | Gesendete E-Mail |
|---|---|
| Bestellung auf `paid` gesetzt (erstes Mal) | **paymentReceived** (Beleg) + Planaktivierung + Conversion API |
| Benutzer `cancelSubscription` | **subscriptionCanceled** |
| Biz-Aktionen | (keine E-Mail — konsistent mit der UI) |

> E-Mails werden nur **tatsächlich gesendet**, wenn Platform Email **aktiviert** und SMTP/Gmail gültig konfiguriert ist
> (Platform Admin → Email-Tab). Ist dies deaktiviert oder nicht konfiguriert, ist die Aktion dennoch erfolgreich, aber es wird keine E-Mail gesendet.

---

## 7. Fehlercodes

| HTTP | code | Bedeutung & Handhabung |
|---|---|---|
| 401 | `unauthorized` | Fehlendes/falsches Token → prüfen Sie den Header `Authorization: Bearer sga_...` |
| 403 | `forbidden` | Dem Token fehlt der Scope, oder der Ersteller ist kein Superadmin mehr |
| 400 | `invalid_params` | Falscher Body/falsche Parameter → gleichen Sie die Parameter-Dokumentation ab |
| 404 | `not_found` | Bestellung/Benutzer/Biz/Gutschein anhand von id/code nicht gefunden |
| 400 | `operation_failed` | Operation abgelehnt (z. B. Sperren/Ändern der Rolle des Eigentümers) — lesen Sie `message` |
| 429 | `rate_limited` | 120 Anfragen/Min. überschritten → warten Sie gemäß `message` und versuchen Sie es erneut |

**Tipp:** Prüfen Sie immer `res.ok` (HTTP) ODER das Feld `ok` im Body; protokollieren Sie `error.code` zur Klassifizierung.

---

## 8. Überwachung & Audit

Jede WRITE-Operation über die API wird protokolliert (Wer/Token, Aktion, Ressource, IP, Ergebnis).
Ansicht über `GET /api/admin/admin-audit?limit=200` (authentifiziert mit einer Superadmin-Sitzung).

---

## 9. FAQ

**Was, wenn ich ein Token verliere?** Es kann nicht erneut angesehen werden (nur ein Hash wird gespeichert). Erstellen Sie ein neues Token, aktualisieren Sie die
Integration und widerrufen Sie das alte.

**Gibt es einen Unterschied zwischen einem Biz-Token und diesem Token?** Ja. Ein Biz-Token (`sg_...`, `/api/v1/*`) ist für ein
einzelnes Biz; dieses Token (`sga_...`, `/api/v1/admin/*`) hat PLATTFORM-Adminrechte und kann nur von einem Superadmin erstellt werden.

**Aktiviert/berechnet das zweimalige Setzen einer Bestellung auf `paid` doppelt?** Nein. Nur der ERSTE Übergang zu `paid` aktiviert
sie (idempotent).

**Kann das Löschen eines Biz rückgängig gemacht werden?** Nein — das Löschen eines Biz entfernt alle Workspace-Daten dieses Biz.
