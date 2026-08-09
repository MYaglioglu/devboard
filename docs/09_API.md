# API

REST-Schnittstelle des Backends. Basis-URL lokal: `http://localhost:3000`

---

## Konventionen

- **JSON** für Anfragen und Antworten
- **Statuscodes tragen Bedeutung** – sie werden von Maschinen gelesen, nicht nur von Menschen:
  `200` ok · `201` erzeugt · `400` ungültige Eingabe · `401` nicht angemeldet ·
  `403` angemeldet, aber nicht berechtigt · `404` nicht gefunden · `409` Konflikt ·
  `503` Dienst vorübergehend nicht verfügbar
- Eingaben werden mit **Zod** validiert, bevor sie den Service erreichen
- Fehler kommen in einheitlicher Form zurück (Exception Filter, ab Sprint 1)

---

## `GET /health`

Prüft, ob die Anwendung läuft **und** arbeitsfähig ist.

### Antwort · 200 OK

```json
{
  "status": "ok",
  "uptimeSeconds": 299,
  "timestamp": "2026-08-08T01:11:59.042Z",
  "checks": { "database": "up" }
}
```

### Antwort · 503 Service Unavailable

Wird geliefert, sobald eine Abhängigkeit ausgefallen ist – aktuell die Datenbank.

```json
{
  "statusCode": 503,
  "message": {
    "status": "degraded",
    "uptimeSeconds": 301,
    "timestamp": "2026-08-08T01:12:00.895Z",
    "checks": { "database": "down" }
  }
}
```

### Warum der Statuscode entscheidend ist

Ein Health-Check wird von Loadbalancern, Docker und Orchestratoren ausgewertet – und die lesen den
**Statuscode**, nicht den Text. Ein Endpoint, der immer `200` liefert und den Fehler nur im Body
erwähnt, sorgt dafür, dass eine defekte Instanz weiter Anfragen bekommt. Der Check ist dann
Dekoration.

### Liveness und Readiness

Zwei Fragen, die oft verwechselt werden:

| | Frage | Reaktion bei rot |
|---|---|---|
| **Liveness** | Läuft der Prozess überhaupt? | Neustart hilft |
| **Readiness** | Kann er Anfragen bedienen? | Neustart hilft **nicht**, wenn die Datenbank weg ist – die Instanz gehört nur aus dem Verkehr genommen |

`GET /health` deckt beides ab: Dass er antwortet, beweist Liveness. `checks.database` beantwortet
die Readiness-Frage. Bei wachsender Anwendung trennt man das in `/health/live` und `/health/ready`.

---

## Geplante Endpoints

| Sprint | Endpoints |
|---|---|
| 1 | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| 2 | `GET/POST /organizations`, `POST /organizations/:id/invitations`, `GET /organizations/:id/members` |
| 3 | `GET/POST/PATCH/DELETE /projects`, `/tasks`, `PATCH /tasks/:id/position` |
| 4 | `GET /dashboard/stats`, `GET /activity` |
| 5 | `POST /webhooks/github` |
