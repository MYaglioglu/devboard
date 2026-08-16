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

## `POST /auth/refresh`

Stellt einen neuen Access-Token aus und **rotiert** dabei den Refresh-Token.

**Kein Anfragekörper.** Der Nachweis ist allein das Cookie – der Browser schickt es automatisch mit,
der Client muss nichts tun und kann den Wert auch gar nicht lesen (`httpOnly`).

Beachte: Hier wird **kein Passwort geprüft**. Der Besitz eines gültigen, unverbrauchten
Refresh-Tokens *ist* der Nachweis. Genau deshalb muss er so gut geschützt sein.

### Antwort · 200 OK

Wie beim Login: `accessToken` und `user`. Zusätzlich wird ein **neues** Refresh-Cookie gesetzt; das
alte ist ab sofort entwertet.

### Antwort · 401 Unauthorized

Bei fehlendem, unbekanntem, abgelaufenem oder **bereits verbrauchtem** Token – in allen Fällen mit
derselben Meldung, damit ein Angreifer nicht erkennt, ob sein Token jemals gültig war.

---

## `POST /auth/logout`

Beendet die Sitzung: widerruft die gesamte Token-Familie und löscht das Cookie.

### Antwort · 204 No Content

**Immer 204** – auch ohne Cookie oder mit ungültigem Token. Ein fehlschlagender Logout wäre für
Nutzer unverständlich und würde verraten, ob ein Token gültig war.

Der **Access-Token bleibt bis zu seinem Ablauf technisch gültig** (maximal 15 Minuten). Das ist die
bekannte Schwäche zustandsloser Token und der Grund für die kurze Lebensdauer. Neue bekommt der
Angreifer aber nicht mehr.

---

## Der Refresh-Token

| Eigenschaft | Wert |
|---|---|
| Ablage | `httpOnly`-Cookie `devboard_refresh` |
| Lebensdauer | 30 Tage |
| Inhalt | 32 Byte Zufall, base64url |
| Gespeichert als | SHA-256-Hash in `refresh_tokens` |
| `SameSite` | `Lax` |
| `Path` | `/auth` |
| `Secure` | nur in Produktion (lokal kein HTTPS) |

### Rotation

Bei jedem Erneuern wird der benutzte Token entwertet und ein neuer ausgestellt – ein Refresh-Token
ist ein **Einmal-Token**.

### Wiederverwendungs-Erkennung – der eigentliche Trick

Wird ein bereits entwerteter Token noch einmal vorgelegt, gibt es zwei Erklärungen: ein
Netzwerkfehler beim letzten Erneuern, oder ein Diebstahl mit paralleler Nutzung. Beide sind nicht
unterscheidbar – also wird der schlimmere Fall angenommen:

> **Die gesamte Token-Familie wird widerrufen.** Angreifer *und* rechtmäßiger Nutzer fliegen raus.
> Der Nutzer meldet sich neu an, der Angreifer kann das nicht.

Alle durch Rotation auseinander hervorgegangenen Token teilen sich eine `familyId`. Entwertete Token
werden deshalb **nicht gelöscht**: Nur eine aufbewahrte, entwertete Zeile erlaubt es, die
Wiederverwendung überhaupt zu bemerken.

Jeder Login startet eine **eigene** Familie – Abmelden am Laptop wirft das Handy nicht mit hinaus.

### Warum das Cookie und nicht der Antwortkörper

Stünde der Refresh-Token im JSON, könnte JavaScript ihn lesen – und der ganze Zweck des
`httpOnly`-Cookies wäre dahin. Er erscheint deshalb **nirgends** in einer Antwort, nur im
`Set-Cookie`-Header.

---

## `GET /auth/me`

Liefert das Profil des angemeldeten Nutzers. **Geschützt.**

```
Authorization: Bearer <accessToken>
```

### Antwort · 200 OK

```json
{ "id": "b3f1c2d4-...", "email": "max@example.com" }
```

Die Angaben stammen aus dem Token, nicht aus der Datenbank – das spart eine Abfrage pro Aufruf. Der
Preis: Eine Namensänderung wird erst nach dem nächsten Erneuern sichtbar. Bei 15 Minuten
Token-Laufzeit vertretbar.

### Antwort · 401 Unauthorized

Bei fehlendem, ungültigem, abgelaufenem oder manipuliertem Token – und auch bei einem falschen
Authentifizierungsschema (`Basic` statt `Bearer`).

**Ein Refresh-Cookie ist kein Ersatz.** Damit lässt sich nur über `/auth/refresh` ein neuer
Access-Token holen, sonst nichts.

---

## Authentifizierung – wie sie technisch greift

### Bearer-Token im Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

„Bearer" heißt wörtlich *Inhaber*: Wer den Token vorlegt, gilt als berechtigt – es gibt keinen
zusätzlichen Nachweis. Genau deshalb ist die kurze Lebensdauer so wichtig.

**Warum der Header und nicht ein Cookie?** Ein Header wird **nicht** automatisch mitgeschickt; der
Client muss ihn bewusst setzen. Damit ist CSRF für diese Endpoints strukturell ausgeschlossen.

### Secure by Default

Der Guard läuft **global** für jeden Endpoint. Einzelne Routen werden mit `@Oeffentlich()`
ausdrücklich freigegeben – aktuell: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
`POST /auth/logout` und `GET /health`.

Warum herum und nicht andersherum: Vergisst man einen Guard an einer Route, wäre sie versehentlich
öffentlich – und **niemand merkt es**, weil alles funktioniert. Vergisst man umgekehrt das
`@Oeffentlich()`, antwortet der Endpoint mit 401 und der Fehler fällt sofort auf.

Ein Versehen muss zur sicheren Seite hin ausschlagen. Vergessene Guards sind eine der häufigsten
Ursachen echter Datenlecks.

`/auth/refresh` und `/auth/logout` sind bewusst öffentlich, obwohl sie eine Sitzung voraussetzen:
Ihr Nachweis ist das Refresh-Cookie. Wären sie geschützt, könnte man sie mit abgelaufenem
Access-Token nicht aufrufen – also genau dann nicht, wenn man sie braucht.

### 401 oder 403?

| | Bedeutung | Hilft Anmelden? |
|---|---|---|
| **401 Unauthorized** | „Ich weiß nicht, wer du bist." Kein, abgelaufener oder gefälschter Token. | ja |
| **403 Forbidden** | „Ich weiß, wer du bist – du darfst das nur nicht." Gültiger Token, fehlende Rolle oder fremde Organisation. | nein |

Der Access-Token-Guard prüft nur die **Identität** (Authentifizierung) und wirft deshalb
ausschließlich 401. Ein 403 kommt ab Sprint 2 aus der **Autorisierung** – Rollen und
Mandantentrennung.

Dass „Unauthorized" im HTTP-Standard für *Authentifizierung* steht, ist eine historische
Fehlbenennung und sorgt bis heute für Verwechslungen.

---

## `POST /organizations`

Legt eine Organisation an. Der Ersteller wird in **derselben Transaktion** ihr `OWNER`.

Erfordert einen gültigen Access-Token.

### Anfrage

```json
{ "name": "Acme GmbH" }
```

`name` wird getrimmt, dann geprüft: 2–100 Zeichen. Die Reihenfolge ist wichtig – stünde die
Längenprüfung vor dem Trimmen, käme `"  "` durch und landete als leerer Name in der Datenbank.

### Antwort · 201 Created

```json
{
  "id": "9f1c…",
  "name": "Acme GmbH",
  "role": "OWNER",
  "createdAt": "2026-08-11T10:00:00.000Z"
}
```

### Warum die Nutzer-ID nicht im Anfragekörper steht

Ein `{ "name": "…", "userId": "…" }` wäre bequem – und die Lücke. Alles, was der Client schickt,
ist eine **Behauptung**. Wer die eigene ID mitschicken darf, darf auch eine fremde mitschicken und
legt Organisationen im Namen anderer an. Die ID stammt deshalb aus dem signierten Token.

> **Merksatz:** Identität kommt nie aus dem Anfragekörper.

### Warum das eine Transaktion ist

Es sind zwei Schreibvorgänge: Organisation und Mitgliedschaft. Gelingt der erste und scheitert der
zweite, bleibt eine Organisation **ohne Eigentümer** zurück – unverwaltbar, unlöschbar, und in
keiner Liste sichtbar, weil Listen über Mitgliedschaften laufen. Eine Leiche in der Datenbank.

Umgesetzt als *nested write* (`memberships: { create: … }`), den Prisma von sich aus in einer
Transaktion ausführt. Ein explizites `$transaction` wäre gleichwertig, aber mehr Code und eine
zusätzliche Runde zur Datenbank. Es wird dort gebraucht, wo zwischen den Schritten **gelesen und
entschieden** wird – etwa bei „hat diese Organisation noch einen anderen `OWNER`?" in Scheibe 2.3.

### Fehler

| Status | Wann |
|---|---|
| `400` | Name fehlt, zu kurz, zu lang oder nur Leerzeichen |
| `401` | kein oder ungültiger Access-Token |

**Kein `409` bei doppeltem Namen** – anders als bei der E-Mail-Adresse. Zwei Kunden dürfen beide
eine Organisation „Marketing" haben; sie sehen sich ohnehin nie. Ein globaler `UNIQUE`-Index wäre
hier sogar schädlich: Er verriete, dass der Name bereits vergeben ist, und ließe damit Rückschlüsse
auf fremde Mandanten zu.

---

## `GET /organizations`

Liefert alle Organisationen, in denen der angemeldete Nutzer Mitglied ist – **mit seiner Rolle**.

### Antwort · 200 OK

```json
[
  { "id": "9f1c…", "name": "Acme GmbH", "role": "OWNER",  "createdAt": "2026-08-11T10:00:00.000Z" },
  { "id": "3b7e…", "name": "Kunde X",   "role": "MEMBER", "createdAt": "2026-08-11T11:30:00.000Z" }
]
```

Leere Liste, wenn der Nutzer nirgends Mitglied ist – **kein `404`**. Die Liste *existiert*, sie ist
nur leer. `404` hieße „diese Ressource gibt es nicht", und das stimmt nicht.

### Warum die Rolle mitgeliefert wird

Das Frontend muss entscheiden, ob es „Mitglied einladen" überhaupt anzeigt. Ohne die Rolle bräuchte
es einen zweiten Aufruf **pro Organisation** – das N+1-Problem, ausführlich in Sprint 4.

### Warum die Abfrage über die Mitgliedschaften läuft

Naheliegend wäre, von den Organisationen auszugehen:

```ts
prisma.organization.findMany({ where: { memberships: { some: { userId } } } })
```

Gleiches Ergebnis, falsche Richtung. Die Frage lautet nicht „welche Organisationen haben diesen
Nutzer?", sondern „welche Mitgliedschaften hat dieser Nutzer?". Von dort aus ist es ein Zugriff über
den Index auf `memberships.userId` – genau der, der neben dem `UNIQUE (organizationId, userId)`
auf den ersten Blick redundant aussieht (siehe `08_DATABASE.md`).

### Das ist bereits Autorisierung auf Datenebene

Es gibt hier keinen Rollen-Guard – und trotzdem kann niemand fremde Organisationen sehen. Der
Grund: `userId` steht in der **Bedingung** der Abfrage, nicht in einer Prüfung danach.

```ts
// Die Lücke: erst laden, dann filtern. Die fremden Daten wurden bereits gelesen.
const alle = await prisma.membership.findMany();
return alle.filter((m) => m.userId === nutzerId);

// Richtig: der Mandant ist Teil der Bedingung.
return prisma.membership.findMany({ where: { userId: nutzerId } });
```

Es gibt über diesen Endpoint **keinen Weg**, fremde Organisationen abzufragen – kein Filterparameter,
keine „alle"-Option. Die Einschränkung ist nicht optional.

### Bewusst ohne Paginierung

Ein Mensch ist in einer Handvoll Organisationen, nicht in Tausenden. Paginierung kommt in Sprint 4
dort, wo Listen tatsächlich unbegrenzt wachsen. Ein Cursor, den niemand benutzt, ist trotzdem Code,
der getestet und gepflegt werden muss.

---

## Mandantengebundene Endpoints – das gemeinsame Verhalten

Alles unterhalb von `/organizations/:orgId` durchläuft den `MitgliedschaftsGuard`. Er antwortet,
bevor der Controller überhaupt läuft:

| Situation | Status | Warum |
|---|---|---|
| kein Access-Token | `401` | Authentifizierung läuft **vor** Autorisierung |
| gültiger Token, **kein Mitglied** | `404` | „Für dich existiert diese Organisation nicht" |
| Organisation existiert nicht | `404` | wortgleiche Meldung – ununterscheidbar vom Fall darüber |
| Mitglied, **Rolle reicht nicht** | `403` | „Ich weiß, wer du bist – du darfst nur nicht" |

### Warum `404` und nicht `403` bei fremder Organisation

Ein `403` würde bestätigen, dass es eine Organisation mit dieser ID **gibt**. Damit ließen sich IDs
durchprobieren und existierende Mandanten kartieren – bei UUIDs mühsam, aber es ist eine Auskunft,
die niemand bekommen muss. Dieselbe Überlegung wie bei der einheitlichen Login-Fehlermeldung.

Die beiden Fälle „gibt es nicht" und „du bist nicht dabei" liefern deshalb **dieselbe Meldung**,
wortgleich. Ein unterschiedlicher Text würde den vorsichtigen Statuscode wieder aufheben. Ein
E2E-Test schreibt das fest.

`403` ist erst richtig, wenn die Mitgliedschaft steht: Dann weiß der Anfragende ohnehin, dass es die
Organisation gibt, und die Meldung darf konkret sein („erfordert eine der Rollen: OWNER, ADMIN").

> **Faustregel:** Verrate mit dem Statuscode nichts, was der Anfragende nicht schon weiß.

---

## `GET /organizations/:orgId`

Eine einzelne Organisation, mit der eigenen Rolle.

### Antwort · 200 OK

```json
{
  "id": "9f1c…",
  "name": "Acme GmbH",
  "role": "MEMBER",
  "createdAt": "2026-08-11T10:00:00.000Z"
}
```

Für **jedes** Mitglied lesbar, auch für `MEMBER`.

---

## `GET /organizations/:orgId/members`

Die Mitglieder der Organisation. Ebenfalls für jedes Mitglied lesbar – wer in einem Team arbeitet,
darf wissen, wer sonst dazugehört. Verwalten darf er deshalb nichts.

### Antwort · 200 OK

```json
[
  {
    "userId": "a1b2…",
    "email": "max@example.com",
    "name": "Max",
    "role": "OWNER",
    "mitgliedSeit": "2026-08-11T10:00:00.000Z"
  }
]
```

### Was bewusst *nicht* darin steht

`passwordHash` versteht sich. Aber auch das `createdAt` des **Kontos** fehlt: Wann sich jemand bei
DevBoard registriert hat, geht seine Kollegen nichts an. Ausgegeben wird `mitgliedSeit` – das Datum
der **Mitgliedschaft**, also seit wann er in *dieser* Organisation ist. Das ist die Angabe, die hier
fachlich gemeint ist.

Der Schlüssel heißt `userId`, nicht `id`: Die Mitgliedschaft hat eine eigene ID, und die beiden zu
verwechseln wäre teuer. Mit der `userId` adressiert der Client das Mitglied beim Entfernen.

Umgesetzt mit `select`, nicht `include`. `include` holt den ganzen Nutzer samt Hash und überlässt es
dem Code, hinterher aufzuräumen – wer Felder nachträglich entfernt, vergisst irgendwann eines.

---

## `PATCH /organizations/:orgId`

Benennt die Organisation um. **Erfordert `OWNER` oder `ADMIN`.**

### Anfrage

```json
{ "name": "Acme AG" }
```

### Warum `PATCH` und nicht `PUT`

`PUT` ersetzt die Ressource **vollständig** – was im Körper fehlt, gilt als gelöscht. Wer nur den
Namen ändern will, müsste alle übrigen Felder mitschicken, und wer eines vergisst, löscht es.
`PATCH` ändert nur, was dasteht.

Das Schema ist per `pick` vom Anlege-Schema **abgeleitet**, nicht kopiert. Kopierte Validierung
läuft auseinander, und dann akzeptiert das Ändern etwas, das das Anlegen ablehnt.

### Warum `ADMIN` und nicht nur `OWNER`

Umbenennen ist Verwaltung und umkehrbar. Dem `OWNER` bleiben die Aktionen vorbehalten, die sich
**nicht** rückgängig machen lassen: Organisation löschen, letzten Eigentümer wechseln.

### Fehler

| Status | Wann |
|---|---|
| `400` | Name ungültig |
| `401` | kein Access-Token |
| `403` | Mitglied, aber `MEMBER` |
| `404` | kein Mitglied, oder Organisation existiert nicht |

---

## `PATCH /organizations/:orgId/members/:userId`

Ändert die Rolle eines Mitglieds. **Erfordert `OWNER`.**

### Anfrage

```json
{ "role": "ADMIN" }
```

### Warum nicht auch `ADMIN` – der wichtigste Rollenschnitt im Projekt

Dürfte ein `ADMIN` Rollen vergeben, könnte er sich selbst zum `OWNER` machen. Damit wäre die
Unterscheidung der beiden Rollen wertlos: Jeder `ADMIN` wäre ein `OWNER`, der es nur noch nicht
ausgesprochen hat.

> **Merksatz:** Wer Rechte vergeben darf, hat sie. Die Befugnis, Rollen zu ändern, ist immer die
> höchste Befugnis im System – und gehört an die höchste Rolle.

### Fehler

| Status | Wann |
|---|---|
| `400` | unbekannte Rolle, oder `:userId` ist keine UUID |
| `403` | Mitglied, aber nicht `OWNER` |
| `404` | kein Mitglied der Organisation – **oder** das Ziel-Mitglied existiert nicht |
| `409` | der letzte `OWNER` soll herabgestuft werden |

**Zu `400` bei ungültiger UUID:** Ohne Validierung am Rand ginge `abc` bis zur Datenbank durch, und
Prisma antwortete mit einem Fehler über UUID-Syntax – also `500` für eine schlicht falsche Eingabe.

---

## `DELETE /organizations/:orgId/members/:userId`

Entfernt ein Mitglied. Mit der **eigenen** ID aufgerufen bedeutet das „Organisation verlassen" –
derselbe Endpoint, kein eigener.

Antwort: `204 No Content`.

### Warum hier kein `@Rollen()` steht

Die Regel hängt davon ab, **wen** es trifft:

| Anfragender | Ziel | erlaubt |
|---|---|---|
| beliebig | er selbst | ja |
| `MEMBER` | jemand anderes | nein (`403`) |
| `ADMIN` | `MEMBER` oder `ADMIN` | ja |
| `ADMIN` | `OWNER` | nein (`403`) |
| `OWNER` | jeder | ja |

Ein Guard kann das nicht entscheiden. Er weiß, **wer** anfragt, aber nicht, **wen** es trifft – die
Zielressource kennt er nicht. Ein `@Rollen(OWNER, ADMIN)` würde einen `MEMBER` abweisen, bevor
überhaupt klar ist, dass er nur sich selbst meint.

> **Faustregel:** Ein Guard entscheidet über den **Zugang**, nicht über den **Einzelfall**. Sobald
> die Antwort davon abhängt, welche Ressource betroffen ist, gehört sie in den Service.

**Warum `ADMIN` keinen `OWNER` entfernen darf:** Sonst könnte er alle `OWNER` entfernen und die
Organisation übernehmen. Wer den Höherstehenden entfernen kann, steht höher – die Rangfolge wäre
wirkungslos.

### Die Regel vom letzten Eigentümer

Der letzte `OWNER` darf nicht verschwinden, sonst bleibt die Organisation unverwaltbar zurück.
**Vier Wege** führen zu dieser Verletzung: entfernt werden, selbst gehen, herabgestuft werden,
Konto löschen. Deshalb liegt die Prüfung im **Service** und nicht am Endpoint – am Endpoint müsste
man sie viermal schreiben und würde einen davon vergessen.

Statuscode `409 Conflict`, nicht `403`: Die Anfrage ist formal in Ordnung und der Anfragende ist
berechtigt. Sie widerspricht nur dem **aktuellen Zustand** – mit einem zweiten `OWNER` wäre dieselbe
Anfrage erfolgreich.

### Warum eine Transaktion hier nicht reicht

Das Muster ist *lesen, entscheiden, schreiben*. Zwei gleichzeitige Anfragen:

```
A: zählt OWNER → 2 → "einer darf weg" → entfernt sich
B: zählt OWNER → 2 → "einer darf weg" → entfernt sich
```

Beide atomar. Danach **null** Eigentümer. PostgreSQL fährt standardmäßig *Read Committed*: Jede
Transaktion sieht den Stand von vor der anderen.

> **Merksatz:** Eine Transaktion macht Schreibvorgänge unteilbar. Sie macht **Lesen und Schreiben**
> nicht automatisch zu einer Einheit.

Gelöst mit einer pessimistischen Sperre auf der **Organisationszeile**:

```sql
SELECT id FROM organizations WHERE id = $1 FOR UPDATE
```

Die zweite Anfrage wartet dort und liest danach den aktualisierten Stand. Gesperrt wird die
Organisation, nicht die einzelne Mitgliedschaft: Die Regel betrifft die Organisation als Ganzes,
also braucht es einen gemeinsamen Punkt, an dem sich konkurrierende Änderungen begegnen. Zwei
Sperren auf zwei verschiedenen Mitgliedschaften kämen sich nie in die Quere.

**Alternativen, und warum nicht:**

| Ansatz | Bewertung |
|---|---|
| Isolationsstufe `SERIALIZABLE` | PostgreSQL erkennt den Konflikt selbst. Sauberer, verlangt aber eine Wiederholungslogik für `P2034` – mehr bewegliche Teile für denselben Effekt. |
| Optimistisches Sperren (Versionsspalte) | Richtig, wenn Konflikte selten sind und eine Fehlermeldung genügt („wurde inzwischen geändert"). Beim Kanban-Board in Sprint 3 die passende Wahl. Hier nicht: Ein verlorener Eigentümer lässt sich nicht durch Neuladen beheben. |
| Datenbank-Constraint | Das Robusteste, in PostgreSQL aber nicht direkt ausdrückbar – „mindestens eine Zeile mit `role = OWNER` je `organizationId`" braucht einen Trigger. Geparkt in `06_BACKLOG.md`. |

---

## Einladungen

### `POST /organizations/:orgId/invitations` · `OWNER`, `ADMIN`

```json
{ "email": "neue.kollegin@example.com", "role": "MEMBER" }
```

Antwort `201`:

```json
{
  "id": "7c2a…",
  "email": "neue.kollegin@example.com",
  "role": "MEMBER",
  "expiresAt": "2026-08-18T11:00:00.000Z",
  "createdAt": "2026-08-11T11:00:00.000Z",
  "token": "9Xk2…"
}
```

**`token` erscheint genau hier und nirgends sonst.** Die Liste der offenen Einladungen enthält ihn
nicht – erzwungen über zwei getrennte Rückgabetypen, nicht über Disziplin.

> **Abweichung von der Produktionsrealität:** In einer Anwendung mit E-Mail-Versand würde der Token
> *nur* verschickt und nie in der HTTP-Antwort stehen – der Einladende bekäme ihn nie zu sehen und
> könnte die Einladung nicht selbst einlösen. Solange DevBoard keine E-Mails versendet, wäre die
> Einladung sonst unbenutzbar. Vermerkt in `10_SECURITY.md`, damit es nicht als Versehen durchgeht.

**Keine User Enumeration.** Naheliegend wäre: Konto vorhanden? Dann direkt als Mitglied eintragen,
sonst einladen. Die zwei Wege hätten unterscheidbare Antworten – und damit hätte jeder `ADMIN` einen
Dienst, mit dem er beliebige Adressen darauf prüfen kann, ob sie bei DevBoard registriert sind.
Deshalb: **immer** eine Einladung, immer dieselbe Antwortform. Ein Test vergleicht die Feldmengen
beider Fälle.

**`OWNER` ist nicht einladbar** (`400`). Die Rolle entsteht ausschließlich durch Ernennen eines
bestehenden Mitglieds. Über die Einladung wäre es ein zweiter Weg, der in der Mitgliederliste nie
sichtbar würde.

**Ein `ADMIN` darf nur `MEMBER` einladen** (`403` sonst). Dieselbe Regel wie in 2.4 in anderer
Verkleidung: *Wer Rechte vergeben darf, hat sie* – und eine Einladung **ist** eine Rechtevergabe.
Die Prüfung liegt im Service, nicht im Decorator: Sie hängt an der Zielrolle im Anfragekörper, und
die kennt ein Guard nicht.

**Erneutes Einladen entwertet die vorherige Einladung** an dieselbe Adresse, statt mit `409` zu
scheitern. „Die erste ist im Spam gelandet" ist eine normale Handlung. Beides – Entwerten und
Anlegen – läuft in einer Transaktion; sonst gäbe es einen Moment ohne oder mit zwei gültigen Token.

### `GET /organizations/:orgId/invitations` · `OWNER`, `ADMIN`

Die offenen Einladungen – weder eingelöst noch zurückgezogen noch abgelaufen. **Ohne Token.**

Nicht für `MEMBER` (`403`): Wer dazugehört, darf jedes Mitglied sehen; wer noch eingeladen ist, ist
Verwaltungsinformation – und es sind E-Mail-Adressen von Menschen außerhalb des Teams.

### `DELETE /organizations/:orgId/invitations/:invitationId` · `OWNER`, `ADMIN`

`204`. Die Einladung wird nicht gelöscht, sondern über `revokedAt` entwertet – dieselbe Überlegung
wie bei den Refresh-Token.

**Der vergessene Mandantenfilter in seiner typischsten Form:** Ein `OWNER` ist in *seiner*
Organisation berechtigt und kommt durch den Guard. Die Einladungs-ID im Pfad kann trotzdem zu einer
**fremden** Organisation gehören. Ein `update({ where: { id } })` würde sie zurückziehen.

```ts
// FALSCH – der Guard hat die Organisation im Pfad geprüft, nicht diese Ressource
prisma.invitation.update({ where: { id: einladungId } })

// RICHTIG – beide Bedingungen
prisma.invitation.updateMany({ where: { id: einladungId, organizationId } })
```

> **Merksatz:** Die ID im Pfad gehört nicht automatisch zu der Organisation im Pfad.

Ein E2E-Test deckt genau das ab; die Gegenprobe (Filter entfernt) lässt ihn fehlschlagen.

### `POST /invitations/accept`

```json
{ "token": "9Xk2…" }
```

Antwort `200`: `{ "organizationId": "…", "role": "MEMBER" }`

**Warum diese Route nicht unter `/organizations/:orgId` liegt:** Der Anfragende ist noch kein
Mitglied – der `MitgliedschaftsGuard` würde ihn mit `404` abweisen. Die Route wäre nur für die
erreichbar, die sie nicht brauchen. Welche Organisation gemeint ist, ergibt sich ohnehin aus dem
Token; der Eingeladene muss die ID nicht kennen.

**Warum `POST` und nicht `GET`:** Das Einlösen verändert etwas. Ein `GET` muss laut Standard
nebenwirkungsfrei sein – sonst genügt ein Link-Vorschaudienst oder ein Virenscanner im Postfach, der
Links vorsorglich öffnet, um die Einladung ungefragt einzulösen. Der Link in der E-Mail zeigt auf
eine **Seite** im Frontend, die den Token ausliest und diesen Endpoint aufruft.

**Warum der Token im Körper steht und nicht im Pfad:** Ein Pfad landet in Server-Logs, im
Browserverlauf und im `Referer` der nächsten Anfrage. Für ein Geheimnis alles falsche Orte.

**Warum die Adresse übereinstimmen muss** (`403` sonst): Der Token allein reicht nicht – der
Anmeldende muss dieselbe Adresse haben, an die eingeladen wurde. Die Alternative („wer den Link hat,
ist drin") ist bequemer und deutlich schwächer: Ein weitergeleiteter Link, versehentlich in einem
geteilten Postfach oder einem Chat gelandet, wäre ein Zugang. Preis: Wer sich unter einer anderen
Adresse registriert hat, muss neu eingeladen werden.

| Status | Wann |
|---|---|
| `400` | abgelaufen – **eigene** Meldung, siehe unten |
| `401` | nicht angemeldet (ein Konto ist Voraussetzung) |
| `403` | Einladung ist an eine andere Adresse gerichtet |
| `404` | unbekannt, bereits eingelöst oder zurückgezogen – **wortgleiche** Meldung |
| `409` | bereits Mitglied |

**Warum drei Fälle dieselbe `404`-Meldung teilen:** Ein Angreifer, der Token durchprobiert, soll
nicht erfahren, ob er nur *zu spät* war – das wäre die Auskunft, dass dieser Token einmal echt war.

**Warum der Ablauf trotzdem eine eigene Meldung bekommt:** Wer eine echte, abgelaufene Einladung in
der Hand hält, kennt sie ohnehin. Ihm ist mit „ungültig" nicht geholfen – er soll um eine neue
bitten. Verraten wird dabei nichts, was er nicht schon weiß.

**Warum `409` bei bestehender Mitgliedschaft und kein stilles Überschreiben:** Sonst könnte ein
`ADMIN` den `OWNER` als `MEMBER` einladen und ihn beim Annehmen herabstufen. Die bestehende Rolle
bleibt unangetastet.

---

## Projekte

Alle Endpoints liegen unter `/organizations/:orgId/projects` und sind damit **mandantengebunden** –
der `MitgliedschaftsGuard` greift über den `:orgId`-Parameter, ohne dass eine Markierung nötig
wäre. Es gilt das gemeinsame Verhalten von oben: fremde oder unbekannte Organisation ⇒ `404`.

### Wer darf was

| | `OWNER` | `ADMIN` | `MEMBER` |
|---|---|---|---|
| Projekte lesen | ✓ | ✓ | ✓ |
| Anlegen, ändern, archivieren | ✓ | ✓ | – |

**Warum die Grenze hier liegt:** Ein Projekt ist die **Struktur**, in der gearbeitet wird – nicht
die Arbeit selbst. Die Arbeit (Tasks, Scheibe 3.3) darf jedes Mitglied anlegen und verschieben.
Die Alternative wäre, auch `MEMBER` Projekte anlegen zu lassen; vertretbar, aber dann verändert
jeder die Struktur des Teams und niemand räumt sie auf. **Eine enge Vorgabe lässt sich später
öffnen – der umgekehrte Weg nimmt Rechte weg, die schon jemand benutzt.**

### `POST /organizations/:orgId/projects` · `OWNER`, `ADMIN`

```json
{ "name": "Relaunch", "description": "Website neu" }
```

Antwort `201` mit dem Projekt. `description` ist optional.

**Die `organizationId` steht bewusst *nicht* im Körper.** Sie kommt aus dem Pfad – aus genau dem
Pfad, den der Guard geprüft hat. Stünde sie zusätzlich im Körper, gäbe es zwei Angaben, die sich
widersprechen können: die geprüfte und die geschriebene. Wer dann versehentlich die falsche nimmt,
umgeht den Mandantenschutz, ohne eine Zeile Sicherheitscode anzufassen. Ein E2E-Test schiebt eine
fremde `organizationId` im Körper unter und weist nach, dass sie folgenlos bleibt.

### `GET /organizations/:orgId/projects` · alle Mitglieder

Liefert die **nicht archivierten** Projekte, neueste zuerst. `?includeArchived=true` nimmt die
archivierten dazu.

**Warum die Voreinstellung filtert und nicht umgekehrt:** Das ungefilterte Ergebnis wäre die
bequemere Vorgabe, aber dann müsste jeder Aufrufer an den Filter denken – und der erste, der ihn
vergisst, zeigt archivierte Projekte an, ohne dass jemand einen Fehler sieht.

Der Query-Parameter wird gegen `'true'` verglichen, nicht per `Boolean()` ausgewertet:
`Boolean('false')` ist `true`, also das genaue Gegenteil der Absicht.

### `GET /organizations/:orgId/projects/:projectId` · alle Mitglieder

`404`, wenn das Projekt nicht zu dieser Organisation gehört – **auch wenn es die ID gibt**. Der
Mandant steht in der `WHERE`-Bedingung (`findFirst`, nicht `findUnique` mit anschließender
Prüfung); siehe `08_DATABASE.md`. Ungültige UUID ⇒ `400`, nicht `500`.

### `PATCH /organizations/:orgId/projects/:projectId` · `OWNER`, `ADMIN`

```json
{ "name": "Neuer Name", "description": null }
```

Beide Felder optional, aber **mindestens eines erforderlich** – ein leerer Körper ergibt `400`.
Ein `PATCH`, der nichts ändert und `200` meldet, sähe für den Client wie ein Erfolg aus, obwohl
seine Absicht verlorengegangen ist (etwa bei einem falsch benannten Feld).

`description: null` **entfernt** die Beschreibung, ein *fehlendes* `description` lässt sie
unverändert. Das ist der Unterschied zwischen `null` und `undefined`, den Prisma beim Update
ausdrücklich beachtet – ohne ihn gäbe es keine Schreibweise für „Beschreibung löschen".

### `DELETE /organizations/:orgId/projects/:projectId` · `OWNER`, `ADMIN`

Antwort `204`. **Gelöscht wird nichts** – gesetzt wird `archivedAt`. Der Verlauf bleibt erhalten,
Sprint 4 zieht seine Kennzahlen daraus.

**Warum trotzdem `DELETE`:** Aus Sicht des Clients ist es dasselbe – das Projekt verschwindet aus
der Liste. Dass wir archivieren, ist eine Entscheidung *unserer* Seite. Ein Endpoint `POST …/archive`
wäre ehrlicher im Namen, macht aber eine interne Entscheidung nach außen sichtbar, die sich dann
nicht mehr ändern lässt.

**Der Aufruf ist idempotent:** Ein zweites `DELETE` antwortet wieder `204`, nicht `404`. Der Service
unterscheidet dafür zwei Fälle, die `updateMany` mit `count: 0` zusammenwirft – „gibt es nicht"
(⇒ `404`) und „war schon archiviert" (⇒ nichts zu tun). Ohne diese Unterscheidung würde jeder
Doppelklick und jeder automatische Wiederholungsversuch zu einer Fehlermeldung.

Wieder-Aktivieren gibt es bewusst noch nicht – vermerkt in `06_BACKLOG.md`.

---

## Aufgaben

Alle Endpoints liegen unter `/organizations/:orgId/projects/:projectId/tasks`.

**Warum der Pfad so lang ist:** Die Aufgaben-ID allein wäre eindeutig, `/tasks/:taskId` also
möglich. Der lange Pfad kauft zwei Dinge: Der `:orgId` darin ist das, woran der globale
`MitgliedschaftsGuard` greift – ohne ihn müsste jede Task-Route ihren Schutz selbst mitbringen. Und
die Zugehörigkeit wird *überprüfbar* statt angenommen: Der Service verlangt, dass die Aufgabe zu
diesem Projekt und das Projekt zu dieser Organisation gehört. Eine ID aus einem fremden Projekt
läuft ins Leere, statt zufällig zu funktionieren.

**Kein `@Rollen()` an irgendeinem dieser Endpoints.** Aufgaben sind die *Arbeit*, Projekte die
*Struktur*. Jedes Mitglied darf arbeiten – anlegen, ändern, zuweisen, löschen. Wer einem Team
angehört, aber keine Aufgabe anlegen darf, ist kein Mitglied, sondern ein Zuschauer; diese Rolle
gibt es hier nicht.

### `position` ist eine Zeichenkette, keine Zahl

```json
{ "id": "…", "title": "Login bauen", "position": "2000", "version": 0 }
```

In der Datenbank ist die Position `numeric(65,30)`. JSON kennt nur **einen** Zahlentyp, und der ist
`float64` – eine Position wie `1500.000000000000000000000000000001` käme im Browser gerundet an.
Damit wäre genau der Präzisionsverlust zurück, gegen den `numeric` gewählt wurde, nur auf dem
Transportweg statt in der Datenbank.

Das Frontend rechnet ohnehin nicht mit Positionen: Beim Verschieben schickt es die IDs der Nachbarn,
den Mittelwert bildet der Server (Scheibe 3.4). Der Wert ist für den Client eine undurchsichtige
Kennung.

> Dieselbe Falle steckte in der Rechenbibliothek selbst – `decimal.js` rundet ab 20 signifikanten
> Stellen. Siehe `17_MISTAKES_AND_LESSONS.md`, 13.08.2026.

### `POST …/tasks`

```json
{ "title": "Login bauen", "status": "IN_PROGRESS", "assigneeId": "<userId>", "dueDate": "2026-09-01T00:00:00Z" }
```

Nur `title` ist Pflicht. `status` ist standardmäßig `TODO`; die Karte wird **unten in ihrer Spalte**
angehängt (letzte Position + 1000).

`404`, wenn das Projekt nicht zu dieser Organisation gehört – **oder archiviert ist**. In einen
archivierten Behälter gehört keine neue Aufgabe; sonst ließe sich über die Task-Schnittstelle in
etwas hineinschreiben, das in der Oberfläche nicht mehr auftaucht.

**Die Zuweisung nimmt eine `userId`, keine `membershipId`** – obwohl die Spalte auf `memberships`
zeigt. Das Frontend kennt aus `GET …/members` nur Nutzer-IDs; müsste es Mitgliedschafts-IDs
schicken, wäre unsere Tabellenstruktur Teil der öffentlichen Schnittstelle.

Der Service schlägt die Mitgliedschaft über `(organizationId, userId)` nach. **Darin steckt die
Regel „nur an Mitglieder derselben Organisation"** – nicht als zusätzliche Prüfung, sondern als
einziger Weg, überhaupt an eine `assigneeId` zu kommen. Kein Treffer ⇒ `400`. Was es nicht gibt,
kann man nicht versehentlich durchlassen.

`400` und nicht `404`, weil die angesprochene Ressource sehr wohl existiert – der Client hat etwas
Ungültiges *geschickt*. Die Meldung sagt bewusst nicht, ob es den Nutzer überhaupt gibt.

### `GET …/tasks` – die Board-Abfrage

Flache Liste, sortiert nach `status`, dann `position` – genau die Reihenfolge des Index
`(projectId, status, position)`, also ohne Sortierschritt in PostgreSQL.

**Warum flach und nicht nach Spalten gruppiert:** `{ "TODO": [...], "DONE": [...] }` wäre bequemer
für das Frontend und trotzdem falsch – eine leere Spalte fehlte im Ergebnis, und der Client müsste
die Spaltenliste doch wieder selbst kennen. **Die Spalten sind eine Eigenschaft des Boards, nicht
der Daten.**

Gleichstände bei `position` werden über `createdAt` und zuletzt `id` aufgelöst. Ohne das wäre die
Reihenfolge zweier gleich positionierter Karten von Aufruf zu Aufruf verschieden, und das Board
„zappelt" beim Neuladen.

Ein fremdes Projekt liefert eine **leere Liste**, keine `404`: Eine leere Liste gibt keine Auskunft
darüber, ob es das Projekt gibt.

### `PATCH …/tasks/:taskId`

Ändert `title`, `description`, `assigneeId`, `dueDate`. Mindestens ein Feld erforderlich.
`null` entfernt (Beschreibung, Zuweisung, Fälligkeit), ein fehlendes Feld lässt unverändert.

**`status` und `position` gehen hier bewusst *nicht*.** Beide bestimmen, wo die Karte liegt, und
beide gehören zusammen: Eine Spalte zu wechseln, ohne die Position in der neuen Spalte zu bestimmen,
ergibt keinen sinnvollen Zustand. Dafür gibt es in Scheibe 3.4 `PATCH …/move` mit optimistischem
Sperren. Wären sie hier erlaubt, gäbe es **zwei** Wege zum Verschieben – einen mit
Konfliktbehandlung und einen ohne. Der ohne würde irgendwann benutzt.

> Wenn zwei Felder nur gemeinsam einen gültigen Zustand ergeben, brauchen sie einen gemeinsamen
> Endpoint – nicht zwei einzelne.

### `PATCH …/tasks/:taskId/move` – der Endpoint, um den es in Sprint 3 geht

```json
{ "status": "IN_PROGRESS", "previousId": "<taskId>|null", "nextId": "<taskId>|null", "version": 3 }
```

#### Warum der Client Nachbarn schickt und keine Position

Naheliegend wäre `{ "position": "1500" }` – der Client rechnet, der Server speichert. Das wäre aus
drei Gründen falsch:

1. Der Client müsste die **Rechenregel kennen**. Damit wäre sie Teil der Schnittstelle, und ein
   späterer Wechsel (etwa auf string-basierte Ränge) bräche jeden Client.
2. Er müsste in JavaScript rechnen – also in `float64`, das genau die Präzision nicht hat, wegen
   der die Spalte `numeric` ist.
3. Zwei Clients könnten dieselbe Position berechnen und einander überschreiben.

Stattdessen sagt der Client, was er tatsächlich *weiß*, weil der Nutzer es getan hat: „diese Karte
liegt jetzt zwischen jener und jener". `null` bedeutet Rand – kein Vorgänger heißt ganz oben.

#### `version` ist Pflicht, nicht optional

Das ist das optimistische Sperren: Der Server ändert die Karte nur, wenn ihre Version noch die ist,
die der Client gelesen hat.

Optional wäre es ein Angebot – und wer es weglässt, bekäme das Verschieben *ohne* Konfliktschutz.
Damit gäbe es zwei Verhalten am selben Endpoint, und benutzt würde das bequemere. **Ein Schutz, den
man weglassen kann, ist keiner.**

Entscheidend ist, *wo* die Version steht: im `WHERE` des `UPDATE`, nicht in einer Prüfung davor.
Zwischen einem `if (task.version === …)` und dem folgenden Schreiben läge eine Lücke, in der ein
anderer schreiben kann. So entscheidet die Datenbank in einem Schritt.

#### Antworten

| Status | Wann |
|---|---|
| `200` | verschoben, die Antwort enthält die **neue** Version |
| `409` | die Version passt nicht mehr – jemand war schneller, **nichts wurde geschrieben** |
| `400` | Nachbar liegt nicht in der Zielspalte, Nachbarn in verkehrter Reihenfolge, Karte als eigener Nachbar, `version` fehlt |
| `404` | Aufgabe gehört nicht zu diesem Projekt / dieser Organisation |

**Warum `409` und nicht `412`:** `412 Precondition Failed` gehört zu den HTTP-Vorbedingungen über
`If-Match`/ETag. Wir tragen die Version im Körper, nicht in einer Kopfzeile – dann ist `409` die
ehrlichere Antwort. Der Konflikt ist fachlich, nicht protokollarisch.

**Warum `400` bei einem Nachbarn aus der falschen Spalte:** Seine Position hat mit der Zielspalte
nichts zu tun; der Mittelwert wäre eine Zahl ohne Bedeutung, und die Karte landete an zufälliger
Stelle – ohne Fehlermeldung. Der Fall ist nicht theoretisch: Genau so sieht ein veraltetes Board
aus. Die Antwort ist deshalb ein Fehler und kein stilles Zurechtrücken.

#### Die erschöpfte Spalte

Nach rund 30 Halbierungen an derselben Stelle passt die Position nicht mehr in `numeric(65,30)`.
Der Server erkennt das **vor** dem Schreiben (`decimalPlaces() > 30`), verteilt die Spalte neu
(1000, 2000, 3000 …), liest die Nachbarn erneut und rechnet noch einmal. Für den Client ist der
Vorgang unsichtbar – er bekommt `200`.

Die Neuverteilung schreibt N Zeilen und ist deshalb ausdrücklich **nicht** der Normalfall: Wäre das
jede Verschiebung, hätte man die Nachteile der Integer-Nummerierung wieder eingekauft, die zu
vermeiden der ganze Zweck von `numeric` war. Sie läuft derzeit synchron in der auslösenden Anfrage;
eine Hintergrundvariante steht in `06_BACKLOG.md`.

### `DELETE …/tasks/:taskId`

`204`. Hier wird **wirklich gelöscht**, anders als beim Projekt.

**Warum der Unterschied:** Ein Projekt ist ein Behälter, dessen Verlauf interessant bleibt – Sprint 4
zieht daraus Kennzahlen. Eine einzelne Karte ist das nicht; „falsch angelegt, weg damit" ist der
häufigste Grund für ein `DELETE` auf einer Aufgabe. Sie unsichtbar aufzubewahren, füllt die Tabelle
mit Zeilen, die niemand mehr sehen will, und jede künftige Abfrage müsste an den Filter denken.

**Der zweite Aufruf gibt `404`, beim Projekt gibt er `204`** – das ist kein Widerspruch, sondern der
Unterschied zwischen zwei Zuständen: Ein archiviertes Projekt existiert noch, eine gelöschte Aufgabe
nicht. Idempotenz im Sinne der HTTP-Spezifikation betrifft den **Zustand** auf dem Server, nicht den
Statuscode – und der ist nach dem zweiten `DELETE` derselbe wie nach dem ersten.

Den Ausschlag gibt die Mandantenregel: Eine fremde Aufgabe muss sich wie eine nicht existierende
verhalten, also `404`. Gäbe es hier `204`, wären „gelöscht" und „gehört dir nicht" von außen
dasselbe, und der Aufrufer glaubte, etwas bewirkt zu haben.

---

## Aktivitäts-Feed

Nur lesbar. Es gibt **kein** `POST /activity`, und das ist keine Lücke: Ein Ereignis entsteht
dadurch, dass etwas *geschieht* – nicht dadurch, dass jemand es behauptet. Wäre der Feed von außen
beschreibbar, könnte jedes Mitglied einen Verlauf erfinden, und die Zusage aus ADR-012 wäre
aushebelbar. Aus demselben Grund gibt es kein `PATCH` und kein `DELETE`: Ein Protokoll, das sich
ändern lässt, ist als Protokoll wertlos.

Lesen darf **jedes Mitglied**, auch ein `MEMBER`. Der Feed zeigt, was im eigenen Team passiert ist;
ihn Verwaltern vorzubehalten wäre die Umkehrung seines Zwecks.

Der Pfad heißt `activity` im Singular – gemeint ist „die Aktivität dieser Organisation" als
Sammelbegriff, nicht eine Liste einzeln adressierbarer Ressourcen. Ein `GET …/activity/:id` gibt es
bewusst nicht: Ein Eintrag ist ohne seinen Verlauf sinnlos.

### `GET /organizations/:orgId/activity` · alle Mitglieder

| Parameter | Vorgabe | Anmerkung |
|---|---|---|
| `limit` | 20 | 1–100. Ohne Obergrenze wäre `?limit=1000000` ein Weg, den Server mit *einer* Anfrage beliebig zu belasten |
| `cursor` | – | Undurchsichtige Zeichenkette aus einer vorigen Antwort |
| `projectId` | – | Filter innerhalb des Mandanten. Fremdes Projekt ⇒ **404**, nicht leere Liste |

```json
{
  "items": [
    {
      "id": "…",
      "type": "TASK_MOVED",
      "actor": { "userId": "…", "name": "Murat", "email": "murat@example.com" },
      "projectId": "…",
      "taskId": "…",
      "payload": { "title": "Login-Bug", "fromStatus": "TODO", "toStatus": "DONE" },
      "createdAt": "2026-08-14T10:03:22.150Z"
    }
  ],
  "nextCursor": "MjAyNi0wOC0xNFQxMDowMzoyMi4xNTBafGIzZjFjMmQ0…"
}
```

`actor: null` ist kein Fehler, sondern der Normalfall nach einer Kontolöschung – `ON DELETE SET
NULL` lässt das Ereignis stehen und nimmt ihm nur die Zuordnung. Das Frontend zeigt dann „Ein
entferntes Mitglied".

`nextCursor: null` heißt ausdrücklich **keine weitere Seite** und nicht „unbekannt". Diesen
Unterschied gibt es nur, weil eine Zeile mehr gelesen wird, als ausgeliefert wird – so ist die
Frage „gibt es noch mehr" ohne ein zweites `COUNT` beantwortet, das die gesamte Treffermenge zählen
müsste.

### Warum Cursor und nicht `?page=3`

Offset-Paginierung hat zwei Probleme, und das Geschwindigkeitsproblem ist das kleinere:

1. `OFFSET 10000` liest zehntausend Zeilen und wirft sie weg. Die Kosten steigen mit der
   Seitenzahl, obwohl das Ergebnis gleich groß bleibt.
2. Der schlimmere: Kommt zwischen zwei Seitenaufrufen ein Eintrag **oben** dazu, verschiebt sich
   alles um eins – der Nutzer sieht auf Seite 2 einen Eintrag, den er auf Seite 1 schon gelesen hat.
   Bei einem Feed, in den ständig geschrieben wird, ist das der Normalfall.

Ein Cursor bezeichnet stattdessen eine **Stelle**: „weiter nach genau diesem Eintrag". Neue
Einträge oben liegen außerhalb dessen, was noch gelesen wird.

Der Preis, ehrlich benannt: **Es gibt kein Springen zu Seite 7 und keine Gesamtzahl.** Für einen
chronologischen Feed ist beides bedeutungslos – für eine Tabelle mit Seitenzahlen wäre Offset die
richtige Wahl. Die Frage lautet nicht „was ist besser", sondern „springt der Nutzer, oder blättert
er weiter".

### Was im Cursor steht – und was ausdrücklich nicht

`base64url` von `<ISO-Zeitstempel>|<UUID>`. Base64 ist **keine** Verschlüsselung; der Inhalt ist für
jeden lesbar und veränderbar. Undurchsichtig ist er aus einem anderen Grund: Wäre der Aufbau
sichtbar, würden Clients anfangen, ihn selbst zu bauen – und der Tag, an dem der Feed ein drittes
Sortierkriterium bekommt, bräche jeden dieser Clients.

**Der Cursor trägt den Mandanten nicht.** Er sagt, *wo* weitergelesen wird, nicht *worin*. Die
Organisation kommt ausschließlich aus der geprüften Mitgliedschaft und steht in der
`WHERE`-Bedingung. Ein manipulierter Cursor verschiebt die Stelle innerhalb der eigenen Daten – in
fremde Daten kann er nicht zeigen, dort sucht die Abfrage gar nicht erst.

Deshalb braucht er auch **keine Signatur**. Ein signierter Cursor wäre die Antwort auf ein Problem,
das erst entstünde, wenn man den Mandanten hineinschriebe – und das wäre der eigentliche Fehler:
Ein Wert aus dem Browser darf nie darüber entscheiden, wessen Daten man sieht.

`base64url` statt `base64`, weil der Wert in einem Query-Parameter steht: Normales Base64 verwendet
`+`, und `+` bedeutet in einer Query ein Leerzeichen. Der Cursor käme je nach Client beschädigt an –
ein Fehler, der nur bei bestimmten Zufallswerten auftritt und damit teurer ist als einer, der immer
auftritt.

Ein mitgeschickter, aber unlesbarer Cursor ergibt **400**. Ihn still zu ignorieren und von vorne zu
beginnen wäre die freundlichere und die schlechtere Variante: Der Client bekäme dieselben Einträge
noch einmal, ohne Hinweis – eine Endlosschleife, die wie normales Verhalten aussieht.

### Der Projektfilter ist eine Prüfung, kein Filter

`?projectId=` einfach in die `WHERE`-Bedingung zu hängen wäre **sicher** – der Mandant steht ohnehin
daneben, ein fremdes Projekt ergäbe eine leere Liste statt fremder Daten. Es wäre trotzdem falsch,
weil „leere Liste" und „gibt es nicht" für den Client dasselbe wären: Ein Client mit veralteter
Projekt-ID sähe einen leeren Feed und glaubte, es sei nichts passiert.

Deshalb erst nachschlagen, dann filtern – mit **404** für ein fremdes wie für ein nicht existierendes
Projekt, nach der Regel aus Sprint 2.

---

## Dashboard

### `GET /organizations/:orgId/dashboard/stats` · alle Mitglieder

Kein `@Rollen()`: Die Zahlen enthalten nichts, was ein `MEMBER` nicht ohnehin sehen darf – wer die
Projektliste und das Board öffnen kann, zählt sie von Hand ab. Eine Rollenprüfung wäre hier
Sicherheitstheater.

```json
{
  "projects": { "active": 3, "archived": 1 },
  "tasks": { "todo": 12, "inProgress": 4, "done": 20, "open": 16 }
}
```

**Flach und ohne Prozentwerte.** Ein Anteil „60 % offen" lässt sich aus zwei Zahlen jederzeit
ausrechnen; aus einem gerundeten Prozentwert bekommt man die Zahlen nie zurück. Was der Server
herausgibt, sollte die kleinste Form sein, aus der sich alles andere ableiten lässt.

`open` ist abgeleitet (`todo + inProgress`) und wird trotzdem mitgeliefert – es ist die Zahl, die
groß auf dem Dashboard steht. Sie im Frontend zu addieren wäre dieselbe Rechnung an einer zweiten
Stelle, und die zweite Stelle vergisst man, wenn ein vierter Status dazukommt.

**Archivierte Projekte zählen bei den Aufgaben nicht mit.** Das ist eine fachliche Festlegung, keine
technische: Die Kennzahlen beschreiben die *laufende* Arbeit. Sonst bliebe die Zahl offener Aufgaben
dauerhaft aufgebläht, obwohl niemand mehr daran arbeitet. Bei den Projekten selbst werden sie
getrennt ausgewiesen.

**Der Pfad hat einen zweiten Abschnitt**, obwohl es nur eine Ressource gibt. `/dashboard` allein
wäre kürzer – und müsste beim nächsten Bestandteil (etwa einer Verlaufskurve) entweder aufgebrochen
oder mit einem immer größeren Objekt beantwortet werden. Ein Endpoint, der alles liefert, was die
Oberfläche gerade braucht, ist der Anfang einer Schnittstelle, die sich nach dem Frontend richtet
statt nach den Daten.

### Drei Abfragen in einer Transaktion – mit `REPEATABLE READ`

Gemessen in `12_TESTING.md`: 4 statt 202 Abfragen bei 100 Projekten. Der Punkt ist nicht die
kleinere Zahl, sondern dass sie **nicht mit den Daten wächst**.

Die Isolationsstufe ist dabei kein Beiwerk. Eine Transaktion allein macht die drei Zahlen **nicht**
konsistent: Bei der Voreinstellung `READ COMMITTED` bekommt jede Anweisung ihren eigenen
Schnappschuss. Wird zwischen der zweiten und der dritten eine Aufgabe angelegt, beschreiben sie
verschiedene Stände – das Dashboard zeigte Zahlen, die zusammen nie gegolten haben.
`REPEATABLE READ` friert den Schnappschuss beim ersten Lesen ein.

Der Preis ist hier gering, weil nur gelesen wird – es gibt keine Schreibkonflikte, die einen
Serialisierungsfehler auslösen könnten. Bei einer schreibenden Transaktion wäre das eine andere
Abwägung: Dort müsste der Aufrufer mit Wiederholungen rechnen.

---

---

## GitHub-Integration

### `POST /organizations/:orgId/projects/:projectId/repository` · OWNER, ADMIN

Verbindet ein Projekt mit einem GitHub-Repository.

```json
{ "repositoryFullName": "acme/webshop" }
```

**201 Created**

```json
{
  "id": "6f1c…",
  "repositoryFullName": "acme/webshop",
  "webhookUrl": "http://localhost:3000/webhooks/github/6f1c…",
  "createdAt": "2026-08-16T15:40:00.000Z",
  "geheimnis": "9a3f…"
}
```

| Status | Wann |
|---|---|
| 201 | verbunden |
| 400 | `repositoryFullName` nicht in der Form `owner/repo` |
| 401 | kein Token |
| 403 | `MEMBER` |
| 404 | Projekt gehört nicht zu dieser Organisation – oder es gibt es nicht |
| 409 | Projekt ist bereits verbunden · Projekt ist archiviert |

#### Das Geheimnis kommt genau einmal

Es steht **nur** in dieser Antwort. Danach liegt es verschlüsselt in der Datenbank (ADR-014) und ist
über keinen Endpoint mehr abrufbar. Wer es verliert, trennt und verbindet neu – dieselbe
Entscheidung wie bei den Einladungs-Token.

Der Test dazu greift bewusst an der API vorbei direkt in die Datenbank: Nur dort lässt sich zeigen,
dass gespeichert wurde, was gespeichert werden soll – nicht der Klartext, aber auch **kein Hash**,
sondern etwas, das sich mit dem Schlüssel wieder lesen lässt. Wäre es ein Hash, liefe die
Signaturprüfung in Scheibe 5.3 ins Leere, und das fiele erst dort auf.

#### Warum 409 und kein stilles Ersetzen

Ein `upsert` wäre bequemer: verbinden oder ersetzen, ein Aufruf. Er würde aber ein bestehendes
Geheimnis überschreiben – und der bereits in GitHub eingetragene Webhook wäre ab diesem Moment
kaputt, ohne dass es jemandem auffällt, bis das erste Ereignis ausbleibt.

> **Eine unumkehrbare Nebenwirkung darf nicht der Standardfall eines bequemen Aufrufs sein.**

Abgefangen wird die Verletzung des `UNIQUE`-Constraints (Prisma-Code P2002), **nicht** vorher
gelesen: Zwischen einem `findFirst` und dem `create` passen zwei gleichzeitige Anfragen durch.

#### Warum die Verbindungs-ID in der Webhook-URL steht

Die URL, die der Nutzer in GitHub einträgt, enthält die ID der Verbindung. Sie **wählt aus, mit
welchem Geheimnis die Signatur nachgerechnet wird** (Scheibe 5.3).

Die Alternative wäre, das Repository aus der Nutzlast zu lesen und die Verbindung darüber zu
finden. Das wäre die falsche Reihenfolge: Ungeprüftes Material würde den Schlüssel auswählen, mit
dem es selbst geprüft werden soll.

Die ID ist dabei **kein Geheimnis**. Wer sie kennt, kann Anfragen schicken; ohne das Geheimnis
scheitert jede davon an der Signatur. Genau das ist der Unterschied zwischen einer Kennung und
einem Berechtigungsnachweis.

### `GET /organizations/:orgId/projects/:projectId/repository` · alle Mitglieder

**200 OK** mit der Verbindung – **ohne** `geheimnis` – oder `null`, wenn keine besteht.

`null` und keine 404: „Dieses Projekt hat kein Repository" ist eine gültige Auskunft über ein
existierendes Projekt. Eine 404 wäre mehrdeutig – sie hieße entweder „Projekt gibt es nicht" oder
„Verbindung gibt es nicht", und der Client könnte die Fälle nicht unterscheiden.

Lesbar für **jedes** Mitglied: Wer im Projekt arbeitet, darf wissen, woher die Ereignisse kommen.
Das Geheimnis steht dabei nicht in der Antwort, auch nicht für einen OWNER.

### `DELETE /organizations/:orgId/projects/:projectId/repository` · OWNER, ADMIN

**204 No Content.** 404, wenn nichts zu trennen ist.

Umgesetzt als `deleteMany` mit dem Mandantenfilter in der Bedingung, nicht als `delete` mit
anschließender Prüfung – eine Zeile fremder Herkunft wird gar nicht erst geladen. Die bereits
empfangenen Zustellungen gehen über `ON DELETE CASCADE` mit; die daraus **entstandenen**
Feed-Einträge bleiben. Was passiert ist, ist passiert.

### Warum diese Routen an `projects` hängen und nicht an `organizations`

Ein Repository wird einem **Projekt** zugeordnet, nicht einer Organisation: Der Feed ist nach
Projekt filterbar, und ein Team hat mehrere Projekte mit verschiedenen Repositories. Die Alternative
wäre eine Liste unter `/organizations/:orgId/repositories` gewesen – dann müsste jede Zeile ihr
Projekt selbst mitführen, und „höchstens eines je Projekt" wäre nicht mehr am Pfad ablesbar.

---

## Geplante Endpoints

| Sprint | Endpoints |
|---|---|
| 1 | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| 2 | `GET/POST /organizations`, `POST /organizations/:id/invitations`, `GET /organizations/:id/members` |
| 3 | `GET/POST/PATCH/DELETE /projects`, `/tasks`, `PATCH /tasks/:id/position` |
| 4 | ~~`GET …/activity`~~, ~~`GET …/dashboard/stats`~~ – **beide umgesetzt** |
| 5 | ~~`POST/GET/DELETE …/projects/:projectId/repository`~~ – **umgesetzt** · `POST /webhooks/github/:connectionId` – Scheibe 5.3 |
