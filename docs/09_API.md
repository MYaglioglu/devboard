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

## `POST /auth/login`

Prüft Zugangsdaten und stellt einen Access-Token aus.

### Anfrage

```json
{ "email": "max@example.com", "password": "einSicheresPasswort" }
```

Beim Login wird **keine Mindestlänge** geprüft – anders als bei der Registrierung. Eine
Längenprüfung hier würde verraten, welche Passwörter überhaupt in Frage kommen, und Nutzer mit
älteren Passwörtern aussperren. Die Obergrenze bleibt (Denial-of-Service).

Die E-Mail wird identisch zur Registrierung normalisiert – sonst könnte sich niemand mit
`Max@example.com` anmelden, obwohl er sich so registriert hat.

### Antwort · 200 OK

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIuLi4ifQ.4f2b9c...",
  "user": { "id": "b3f1c2d4-...", "email": "max@example.com", "name": "Max" }
}
```

**200, nicht 201:** Ein Login erzeugt keine Ressource, er prüft Zugangsdaten.

### Antwort · 401 Unauthorized

```json
{ "statusCode": 401, "message": "E-Mail oder Passwort ist falsch" }
```

**Immer dieselbe Meldung** – unabhängig davon, ob die Adresse unbekannt oder das Passwort falsch
war. Unterschiedliche Meldungen wären ein Geschenk an Angreifer: Wer eine Liste geleakter Adressen
hat, könnte damit in Minuten herausfinden, welche davon hier ein Konto haben.

**Und der Teil, den man leicht vergisst:** Auch die *Antwortzeit* darf nichts verraten. Deshalb wird
das Passwort selbst dann gegen einen Platzhalter-Hash geprüft, wenn die Adresse gar nicht existiert.
Ohne diesen Schritt antwortete der Server bei unbekannten Adressen messbar schneller, weil argon2
absichtlich langsam ist – User Enumeration über die Zeitmessung.

---

## Der Access-Token

Ein **JWT** aus drei base64url-kodierten Teilen:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJhYmMifQ . 4f2b9c...
\__________________/   \________________/   \______/
      Header                Payload         Signatur
```

| Claim | Bedeutung |
|---|---|
| `sub` | Nutzer-ID (RFC 7519: „Subject") |
| `email` | zur Bequemlichkeit im Frontend, keine geheime Angabe |
| `iat` | ausgestellt am |
| `exp` | läuft ab am – 15 Minuten nach Ausstellung |

**Der wichtigste Satz zu JWTs: lesbar, aber nicht fälschbar.** base64 ist eine Kodierung, keine
Verschlüsselung – jeder mit dem Token kann den Payload lesen (`jwt.io` tut genau das). Was er nicht
kann: den Inhalt ändern, denn dann passt die Signatur nicht mehr.

Daraus folgt: **niemals Geheimnisse in den Payload.**

**Warum die Laufzeit kurz ist:** Ein JWT lässt sich nicht widerrufen. Der Server speichert ihn
nirgends, er prüft nur die Signatur. Ein gestohlener Token gilt bis zu seinem Ablauf – auch nach
Logout oder Passwortänderung. Die kurze Lebensdauer ist der einzige Schutz. Den Komfort liefert der
Refresh-Token, der sehr wohl widerrufbar ist.

Signiert wird mit **HS256** (symmetrisch: ein Geheimnis signiert und prüft). Das passt, solange
derselbe Dienst beides tut. Bei mehreren Diensten wäre RS256 richtig – privater Schlüssel signiert,
öffentlicher prüft.

Das Verfahren wird **serverseitig festgelegt** und nicht dem Header des eingehenden Tokens
entnommen. Sonst wäre der bekannte `alg: none`-Angriff möglich, bei dem ein Angreifer die
Signaturprüfung schlicht abschaltet.

---

## Geplante Endpoints

| Sprint | Endpoints |
|---|---|
| 1 | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| 2 | `GET/POST /organizations`, `POST /organizations/:id/invitations`, `GET /organizations/:id/members` |
| 3 | `GET/POST/PATCH/DELETE /projects`, `/tasks`, `PATCH /tasks/:id/position` |
| 4 | `GET /dashboard/stats`, `GET /activity` |
| 5 | `POST /webhooks/github` |
