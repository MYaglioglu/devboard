# Backend

`18_FRONTEND.md` beginnt mit dem Satz, bis dahin sei dieses Handbuch ein Backend-Buch gewesen. Das
stimmte – und stimmte doch nicht. Das Backend ist ausführlich dokumentiert, aber **nur zerlegt**:
`09_API.md` sortiert nach Endpoint, `08_DATABASE.md` nach Tabelle, `16_DECISIONS.md` nach
Entscheidung. Drei Nachschlagewerke, in denen man etwas findet, wenn man weiß, wonach man sucht.

Was fehlte, ist die Landkarte davor: **welche Ordner es gibt, was worin liegt, wie eine Anfrage
hindurchläuft und nach welchen Mustern hier gearbeitet wird.** Das ist dieses Kapitel.

---

## Was hier steht – und was ausdrücklich woanders

Jede Tatsache steht an genau einer Stelle. Alles andere verweist. Zwei Beschreibungen desselben
Sachverhalts driften auseinander, und man merkt es erst, wenn jemand nachfragt.

| Frage | Antwort steht in |
|---|---|
| Welche Ordner gibt es, was tut welche Datei? | **hier** |
| Was passiert, wenn eine Anfrage hereinkommt? | **hier** |
| Nach welchen Mustern wird gearbeitet? | **hier** |
| Wo gehört neuer Code hin? | **hier** |
| Was liefert `POST /organizations`, mit welchen Statuscodes? | `09_API.md` |
| Welchen Typ hat `tasks.position`, warum dieser Index? | `08_DATABASE.md` |
| Warum fractional indexing statt Integer-Positionen? | `16_DECISIONS.md` (ADR-009) |
| Welche Tests sichern die Mandantengrenze? | `12_TESTING.md` |
| Was ist umgesetzt, was ist offen? | `10_SECURITY.md` |
| Wie ist das Zusammenspiel mit dem Frontend? | `02_ARCHITECTURE.md`, `18_FRONTEND.md` |

---

## Das Bild in einem Absatz

Eine NestJS-Anwendung mit **36 Endpoints** über **10 Datenmodelle**, aufgeteilt in **elf
Feature-Ordner** unter `src/`. Jeder Ordner ist ein NestJS-Modul mit demselben Aufbau: ein
Controller nimmt HTTP entgegen, ein Service macht die Arbeit, ein DTO beschreibt die Eingabe. Drei
globale Guards laufen vor jedem Endpoint, ein Filter formt jede Antwort im Fehlerfall. Der
Datenzugriff geht ausnahmslos über einen einzigen `PrismaService`.

Die Fachlichkeit steckt in fünf Bereichen: **Auth**, **Mandantentrennung**, **Kanban-Board**,
**Aktivitäten/Dashboard** und **GitHub-Webhooks**.

---

# Teil A · Die Landkarte

## A1 · Ordnerübersicht

```
backend/
├── prisma/            Schema und 11 Migrationen  ->  08_DATABASE.md
├── scripts/           Messskripte (kein Anwendungscode)
├── test/              13 E2E-Testdateien mit eigener Jest-Konfiguration
└── src/
    ├── main.ts        Composition Root: Prozess starten
    ├── app.module.ts  Zusammenbau: Module, Guards, Filter, Middleware
    │
    ├── config/        Umgebungsvariablen validieren          Fundament
    ├── common/        Fehlerfilter und Validierungs-Pipe     Fundament
    ├── prisma/        Datenbankzugang                        Fundament
    ├── health/        Lebt der Server? Lebt die Datenbank?
    │
    ├── auth/          Registrierung, Login, Token, Rotation      1.724 Zeilen
    ├── organizations/ Organisationen, Rollen, Einladungen        1.799 Zeilen
    ├── projects/      Projekte                                     648 Zeilen
    ├── tasks/         Aufgaben, Board-Positionen, Kalender       1.686 Zeilen
    ├── activities/    Aktivitäten schreiben und lesen            1.013 Zeilen
    ├── dashboard/     Kennzahlen                                   176 Zeilen
    ├── webhooks/      GitHub-Integration                         1.618 Zeilen
    │
    └── generated/     Prisma-Client. NICHT von Hand pflegen.
```

Die drei Fundament-Ordner werden von allen benutzt und kennen selbst niemanden. Die sieben
Fachordner kennen das Fundament, aber möglichst wenig voneinander.

## A2 · Fundament

### `src/config/`

| Datei | Rolle |
|---|---|
| `env.schema.ts` | Zod-Schema aller Umgebungsvariablen + `validateEnv()` |

**Die einzige Funktion, die zählt:** `validateEnv()` läuft beim Start, aufgerufen vom `ConfigModule`
in `app.module.ts`. Ist die Konfiguration unbrauchbar, **bricht die Anwendung sofort ab** (fail
fast), statt später an unerwarteter Stelle mit `undefined` umzufallen.

Zwei Variablen haben **bewusst keinen Default**: `JWT_SECRET` und `WEBHOOK_ENCRYPTION_KEY`. Ein
voreingestelltes Geheimnis wäre kein Geheimnis – jeder, der das öffentliche Repository kennt, könnte
sich damit Token ausstellen. `DATABASE_URL` ebenfalls nicht: ohne Datenbank darf nicht gestartet
werden.

Der Unterschied zwischen den beiden Längenprüfungen ist lehrreich:

- `JWT_SECRET: min(32)` – ein **Richtwert**. HS256 erwartet mindestens so viel Entropie wie die
  Ausgabe des Hashverfahrens.
- `WEBHOOK_ENCRYPTION_KEY: /^[0-9a-fA-F]{64}$/` – eine **harte Vorgabe**. AES-256 verlangt genau
  32 Byte; Node wirft sonst `Invalid key length`. Ein zu kurzer Schlüssel ist hier nicht „etwas
  schwächer", sondern gar nicht lauffähig – und dieser Fehler soll beim **Start** auftreten, nicht
  beim ersten Verbinden eines Repositories.

`export type Env = z.infer<typeof envSchema>` – der Typ wird aus dem Schema **abgeleitet**, nicht
doppelt gepflegt. Deshalb kann `config.get('PORT', { infer: true })` in `main.ts` typsicher sein.

### `src/common/`

| Datei | Rolle |
|---|---|
| `filters/http-exception.filter.ts` | wandelt jede Ausnahme in eine einheitliche Antwort |
| `pipes/zod-validation.pipe.ts` | prüft eingehende Daten gegen ein Zod-Schema |

**`HttpExceptionFilter.catch()`** ist als `APP_FILTER` global registriert und unterscheidet zwei
Fälle:

- Eine `HttpException` ist eine **absichtliche Aussage des Codes** („E-Mail bereits vergeben"). Ihre
  Meldung ist für Nutzer gedacht und geht unverändert hinaus – dadurch bleiben auch die
  feldbezogenen Meldungen der Zod-Pipe erhalten.
- Alles andere ist unerwartet. Es wird **vollständig ins Log geschrieben** und nach außen mit
  „Interner Serverfehler" beantwortet.

Das ist eine Sicherheitsmaßnahme, keine Kosmetik: Ein Stacktrace in der Antwort verrät Dateipfade,
Bibliotheksversionen und Teile des Quelltexts. **Nach innen alles protokollieren, nach außen nur das
Nötige.**

**`ZodValidationPipe.transform()`** läuft zwischen Request und Controller. Schlägt die Prüfung fehl,
kommt ein **400** mit einer Feld-zu-Meldung-Zuordnung zurück, damit das Frontend Fehler direkt am
passenden Eingabefeld anzeigen kann.

Warum Zod statt des NestJS-üblichen class-validator: Das Frontend nutzt Zod ohnehin (React Hook
Form), Zod **leitet den TypeScript-Typ aus dem Schema ab** – bei class-validator pflegt man Typ und
Validierung getrennt und sie laufen auseinander –, und Zod kann Werte zugleich normalisieren:
E-Mail trimmen und kleinschreiben passiert in derselben Zeile wie die Prüfung. Der bekannte Preis:
Die automatische Swagger-Erzeugung von NestJS ist auf class-validator zugeschnitten.

### `src/prisma/`

| Datei | Rolle |
|---|---|
| `prisma.service.ts` | dünne Hülle um den generierten `PrismaClient` |
| `prisma.module.ts` | `@Global` – jedes Modul kann `PrismaService` injizieren |

`PrismaService` erbt von `PrismaClient` und implementiert `OnModuleInit` / `OnModuleDestroy`. Ohne
sauberes `$disconnect` beim Herunterfahren bleiben Verbindungen im Pool der Datenbank hängen.

`@Global` ist hier **richtig**, weil Datenbankzugriff ein Querschnittsthema ist. Bei einem
Feature-Modul wäre `@Global` ein Fehler – es hebelt genau die Kapselung aus, wegen der es Module
gibt. Vergleiche `ActivitiesModule`: bewusst **nicht** global.

### `src/health/`

`GET /health` – öffentlich, prüft Prozess **und** Datenbank. Der billigste Endpoint im Projekt und
der erste, den ein Betreiber aufruft. Details in `13_DEPLOYMENT.md`.

## A3 · `src/auth/` – 14 Dateien, 1.724 Zeilen

Der dichteste Ordner. Aufgeteilt nach **Zuständigkeit**, nicht nach Dateigröße:

| Datei | Rolle | Wichtigste Funktionen |
|---|---|---|
| `auth.controller.ts` | 6 Routen unter `/auth` | `register`, `login`, `refresh`, `logout`, `profil`, `demo` |
| `auth.service.ts` | Ablauflogik | `register()`, `login()`, `erneuere()`, `abmelden()` |
| `password.service.ts` | argon2id | `hash()`, `verify()` |
| `token.service.ts` | JWT | `erstelleAccessToken()`, `pruefeAccessToken()` |
| `refresh-token.service.ts` | Rotation + Diebstahlerkennung | `erstelleNeueFamilie()`, `rotiere()`, `beendeSitzung()` |
| `demo.service.ts` | Demo-Konten für Recruiter | `starte()`, `raeumeAbgelaufeneAuf()` |
| `cookie.ts` | Cookie-Name und -Optionen | `refreshCookieOptions()` |
| `throttle.ts` | strengere Grenze für die Anmeldung | `ANMELDE_GRENZE` |
| `guards/access-token.guard.ts` | globaler Auth-Guard | `canActivate()` |
| `decorators/public.decorator.ts` | Route freigeben | `@Oeffentlich()` |
| `decorators/current-user.decorator.ts` | Nutzer im Controller | `@AktuellerNutzer()` |

**Warum vier Services statt einem:** Jeder kapselt **ein** Verfahren. `PasswordService` weiß, was
argon2 ist, sonst niemand. `TokenService` weiß, was ein JWT ist, sonst niemand. Will man später
argon2 austauschen oder von HS256 auf RS256 wechseln, ist genau eine Datei betroffen. `AuthService`
kennt nur den **Ablauf**, keine Kryptographie.

**Die interessanteste Stelle im ganzen Backend: `RefreshTokenService.rotiere()`.**

Refresh-Tokens gehören zu einer **Familie** – eine Anmeldung ist eine Familie. Jeder Refresh
verbrennt das alte Token und gibt ein neues aus. Taucht ein **bereits verbrauchtes** Token erneut
auf, gibt es dafür nur eine Erklärung: Es wurde kopiert. Dann wird nicht etwa nur dieses Token
abgelehnt, sondern `widerrufeFamilie()` invalidiert die **gesamte Familie** – Angreifer und
rechtmäßiger Nutzer fliegen beide raus, und der Nutzer muss sich neu anmelden.

Das ist der Punkt, an dem sich dieses Auth von einem Tutorial unterscheidet.

`hashe()` speichert Refresh-Tokens **nur als Hash** – dasselbe Prinzip wie beim Passwort. Wer die
Datenbank liest, bekommt keine gültigen Sitzungen.

**`AccessTokenGuard.canActivate()`** läuft als `APP_GUARD` vor **jedem** Endpoint, liest den
`Authorization: Bearer`-Kopf, prüft den JWT und hängt das Ergebnis als `anfrage.nutzer` an. Ist die
Route mit `@Oeffentlich()` markiert, winkt er durch. Siehe C6 zu „secure by default".

## A4 · `src/organizations/` – 13 Dateien, 1.799 Zeilen

Hier liegt die Mandantentrennung.

| Datei | Rolle |
|---|---|
| `organizations.controller.ts` | `POST /organizations`, `GET /organizations` – **ohne** `:orgId` |
| `organization-scoped.controller.ts` | alles unter `/organizations/:orgId` – fünf Routen |
| `invitations.controller.ts` | **zwei** Controller: org-gebunden und `/invitations/accept` |
| `organizations.service.ts` | `erstelle`, `findeMeine`, `findeEine`, `findeMitglieder`, `benenneUm`, `aendereRolle`, `entferneMitglied` |
| `invitations.service.ts` | `lade`, `findeOffene`, `ziehZurueck`, `nimmAn` |
| `guards/membership.guard.ts` | **`MitgliedschaftsGuard`** + Konstante `ORG_PARAM` |
| `decorators/roles.decorator.ts` | `@Rollen(Role.OWNER, ...)` |
| `decorators/current-membership.decorator.ts` | `@AktuelleMitgliedschaft()` |

**Warum zwei Organisations-Controller?** Weil der `MitgliedschaftsGuard` an `:orgId` hängt. Routen
**ohne** `:orgId` – eine Organisation gründen, die eigenen auflisten – dürfen nicht durch ihn
laufen: Man ist ja noch nicht Mitglied. Die Trennung macht diese Grenze an der Dateistruktur
sichtbar, statt sie in Ausnahmen zu verstecken.

**`MitgliedschaftsGuard.canActivate()`** greift **nur** bei Routen mit `:orgId`. Laut ADR-008 steht
der Mandant immer im Pfad, also gilt:

```
Route hat :orgId   <=>   Route betrifft einen Mandanten
```

Damit gibt es **keine Markierung, die man vergessen könnte**. Der Parametername kommt aus der
Konstanten `ORG_PARAM`, die auch alle Controller benutzen – sonst ließe ein Tippfehler im Pfad den
Guard ins Leere greifen.

**Die lehrreichste Stelle: wo eine Regel liegt.**

| Regel | Ort | Warum dort |
|---|---|---|
| „Nur OWNER darf Rollen ändern" | `@Rollen(Role.OWNER)` am Controller | hängt nur von der Rolle ab |
| „Es muss ein OWNER übrig bleiben" | `stelleSicherDassEinOwnerBleibt()` im Service | hängt vom Zustand der Daten ab |
| „Man darf sich selbst entfernen" | `entferneMitglied()` im Service, **kein `@Rollen()`** | hängt davon ab, **wen** es betrifft |

Der letzte Fall ist der Merksatz: **Ein Guard entscheidet über den Zugang, nicht über den
Einzelfall.** Ein `@Rollen(OWNER, ADMIN)` an `DELETE members/:userId` würde einen MEMBER abweisen,
bevor überhaupt geprüft wird, dass er nur sich selbst entfernen will.

`mitGesperrterOrganisation()` sperrt **pessimistisch** – beim letzten OWNER würde ein Konflikt Daten
zerstören, nicht bloß eine Wiederholung kosten. Das Gegenstück ist das optimistische Sperren beim
Verschieben (A6).

Einladungen liegen **nur als Hash** in der Datenbank (`hashe()`), der Klartext-Token geht genau
einmal hinaus. Wieder dasselbe Prinzip wie beim Passwort und beim Refresh-Token.

## A5 · `src/projects/` – 5 Dateien, 648 Zeilen

Der kleinste Fachordner und deshalb die beste Vorlage für ein neues Feature:

```
projects.controller.ts   dünn: fünf Routen, @Rollen wo nötig, sonst nichts
projects.service.ts      erstelle, findeAlle, findeEines, aendere, archiviere
dto/create-project.dto.ts
dto/update-project.dto.ts
projects.module.ts       importiert ActivitiesModule
```

Bemerkenswert: `archiviere()` statt `loesche()`. Ein Projekt verschwindet nicht, es wird als
archiviert markiert – Aufgaben und Aktivitäten daran behalten ihren Bezug. Der Kalender filtert
archivierte Projekte deshalb ausdrücklich heraus.

## A6 · `src/tasks/` – 10 Dateien, 1.686 Zeilen

Hier steckt die meiste echte Informatik.

| Datei | Rolle |
|---|---|
| `tasks.controller.ts` | sechs Routen, darunter `PATCH :taskId/move` |
| `tasks.service.ts` | `erstelle`, `findeAlle`, `findeEine`, `aendere`, `loesche`, **`verschiebe`** |
| `positionen.ts` | **reine Rechnung**: `berechnePosition`, `brauchtNeuverteilung`, `neueVerteilung` |
| `kalender.controller.ts` | `GET /organizations/:orgId/calendar` |
| `kalender.service.ts` | `findeZeitraum()` |
| `dto/move-task.dto.ts` | Zielspalte, Nachbarn, `version` |
| `dto/kalender-query.dto.ts` | `von`/`bis`, halboffen, höchstens 92 Tage |

**`positionen.ts` ist die wichtigste kleine Datei im Projekt.** Sie enthält **nur Rechnung** – kein
Prisma, kein Nest, keine Ein- und Ausgabe. Deshalb kostet ein Test hier fast nichts, während
derselbe Fall über die API eine Datenbank, einen Nutzer, eine Organisation und ein Projekt bräuchte.
Die Trennung ist nicht der Architekturlehre wegen gemacht, sondern weil die **Testkosten um eine
Größenordnung auseinanderliegen** (ADR-009, `12_TESTING.md`).

`Genau = Prisma.Decimal.clone({ precision: 80 })` ist die Antwort auf einen Fehler aus Sprint 3: Die
Spalte ist `numeric(65,30)`, aber `decimal.js` rundete ab 20 Stellen. **Eine Entscheidung in der
Datenbank gilt nicht automatisch im Code** – wer Genauigkeit wählt, prüft die ganze Kette: Spalte,
Treiber, Rechenbibliothek, Serialisierung.

**`TasksService.verschiebe()`** ist der komplexeste Ablauf im Backend:

1. Aufgabe mit Mandantenfilter laden
2. `version` aus dem Request mit der gespeicherten vergleichen – passt sie nicht: **409 Conflict**
3. `ladeNachbarn()` – welche Karten liegen vor und hinter der Zielposition?
4. `berechnePosition()` – der Mittelwert der Nachbarn
5. `brauchtNeuverteilung()`, gegebenenfalls `verteileNeu()`
6. Schreiben **und** Aktivität in **einer** Transaktion

**Optimistisch gesperrt, weil ein Konflikt hier nur eine Wiederholung kostet:** Zwei Leute schieben
dieselbe Karte, einer bekommt 409 und probiert erneut. Beim letzten OWNER (A4) wäre das anders, dort
würde ein Konflikt Daten zerstören. Daraus die Regel: **pessimistisch sperren, wenn ein Konflikt
Daten zerstört; optimistisch, wenn er nur eine Wiederholung kostet** (ADR-010).

**Warum der Kalender ein eigener Service ist, aber kein eigenes Modul:** Er liest Aufgaben –
dieselbe Fachlichkeit, andere Blickrichtung; ein eigenes Modul müsste `TasksModule` importieren,
ohne dass es eine Grenze gäbe, die man ziehen will. Ein eigener **Service** ist er sehr wohl: Wäre
`findeZeitraum()` eine Methode auf `TasksService`, hätte der Kalender über `this` Zugriff auf das
Schreiben samt `ActivitiesService`. **Was nicht da ist, kann man nicht versehentlich benutzen.**

Zum Kalender gehört außerdem die Geschichte einer **widerlegten** Entscheidung: Die erste Fassung
begründete ausführlich, warum `tasks` keine eigene `organizationId` braucht – und verwies dabei auf
eine Messung, die es noch nicht gab. Als sie vorlag, sagte sie das Gegenteil. ADR-021 und
`17_MISTAKES_AND_LESSONS.md`.

## A7 · `src/activities/` und `src/dashboard/`

| Datei | Rolle |
|---|---|
| `activities.service.ts` | **schreibt**: `protokolliere()`, `protokolliereVonGitHub()` |
| `activity-feed.service.ts` | **liest**: `findeSeite()`, `keysetBedingung()` |
| `cursor.ts` | `kodiereCursor()`, `dekodiereCursor()` |
| `ereignisse.ts` | `Ereignis`-Union, `zuZeile()` |
| `dashboard.service.ts` | `berechne()` |

**Zwei Services mit Absicht.** `ActivitiesService` hat **keinen eigenen `PrismaService`** – er
bekommt die Transaktion des Aufrufers übergeben und kann deshalb **gar nicht** außerhalb einer
fremden Transaktion schreiben. Wieder Schutz durch Abwesenheit. Exportiert wird nur der Schreiber;
der Feed-Dienst bleibt im Modul, weil ihn nur der eigene Controller braucht.

Ein Protokolleintrag entsteht **in der Transaktion der Änderung** (ADR-012), nicht als Ereignis
danach: **Konsistenz gehört in die Transaktion, Seiteneffekte gehören in Events – und ein
Protokolleintrag ist kein Seiteneffekt, sondern Teil der Änderung.**

> Für die GitHub-Zustellung stellt sich dieselbe Frage neu und wird **anders** beantwortet: Bei der
> Zustellung an ein fremdes System ist das Outbox-Muster der richtige Ort. Siehe A8.

**Cursor-Paginierung statt Offset.** `findeSeite()` blättert über `(createdAt, id)`, kodiert in
einem undurchsichtigen Cursor. Bei Offset würde ein neuer Eintrag zwischen zwei Seitenaufrufen alles
verschieben – man bekäme Einträge doppelt oder gar nicht. Die `id` ist der Tiebreaker: Ohne sie wäre
die Seitengrenze bei gleicher `createdAt` nicht eindeutig.

`ereignisse.ts` beschreibt Aktivitäten als **diskriminierte Union**. `zuZeile()` prüft beim
**Erzeugen** mit `never` auf Vollständigkeit – jeder neue Ereignistyp bricht die Übersetzung, bis er
behandelt ist. Das Frontend macht das beim **Empfangen** bewusst **nicht**: Ein Frontend, das
unbekannte Werte nicht erträgt, ist während jedes Deployments kaputt.

**`DashboardService.berechne()`** zählt per `groupBy` unter **`REPEATABLE READ`**. Eine Transaktion
allein macht Zahlen nicht konsistent: Bei `READ COMMITTED` bekommt jede Anweisung ihren **eigenen**
Schnappschuss, und die Zahlen passen dann nicht zueinander.

## A8 · `src/webhooks/` – 10 Dateien, 1.618 Zeilen

| Datei | Rolle |
|---|---|
| `webhooks.controller.ts` | `POST /webhooks/github/:connectionId` – **öffentlich** |
| `webhook-empfang.service.ts` | `nimmAn()` – prüfen, speichern, **sofort antworten** |
| `webhook-verarbeitung.service.ts` | `verarbeiteOffene()`, `nimmGescheiterteWiederAuf()`, `raeumeAlteZustellungenAb()` |
| `signatur.ts` | `pruefeSignatur()`, `erzeugeSignatur()` |
| `krypto.ts` | `erzeugeGeheimnis()`, `verschluessele()`, `entschluessele()`, `leseSchluessel()` |
| `uebersetzung.ts` | `uebersetze()` – GitHub-Event zu Aktivität |
| `repository-connections.service.ts` | `verbinde()`, `zeige()`, `trenne()` |

**Empfang und Verarbeitung sind getrennt** – die zentrale Entscheidung dieses Bereichs. GitHub
erwartet schnell eine Antwort; wer erst verarbeitet und dann antwortet, riskiert einen Timeout und
damit eine erneute Zustellung. `nimmAn()` prüft die Signatur, legt eine `WebhookDelivery` an und
antwortet. Die Arbeit passiert danach.

**`pruefeSignatur()` arbeitet auf den Rohbytes.** Ein HMAC ist eine Aussage über **Bytes**, nicht
über Bedeutung – deshalb `rawBody: true` in `main.ts`. Der Vergleich läuft zeitkonstant; ein
gewöhnliches `===` verriete über die Laufzeit, wie viele Zeichen stimmen.

**Idempotenz:** Dieselbe Zustellung darf mehrfach ankommen, ohne mehrfach zu wirken. `WebhookDelivery`
hält fest, was schon gesehen wurde.

**Das Webhook-Secret liegt verschlüsselt** (`krypto.ts`, `aes-256-gcm`, ADR-014) – nicht gehasht,
denn anders als ein Passwort muss es **zurückgelesen** werden, um die Signatur zu prüfen. Das ist
der Unterschied, an dem man erkennt, ob jemand Hashing und Verschlüsselung auseinanderhält.

**GCM** und nicht CBC: Der Betriebsmodus liefert zusätzlich ein Authentifizierungs-Tag. Damit fällt
auf, wenn jemand den Geheimtext verändert hat – ohne Tag würde eine manipulierte Eingabe einfach zu
einem falschen Klartext entschlüsseln, und niemand merkte es. Der Initialisierungsvektor kommt aus
`randomBytes` und ist bei **jedem** Verschlüsseln neu; ein wiederverwendeter IV hebt bei GCM den
Schutz auf.

`webhookUrl()` baut die Adresse aus `PUBLIC_BASE_URL`, **nicht** aus dem `Host`-Kopf: Der kommt vom
Client und ist fälschbar. Wer eine URL daraus zusammenbaut, lässt sich die eigene Adresse vom
Anfragenden diktieren – dieselbe Fehlerklasse wie ein Passwort-Zurücksetzen-Link auf einen fremden
Host.

## A9 · `src/generated/`

Der von `prisma generate` erzeugte Client. **Nicht von Hand pflegen, nicht lesen, nicht linten** –
`eslint.config.mjs` ignoriert den Ordner, `.dockerignore` schließt ihn aus, im Image entsteht er neu.
Ändert sich `prisma/schema.prisma`, ändert sich dieser Ordner mit.

---

# Teil B · Der Weg einer Anfrage

„Was passiert bei euch, wenn ein Request hereinkommt?" ist die häufigste Backend-Frage überhaupt.
Das hier ist die Antwort.

```
HTTP-Anfrage
   |
   v
helmet()                 Sicherheits-Kopfzeilen              app.module.ts
cookieParser()           Refresh-Cookie lesbar machen        app.module.ts
   |
   v
ThrottlerGuard           zu viele Anfragen?      -> 429      global
AccessTokenGuard         Token gültig?           -> 401      global
MitgliedschaftsGuard     Mitglied dieser Org?    -> 403/404  global, nur bei :orgId
   |
   v
ZodValidationPipe        Rumpf gültig?           -> 400      pro Route
   |
   v
Controller               dünn: entgegennehmen, weitergeben
   |
   v
Service                  die Arbeit + Mandantenfilter in der WHERE-Bedingung
   |
   v
PrismaService            SQL
   |
   v
HttpExceptionFilter      im Fehlerfall: einheitliche Form, keine Stacktraces
   |
   v
HTTP-Antwort
```

**Die Reihenfolge der drei Guards ist keine Geschmacksfrage:**

- Der Throttler steht **zuerst**, weil sonst für jede Anfrage einer Flut erst ein Token geprüft
  würde – die teure Prüfung wäre selbst der Angriffspunkt.
- Der `MitgliedschaftsGuard` braucht `anfrage.nutzer`, und das setzt der `AccessTokenGuard` eine
  Zeile darüber. **Authentifizierung vor Autorisierung.** Stünde er davor, liefe er ohne
  angemeldeten Nutzer – er wirft dann ausdrücklich, statt stillschweigend durchzuwinken.

## Durchgespielt: `PATCH /organizations/o1/projects/p1/tasks/t1/move`

| Station | was hier geschieht |
|---|---|
| `ThrottlerGuard` | Zähler für diese Herkunft unter der Grenze? |
| `AccessTokenGuard` | JWT prüfen, `anfrage.nutzer = { id, email }` setzen |
| `MitgliedschaftsGuard` | `:orgId = o1` erkannt, Mitgliedschaft laden, `anfrage.mitgliedschaft` setzen. Kein `@Rollen()` an dieser Route – jedes Mitglied darf Karten schieben |
| `ZodValidationPipe` | `MoveTaskDto`: Zielstatus, Nachbar-IDs, `version` |
| `TasksController.verschiebe()` | nimmt entgegen, ruft den Service |
| `TasksService.verschiebe()` | Aufgabe **mit** `organizationId` in der `WHERE`-Bedingung laden; `version` vergleichen, sonst 409; Nachbarn laden; Position rechnen; gegebenenfalls neu verteilen; Schreiben **und** Aktivität in einer Transaktion |
| `HttpExceptionFilter` | bei 409 die Meldung durchreichen, bei allem Unerwarteten „Interner Serverfehler" |

---

# Teil C · Die wiederkehrenden Muster

Wer diese sieben Regeln kennt, kann in jedem Ordner dieses Backends arbeiten.

## C1 · Controller dünn, Service dick

Ein Controller nimmt entgegen, ruft einen Service, gibt zurück. Er enthält **keine** Fachlogik. Wer
verstehen will, was ein Feature tut, liest den Service – wer wissen will, wie man es aufruft, liest
den Controller. `09_API.md` beschreibt die Controller-Seite, dieses Kapitel die Service-Seite.

## C2 · Der Mandant steht in der `WHERE`-Bedingung

**Nicht** in einer Prüfung nach dem Laden. Eine ID im Pfad gehört nicht automatisch zu der
Organisation im Pfad – wer erst lädt und dann vergleicht, hat die fremden Daten bereits gelesen und
verlässt sich darauf, dass jeder Pfad durch den Code die Prüfung auch wirklich erreicht.

## C3 · Ein Guard entscheidet über den Zugang, nicht über den Einzelfall

Sobald die Antwort davon abhängt, **welche** Ressource betroffen ist, gehört sie in den Service.
Beispiel: `entferneMitglied()` (A4).

## C4 · Reine Rechnung von Ein- und Ausgabe trennen

`positionen.ts`, `cursor.ts`, `ereignisse.ts`, `signatur.ts`, `krypto.ts` enthalten **nur** Rechnung:
kein Prisma, kein Nest. Nicht der Architekturlehre wegen, sondern weil die Testkosten um eine
Größenordnung auseinanderliegen.

## C5 · Schutz durch Abwesenheit

Was nicht da ist, kann man nicht versehentlich benutzen. Drei Belege im Repository:

- `ActivitiesService` hat keinen eigenen `PrismaService` – kann nur in fremden Transaktionen
  schreiben
- `KalenderService` ist eine eigene Klasse – hat über `this` keinen Zugriff aufs Schreiben
- `.dockerignore` schließt `.env` aus – kann nicht ins Image geraten

## C6 · Secure by default

Der `AccessTokenGuard` ist **global**, einzelne Routen werden mit `@Oeffentlich()` freigegeben.
Vergisst man bei `@UseGuards` pro Route den Guard, wäre die Route versehentlich offen – und niemand
merkt es, weil alles funktioniert. Vergisst man umgekehrt das `@Oeffentlich()`, antwortet der
Endpoint mit 401 und der Fehler fällt sofort auf. **Ein Versehen muss zur sicheren Seite
ausschlagen.**

## C7 · In `main.ts` nur der Prozess, alles andere ins Modul

E2E-Tests bauen die Anwendung mit `Test.createTestingModule()` direkt aus `AppModule`; `bootstrap()`
läuft dabei **nie**. Was in `main.ts` steht, fehlt im Test – und dann testet man eine andere
Anwendung als die, die später läuft. Genau so ist `cookieParser()` einmal durchgerutscht: Die
Refresh-Tests sahen nie ein Cookie und schlugen mit 401 fehl. **Der Test hatte recht – die Anwendung
war falsch zusammengebaut.**

Die eine unvermeidbare Ausnahme ist `rawBody: true`, weil es eine Option beim **Erzeugen** der
Anwendung ist. Der Schutz dagegen: Der Webhook-Controller prüft ausdrücklich, ob der Rohrumpf da
ist, und sagt genau das – statt eine falsche Signatur zu melden.

---

# Teil D · Wo gehört neuer Code hin?

| Was du schreiben willst | wohin |
|---|---|
| Neue Route zu einer bestehenden Ressource | vorhandener Controller + Service |
| Neue Ressource | neuer Ordner unter `src/`, Vorlage: `projects/` |
| Prüfung eingehender Daten | `dto/*.dto.ts` als Zod-Schema |
| Regel, die nur von der Rolle abhängt | `@Rollen()` am Controller |
| Regel, die vom Zustand der Daten abhängt | Service |
| Reine Rechnung ohne Datenbank | eigene Datei ohne Nest-Decorator (`positionen.ts` als Vorlage) |
| Etwas, das jede Anfrage betrifft | Guard, Pipe oder Filter unter `common/`, als `APP_*` im `AppModule` |
| Neue Umgebungsvariable | `config/env.schema.ts` – **und** `.env.example` |
| Schemaänderung | `prisma/schema.prisma` + Migration, dokumentiert in `08_DATABASE.md` |
| Skript, das nur misst oder erklärt | `backend/scripts/`, **nicht** nach `src/` |

Und die Regel darüber: **Vertikale Slices, nie schichtweise.** Ein neues Feature bringt Controller,
Service, DTO, Tests und Dokumentation in einer Scheibe – nicht erst alle Controller, dann alle
Services.

---

# Teil E · Zahlen

| | |
|---|---|
| Dateien unter `src/` (ohne `generated/`) | 90, davon 18 Testdateien |
| Zeilen Produktivcode | 9.352 |
| HTTP-Endpoints | 36 |
| Datenmodelle / Enums | 10 / 5 |
| Migrationen | 11 |
| Backend Unit-Tests | 228 |
| Backend E2E-Tests | 243 |
| Frontend-Tests | 216 |
| **Tests gesamt** | **687** |

Stand Sprint 8, Scheibe K.1 (Kalender-Bereichsabfrage). Der Zähler in `CLAUDE.md` nannte zu diesem
Zeitpunkt noch 494 Tests aus Sprint 4 – deshalb steht die Zahl jetzt hier, an einer Stelle, die beim
Sprint-Ende ohnehin angefasst wird.
