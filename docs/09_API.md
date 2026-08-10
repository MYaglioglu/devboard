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

## `POST /auth/register`

Legt ein Benutzerkonto an.

### Anfrage

```json
{
  "email": "max@example.com",
  "password": "einSicheresPasswort",
  "name": "Max"
}
```

| Feld | Regeln |
|---|---|
| `email` | Pflicht, gültige Adresse, max. 255 Zeichen. Wird getrimmt und **kleingeschrieben** gespeichert |
| `password` | Pflicht, 10–128 Zeichen. Keine Zeichenklassen-Pflicht |
| `name` | Optional, 1–100 Zeichen |

**Warum keine Sonderzeichen-Pflicht?** Das NIST empfiehlt seit 2017 (SP 800-63B) ausdrücklich
Länge statt Zeichenvielfalt. Erzwungene Sonderzeichen führen zu vorhersagbaren Mustern wie
`Passwort1!` und zu aufgeschriebenen Passwörtern.

**Warum eine Obergrenze?** Gegen Denial-of-Service: argon2 ist absichtlich rechenintensiv. Ohne
Obergrenze ließe sich der Server mit wenigen sehr langen Passwörtern lahmlegen.

### Antwort · 201 Created

```json
{
  "id": "b3f1c2d4-...",
  "email": "max@example.com",
  "name": "Max",
  "createdAt": "2026-08-10T10:00:00.000Z"
}
```

Der Passwort-Hash wird **niemals** zurückgegeben. Er wird gar nicht erst aus der Datenbank geladen
(`select` statt nachträglichem Entfernen) – wer Felder hinterher löscht, vergisst irgendwann eines.

### Antwort · 400 Bad Request

```json
{
  "message": "Validierung fehlgeschlagen",
  "errors": {
    "email": ["Bitte eine gueltige E-Mail-Adresse angeben"],
    "password": ["Das Passwort muss mindestens 10 Zeichen lang sein"]
  }
}
```

Feldbezogen, damit das Frontend die Meldungen direkt am passenden Eingabefeld anzeigen kann.

### Antwort · 409 Conflict

Die Adresse ist bereits registriert.

**Bewusste Abwägung:** Ein 409 verrät einem Angreifer, dass diese Adresse existiert – das nennt man
*User Enumeration*. Vermeiden ließe sich das nur, indem die Registrierung immer 201 liefert und den
Hinweis per E-Mail zustellt. Ohne E-Mail-Versand wäre das für Nutzer unbrauchbar („warum kann ich
mich nicht einloggen?"). Beim späteren **Login** bleibt die Fehlermeldung dagegen generisch – dort
gibt es keinen Grund, etwas preiszugeben.

**Technisch wichtig:** Der Konflikt wird nicht durch eine Vorab-Prüfung erkannt, sondern aus dem
Fehlercode `P2002` der Datenbank abgeleitet. Eine Prüfung im Code enthielte eine Race Condition
zwischen Prüfen und Schreiben. Der `UNIQUE`-Index ist die einzige Instanz, die das atomar
beantworten kann.

---

## Geplante Endpoints

| Sprint | Endpoints |
|---|---|
| 1 | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| 2 | `GET/POST /organizations`, `POST /organizations/:id/invitations`, `GET /organizations/:id/members` |
| 3 | `GET/POST/PATCH/DELETE /projects`, `/tasks`, `PATCH /tasks/:id/position` |
| 4 | `GET /dashboard/stats`, `GET /activity` |
| 5 | `POST /webhooks/github` |
