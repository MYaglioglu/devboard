# Datenbank

PostgreSQL 18, im Container. Schema und Migrationen über Prisma (ADR-004, ADR-006).

---

## Aufbau

```
backend/prisma/
  schema.prisma          Datenmodell - die einzige Quelle der Wahrheit
  migrations/            versionierte SQL-Dateien, eine pro Aenderung
backend/src/generated/   generierter Client (gitignored)
```

Die Verbindungs-URL steht in `prisma.config.ts` und kommt aus `DATABASE_URL` in der Wurzel-`.env`.

**Wichtig beim Host im Connection String:**

```
localhost:5432   wenn das Backend direkt auf dem Rechner laeuft
db:5432          wenn das Backend selbst im Container laeuft (Service-Name)
```

---

## Aktuelles Schema

### `users`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel, Default `uuid()` |
| `email` | `text` | **UNIQUE**, immer kleingeschrieben gespeichert |
| `name` | `text` | nullable |
| `passwordHash` | `text` | **NOT NULL**, argon2id-Hash – nie das Passwort selbst |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma bei jedem Update gesetzt |

**Zur Spalte `passwordHash`:** Der Name benennt den Inhalt ausdrücklich. `password` wäre eine
Einladung zum Fehler – irgendwann schreibt jemand den Klartext hinein. Der gespeicherte Wert enthält
Verfahren, Version, Parameter und Salt in einem String:
`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.

**Zur Kleinschreibung von `email`:** Der `UNIQUE`-Index vergleicht zeichengenau. Ohne Normalisierung
wären `Max@example.com` und `max@example.com` zwei Konten, obwohl der Domain-Teil einer
E-Mail-Adresse nicht zwischen Groß- und Kleinschreibung unterscheidet. Normalisiert wird im
Zod-Schema, also am Rand der Anwendung.

**Migration `add_password_hash`:** Eine `NOT NULL`-Spalte ohne Default ließ sich hier nur hinzufügen,
**weil die Tabelle leer war**. Bei vorhandenen Daten hätte die Migration abgebrochen. Der
professionelle Weg heißt **Expand and Contract**: Spalte zuerst nullbar hinzufügen, Daten füllen,
dann auf `NOT NULL` umstellen – drei Migrationen statt einer.

Erzeugtes SQL:

```sql
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
```

**Warum UNIQUE auf `email` wichtig ist:** Die Eindeutigkeit wird von der **Datenbank** erzwungen, nicht
vom Anwendungscode. Eine Prüfung im Code („gibt es die E-Mail schon?") hat immer eine Lücke zwischen
Prüfen und Schreiben – zwei gleichzeitige Registrierungen können beide durchkommen. Ein
UNIQUE-Constraint kann das nicht.

**Warum UUID statt fortlaufender Integer:** IDs tauchen in URLs auf. Fortlaufende Zahlen verraten,
wie viele Nutzer es gibt, und laden zum Durchprobieren fremder IDs ein. Preis: UUIDs sind größer und
als Index etwas langsamer.

**Namenskonvention:** Modelle im Code im Singular und PascalCase (`User`), Tabellen in der Datenbank
im Plural und Kleinschreibung (`users`) – abgebildet über `@@map`.

Zusätzlich verwaltet Prisma die Tabelle `_prisma_migrations`. Darin steht, welche Migrationen bereits
angewendet wurden – so weiß Prisma auf jedem Server, was noch fehlt.

### `refresh_tokens`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel |
| `tokenHash` | `text` | **UNIQUE**, SHA-256 des Tokens – nie der Token selbst |
| `familyId` | `uuid` | Index; verbindet alle durch Rotation entstandenen Token |
| `userId` | `uuid` | Fremdschlüssel auf `users`, Index, `ON DELETE CASCADE` |
| `expiresAt` | `timestamp(3)` | 30 Tage nach Ausstellung |
| `revokedAt` | `timestamp(3)` | nullable – gesetzt, sobald verbraucht oder widerrufen |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |

**Warum hier SHA-256 und nicht argon2?** Der Token besteht aus 256 Bit Zufall und ist kein
erratbares Passwort – gegen Durchprobieren muss nichts gebremst werden. Geschwindigkeit ist hier
sogar erwünscht, weil bei jedem Erneuern geprüft wird. Bei Passwörtern ist es genau umgekehrt.

**Warum entwertete Zeilen nicht gelöscht werden:** Nur ein aufbewahrter, entwerteter Token erlaubt
es, seine Wiederverwendung überhaupt zu bemerken. Würde man ihn löschen, wäre ein gestohlener Token
nicht von einem erfundenen zu unterscheiden – und die Familie bliebe unangetastet.

**Warum `ON DELETE CASCADE`:** Wird ein Konto gelöscht, verschwinden auch seine Token. Sonst blieben
verwaiste Zeilen zurück, die auf nichts zeigen.

**Warum zwei Indizes:** `userId` für „alle Sitzungen dieses Nutzers", `familyId` für das Widerrufen
einer ganzen Familie. Ohne sie müsste PostgreSQL die Tabelle bei jedem Erneuern vollständig lesen –
bei wachsender Nutzerzahl der erste Engpass.

**Aufräumen (offen):** Abgelaufene und widerrufene Zeilen wachsen unbegrenzt. Ein regelmäßiger
Löschauftrag für alles, was älter als die maximale Lebensdauer ist, gehört später dazu.

### `organizations`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel |
| `name` | `text` | **NOT NULL** |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma bei jedem Update gesetzt |

Die Organisation ist der **Mandant**: die Grenze, an der Sichtbarkeit endet. Alles Fachliche ab
Sprint 3 (Projekte, Tasks) hängt an genau einer Organisation.

**Kein `slug`:** Ein sprechender Bezeichner wie `/orgs/acme/projects` wäre denkbar, aber wir
adressieren über UUIDs im Pfad (ADR-008). Ein Slug wäre ein zweiter Adressierungsweg ohne
zusätzlichen Nutzen – und einer, der eigene Eindeutigkeits- und Umbenennungsprobleme mitbringt.
Geparkt in `06_BACKLOG.md`.

### `memberships`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel |
| `organizationId` | `uuid` | Fremdschlüssel auf `organizations`, `ON DELETE CASCADE` |
| `userId` | `uuid` | Fremdschlüssel auf `users`, Index, `ON DELETE CASCADE` |
| `role` | `role` (Enum) | **NOT NULL**, Default `MEMBER` |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma gesetzt |

Zusätzlich: `UNIQUE (organizationId, userId)`.

**Warum ein eigenes Modell und keine reine n:m-Beziehung:** Prisma kann n:m implizit abbilden und
erzeugt dann im Hintergrund eine Verbindungstabelle mit genau zwei Spalten. Das reicht hier nicht.
Die Rolle gehört weder an den Nutzer noch an die Organisation – derselbe Mensch ist `OWNER` in
seiner eigenen Organisation und `MEMBER` in der eines Kunden. Die Rolle ist eine Eigenschaft der
**Beziehung**. Sobald eine Verbindung eigene Attribute trägt, wird sie zu einer eigenen Entität.

**Warum die Eindeutigkeit in der Datenbank steht:** Ein Nutzer darf pro Organisation nur eine
Mitgliedschaft haben, sonst wäre seine Rolle nicht eindeutig. Eine Prüfung im Code hat immer eine
Lücke zwischen Lesen und Schreiben – zwei gleichzeitig angenommene Einladungen könnten beide
durchkommen. Dasselbe Argument wie bei `users.email`.

**Warum `userId` trotz des Unique-Index noch einmal einzeln indiziert ist** – die Stelle, an der
die meisten falsch raten:

Ein zusammengesetzter Index ist ein Baum, sortiert **erst** nach `organizationId`, **dann** nach
`userId`. Eine Abfrage nach `organizationId` allein kann ihn nutzen (*Präfix-Regel* / *leftmost
prefix*), eine Abfrage nach `userId` allein **nicht** – diese Werte liegen über den gesamten Index
verstreut. `GET /organizations` („meine Organisationen") fragt aber genau nach `userId`. Ohne den
zweiten Index läse PostgreSQL bei jedem Seitenaufruf die ganze Tabelle.

> **Merksatz:** Ein zusammengesetzter Index hilft nur von **links** gelesen.

**Zum Enum `role`:** Die Datenbank erzwingt die gültigen Werte selbst – `'Admn'` kommt gar nicht
erst hinein, und Prisma erzeugt daraus einen TypeScript-Union-Typ. Der Preis: Ein neuer Wert
braucht eine Migration, Werte zu entfernen oder umzusortieren ist in PostgreSQL umständlich. Bei
einer Rollenliste, die sich alle paar Jahre ändert, ist das der richtige Tausch; bei etwas
Volatilem (frei definierbare Task-Status) wäre `TEXT` mit Referenztabelle besser.

Die Enum-Reihenfolge ist absteigend nach Rechten notiert, weil sie sich so leichter merken lässt.
**Der Code darf sich darauf nicht verlassen:** `rolle <= ADMIN` wäre ein Zahlenvergleich auf einem
Enum und bricht, sobald jemand einen Wert dazwischenschiebt.

Erzeugtes SQL:

```sql
CREATE TYPE "role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "role" NOT NULL DEFAULT 'MEMBER',
    ...
);
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE UNIQUE INDEX "memberships_organizationId_userId_key"
    ON "memberships"("organizationId", "userId");
```

**Warum zweimal `ON DELETE CASCADE`:** Eine Mitgliedschaft ohne Organisation oder ohne Nutzer ergibt
keinen Sinn – sie beschreibt ausschließlich deren Verhältnis zueinander. Zu beachten: Das löscht
beim Entfernen eines Kontos auch dessen Mitgliedschaften. War der Nutzer letzter `OWNER` einer
Organisation, bliebe diese **ohne Eigentümer** zurück. Das ist Anwendungslogik, keine
Datenbanklogik – behandelt in Scheibe 2.3.

### `projects`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel |
| `organizationId` | `uuid` | Fremdschlüssel auf `organizations`, Index, `ON DELETE CASCADE` |
| `name` | `text` | **NOT NULL** |
| `description` | `text` | optional |
| `archivedAt` | `timestamp(3)` | optional – gesetzt heißt „archiviert" |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma gesetzt |

**Warum kein zweites `organizationId` auf `tasks`:** Ein Task hängt am Projekt, das Projekt an der
Organisation. Den Mandanten zusätzlich auf `tasks` zu duplizieren, wäre schneller (kein Join), aber
es entstünde eine **zweite Wahrheit**. Weichen `task.organizationId` und
`task.project.organizationId` je voneinander ab, ist genau der Filter kaputt, dem die gesamte
Mandantentrennung vertraut. Wir filtern stattdessen über die Beziehung:

```ts
where: { id: taskId, project: { organizationId } }
```

Prisma übersetzt das in eine Bedingung **innerhalb** der Abfrage, nicht in eine Prüfung danach – die
Sprint-2-Regel bleibt gewahrt. Ein Projekt wechselt nie die Organisation, deshalb ist die geerbte
Zugehörigkeit stabil.

**Warum `archivedAt` statt `DELETE`:** Ein abgeschlossenes Projekt verschwindet aus der Liste,
seine Tasks bleiben als Verlauf erhalten. Ein echtes `DELETE` wäre unumkehrbar und nähme über
`ON DELETE CASCADE` auch die Historie mit, aus der Sprint 4 seine Kennzahlen zieht.

**Bewusst kein `UNIQUE (organizationId, name)`:** Zwei Projekte gleichen Namens sind fachlich
erlaubt – derselbe „Relaunch" in zwei Jahren. Eindeutigkeit würde hier eine Regel erzwingen, die es
fachlich nicht gibt. Anders als bei `memberships`, wo doppelte Zeilen die Rolle mehrdeutig machten.

### `tasks`

| Spalte | Typ | Constraints |
|---|---|---|
| `id` | `uuid` | Primärschlüssel |
| `projectId` | `uuid` | Fremdschlüssel auf `projects`, `ON DELETE CASCADE` |
| `title` | `text` | **NOT NULL** |
| `description` | `text` | optional |
| `status` | `task_status` (Enum) | **NOT NULL**, Default `TODO` |
| `position` | `numeric(65,30)` | **NOT NULL** – Sortierposition, siehe unten |
| `version` | `integer` | **NOT NULL**, Default `0` – optimistisches Sperren |
| `assigneeId` | `uuid` | Fremdschlüssel auf `memberships`, Index, `ON DELETE SET NULL` |
| `dueDate` | `timestamp(3)` | optional |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma gesetzt |

#### Die Sortierposition – warum `numeric` und nicht `int` oder `float`

Eine Karte wird eingefügt, indem sie den **Mittelwert ihrer beiden künftigen Nachbarn** bekommt:
zwischen `100` und `200` wird `150`. Das schreibt **eine** Zeile, unabhängig davon, wie lang die
Spalte ist.

| Ansatz | Schreibzugriffe pro Verschiebung | Problem |
|---|---|---|
| `int`, danach 1,2,3… neu vergeben | **N** (die ganze Spalte) | Zwei gleichzeitige Verschiebungen überschreiben sich gegenseitig – der Datenverlust, den F3 ausschließt |
| `int` mit Lücken (100, 200, 300) | 1 | Die Lücken gehen aus; irgendwann doch Neuvergabe |
| `numeric`, Mittelwert bilden | 1 | Die Zahl wird bei jedem Einfügen an derselben Stelle länger |
| `float8`, Mittelwert bilden | 1 | **Grenze unsichtbar** – nach ~50 Halbierungen sind die Bits verbraucht, zwei Karten bekommen denselben Wert, die Sortierung wird stillschweigend zufällig |

Gewählt: `numeric(65,30)`. Die *n*-te Halbierung an derselben Stelle braucht *n* Nachkommastellen –
ab 30 muss die Spalte neu verteilt werden. Der entscheidende Unterschied zu `float8`: **Die Grenze
ist bekannt und nachrechenbar**, also testbar. Eine bekannte Grenze mit Gegenmaßnahme ist besser
als eine unsichtbare ohne.

Zu beachten im Code: Prisma bildet `Decimal` auf ein `Decimal.js`-Objekt ab, nicht auf `number`.
Rechnen mit `+` und `/` wäre stiller Präzisionsverlust – genau der Fehler, den der Typ verhindern
soll.

#### `version` – optimistisches Sperren

Jedes Verschieben erhöht den Zähler und verlangt im `WHERE` den zuvor gelesenen Wert. Ändert das
`UPDATE` **0 Zeilen**, war jemand schneller ⇒ **409 Conflict**, das Board lädt neu.

Warum nicht die Zeilensperre (`SELECT … FOR UPDATE`) aus Sprint 2? Dort ging es um die letzte
`OWNER`-Mitgliedschaft: Ein verlorener Eigentümer lässt sich durch Neuladen nicht heilen, also muss
die zweite Anfrage warten. Auf dem Board ist der Konflikt selten und harmlos – eine Karte ist
woanders gelandet als gedacht. Warten wäre hier der teurere Weg. Abwägung in `09_API.md`.

#### Warum die Zuweisung an der Mitgliedschaft hängt, nicht am Nutzer

Zugewiesen wird nicht „ein Mensch", sondern „jemand, der in dieser Organisation mitarbeitet" – und
genau das *ist* eine Mitgliedschaft. Der praktische Gewinn: Wird jemand aus der Organisation
entfernt, verschwindet seine Mitgliedschaft, und `ON DELETE SET NULL` löst seine Zuweisungen von
selbst. Bei einem Fremdschlüssel auf `users` bliebe ein Ex-Kollege auf den Karten stehen, oder wir
müssten es im Code aufräumen und dabei irgendwann einen Pfad vergessen.

`SET NULL` statt `CASCADE`, weil die **Aufgabe** bleiben soll, nur unzugewiesen. `CASCADE` würde
beim Entfernen eines Mitglieds dessen Tasks mitlöschen. Preis: Für den Anzeigenamen geht es einen
Schritt weiter (`task.assignee.user.name`).

#### Zum Enum `task_status`

Bei `role` steht oben, dass etwas Volatiles wie „frei definierbare Task-Status" besser als `TEXT`
mit Referenztabelle aufgehoben wäre. Das gilt weiterhin – aber nur, wenn Spalten pro Projekt
konfigurierbar sind. In Sprint 3 sind sie es nicht: drei feste Spalten für alle. Solange die Liste
fest ist, ist das Enum der bessere Tausch. Werden Spalten später konfigurierbar, ersetzt eine
Tabelle `BoardColumn` dieses Enum – vermerkt in `06_BACKLOG.md`.

#### Der Index ist exakt die Board-Abfrage

```sql
CREATE INDEX "tasks_projectId_status_position_idx"
    ON "tasks"("projectId", "status", "position");
```

Das Board lädt „alle Tasks dieses Projekts, je Spalte, in Reihenfolge":

```sql
WHERE "projectId" = $1 AND "status" = $2 ORDER BY "position"
```

Weil `position` als **dritte** Spalte im Index steht und ein Index sortiert abgelegt ist, liest
PostgreSQL die Karten bereits in der richtigen Reihenfolge – der Sortierschritt entfällt
vollständig. Stünde `position` vorne, wäre der Index für diese Abfrage nutzlos: derselbe Merksatz
wie bei `memberships` – **ein zusammengesetzter Index hilft nur von links gelesen**.

Der zweite Index auf `assigneeId` dient „meine Aufgaben" und dem `SET NULL` beim Entfernen eines
Mitglieds; ohne ihn läse PostgreSQL dafür jedes Mal die ganze Tabelle.

### `activities`

Ein Eintrag pro Ereignis. **Unveränderlich** – deshalb gibt es bewusst kein `updatedAt`: Ein
Protokolleintrag, der sich ändern lässt, ist als Protokoll wertlos.

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | `uuid` | |
| `organizationId` | `uuid NOT NULL` | `ON DELETE CASCADE` |
| `type` | `activity_type` | Enum, Vergangenheitsform |
| `actorId` | `uuid NULL` | → `users`, `ON DELETE SET NULL` |
| `projectId` | `uuid NULL` | → `projects`, `ON DELETE SET NULL` |
| `taskId` | `uuid NULL` | → `tasks`, `ON DELETE SET NULL` |
| `payload` | `jsonb NOT NULL` | Einzelheiten je Ereignistyp |
| `createdAt` | `timestamp(3)` | Sortierkriterium und Cursor |

#### Warum `organizationId` hier steht, obwohl `tasks` sie bewusst nicht hat

Bei `tasks` steht als Begründung: keine zweite Wahrheit, der Mandant wird über
`project.organizationId` geerbt. Das gilt dort weiterhin. Hier wäre dieselbe Lösung falsch:

1. **Nicht jedes Ereignis hat ein Projekt.** In Sprint 5 kommen GitHub-Ereignisse in denselben
   Feed, eine Einladung hängt an der Organisation. Der Mandant ließe sich also gar nicht
   durchgängig erben – für manche Zeilen wäre er über `projects` erreichbar, für andere überhaupt
   nicht.
2. **Der Index braucht die Spalte.** PostgreSQL kann keinen Index über Spalten *zweier* Tabellen
   anlegen. Ohne eigene Spalte müsste jede Feed-Seite erst verbinden und danach sortieren – bei
   der einzigen Tabelle im Schema, die unbegrenzt wächst.

Der Preis heißt Redundanz und ist echt. Vertretbar macht ihn die **Unveränderlichkeit**: Redundanz
ist dann gefährlich, wenn zwei Kopien *auseinanderlaufen* können. Hier kann keine der beiden sich
noch bewegen.

#### Der Akteur zeigt auf `users`, nicht auf `memberships`

Anders als `tasks.assigneeId`. Eine Zuweisung fragt „wer arbeitet in dieser Organisation daran" –
das ist eine Mitgliedschaft. Ein Protokoll fragt „**wer** hat das getan" – das ist ein Mensch, und
er bleibt derselbe, wenn er die Organisation verlässt. Hinge der Akteur an der Mitgliedschaft,
löschte das `SET NULL` beim Austritt eines Kollegen rückwirkend die gesamte Urheberschaft seiner
Einträge.

#### `payload` als `jsonb`

Jeder Ereignistyp braucht andere Angaben (beim Verschieben Spalte vorher/nachher, beim Anlegen nur
den Titel). Als echte Spalten wären das ein Dutzend meist leerer Felder, und jeder neue
Ereignistyp bräuchte eine Migration.

Der Preis, klar benannt: **Die Datenbank prüft den Inhalt nicht.** Kein Constraint erzwingt, dass
bei `TASK_MOVED` auch `fromStatus` darin steht. Diese Garantie gibt der Code – `payload` wird
ausschließlich über typisierte Erzeuger geschrieben, nie als freies Objekt.

`jsonb` und nicht `json`: `json` speichert den Text unverändert und zerlegt ihn bei jedem Zugriff
neu; `jsonb` legt ihn zerlegt ab – langsamer beim Schreiben, schneller beim Lesen, und nur darauf
sind Indizes möglich. Bei einer Tabelle, die einmal geschrieben und oft gelesen wird, ist das
nicht knapp.

Der Aufgabentitel wird als **Kopie** mitgeschrieben, obwohl er in `tasks` steht. Aufgaben werden
wirklich gelöscht – ein Eintrag „Aufgabe gelöscht" zeigt unmittelbar nach seiner Entstehung auf
nichts mehr. Und ein Feed, der nach einer Umbenennung rückwirkend den neuen Titel anzeigt,
behauptet etwas Falsches über die Vergangenheit.

#### Zwei Indizes, weil es zwei Abfragen gibt

```sql
CREATE INDEX "activities_organizationId_createdAt_id_idx"
    ON "activities"("organizationId", "createdAt", "id");
CREATE INDEX "activities_projectId_createdAt_id_idx"
    ON "activities"("projectId", "createdAt", "id");
```

Der erste bedient den organisationsweiten Feed in einem Durchgang: Mandant vorne (Gleichheit),
Sortierkriterien dahinter – derselbe Gedanke wie beim Board-Index.

Der zweite ist **nicht** redundant. Der erste ist nach `organizationId`, dann `createdAt` sortiert
– die Zeilen *eines* Projekts liegen darin über den gesamten Zeitraum verstreut. Für den
projektgefilterten Feed müsste PostgreSQL alle Aktivitäten des Mandanten lesen, die fremden
Projekte wegwerfen und hoffen, früh genug 20 Treffer zu haben; bei einem Projekt, in dem seit
Monaten nichts passiert ist, liest es die halbe Tabelle. Zum zweiten Mal derselbe Merksatz: **ein
zusammengesetzter Index hilft nur von links gelesen.** Was gefiltert wird, gehört nach vorne; was
sortiert wird, dahinter.

`organizationId` steht im zweiten Index nicht – bleibt aber im `WHERE` der Abfrage. **Der Index
wählt Zeilen vor, der Mandantenfilter entscheidet über Sichtbarkeit.** Beides zu verwechseln wäre
genau der Fehler aus Sprint 2.

#### Warum kein `sort: Desc` im Index

Prisma kann `@@index([createdAt(sort: Desc)])`, und es wäre hier nutzlos. Ein B-Baum ist in **beide
Richtungen** lesbar – PostgreSQL bedient `ORDER BY … DESC` mit einem aufsteigenden Index, indem es
ihn rückwärts durchläuft (im Plan als `Index Scan Backward` sichtbar), ohne Zusatzkosten.

Eine Richtungsangabe zahlt sich erst bei **gemischter** Sortierung aus, etwa `createdAt DESC, id
ASC`: Rückwärtslesen dreht dann beide Spalten, und der Index passt zu keiner der beiden
Reihenfolgen. Solange alle Kriterien in dieselbe Richtung zeigen, ist die Angabe Ballast, den ein
späterer Leser für bedeutsam hält.

#### Der Nachweis: `EXPLAIN ANALYZE` auf 40.000 Zeilen

Alles oben Behauptete ist nachgemessen – `npm run erklaere:feed` legt 40.000 Aktivitäten auf 50
Projekte an und liest die Pläne aus.

**Erst `ANALYZE`, sonst ist die Messung wertlos.** PostgreSQL plant anhand von Statistiken, die der
Autovacuum-Prozess pflegt – der läuft aber nicht sofort nach einem Massen-`INSERT`. Ohne ein
ausdrückliches `ANALYZE activities` plant der Optimierer auf dem Stand „Tabelle ist leer" und wählt
einen Seq Scan. Das ist die häufigste Ursache für „der Index wird ignoriert" nach einem Import –
und es ist kein Fehler im Index.

**Feed der Organisation:**

```
Limit  (cost=0.41..2.69 rows=20) (actual time=0.034..0.043 rows=20 loops=1)
  Buffers: shared hit=5
  ->  Index Scan Backward using "activities_organizationId_createdAt_id_idx" on activities
        Index Cond: ("organizationId" = '…'::uuid)
Execution Time: 0.175 ms
```

Zwei Behauptungen auf einmal belegt: Der Index greift, und `Index Scan **Backward**` ist der Beweis
für den Abschnitt oben – ein aufsteigender Index bedient `ORDER BY … DESC`, indem PostgreSQL ihn
rückwärts liest. Das `sort: Desc` wäre tatsächlich Ballast gewesen. **5 Buffer** für 20 Zeilen.

**Feed eines Projekts – mit dem zweiten Index:**

```
  ->  Index Scan Backward using "activities_projectId_createdAt_id_idx" on activities
        Index Cond: ("projectId" = '…'::uuid)
        Filter: ("organizationId" = '…'::uuid)
        Buffers: shared hit=23
Execution Time: 0.082 ms
```

Genau die Arbeitsteilung, die oben beschrieben ist: **Der Index wählt vor** (`Index Cond` auf
`projectId`), **der Mandantenfilter entscheidet** (`Filter` auf `organizationId`). Dass die
Organisation nicht im Index steht, macht sie nicht weniger wirksam – sie ist nur nicht das, was die
Zeilen vorsortiert.

**Gegenprobe – derselbe Pfad, nachdem der zweite Index in einer zurückgerollten Transaktion
entfernt wurde:**

```
  ->  Index Scan Backward using "activities_organizationId_createdAt_id_idx" on activities
        Index Cond: ("organizationId" = '…'::uuid)
        Filter: ("projectId" = '…'::uuid)
        Rows Removed by Filter: 931
        Buffers: shared hit=34
Execution Time: 0.235 ms
```

**`Rows Removed by Filter: 931`** ist die Zeile, auf die es ankommt. PostgreSQL liest 951 Zeilen,
um 20 zurückzugeben – es läuft den organisationsweiten Index rückwärts ab und wirft alles weg, was
zu anderen Projekten gehört. Genau das steht oben als Begründung für den zweiten Index, und hier
steht die Zahl dazu.

Ehrlich bleibt: **Die absoluten Zeiten sagen hier nichts.** 0,235 ms gegen 0,082 ms ist kein
Argument – bei 40.000 Zeilen liegt alles im Arbeitsspeicher. Die belastbare Größe ist, wie viele
Zeilen gelesen werden mussten, und wie sich das entwickelt: Die Testdaten sind **gleichmäßig**
verteilt (1/50 der Zeilen je Projekt). Bei einem Projekt, in dem seit Monaten nichts passiert ist,
läuft derselbe Plan durch die halbe Tabelle.

#### `id` im Index ist Voraussetzung, nicht Zierde

Prisma bildet `DateTime` auf **`timestamp(3)`** ab – Millisekunden. PostgreSQL könnte
Mikrosekunden, aber JavaScript-`Date` kann sie nicht darstellen. Zwei Ereignisse aus **einer**
Transaktion bekommen damit regelmäßig denselben Zeitstempel.

Nach `createdAt` allein ist die Ordnung dann nicht total. Ein Cursor, der nur „alles älter als
dieser Zeitstempel" bedeutet, zeigt einen Eintrag doppelt oder überspringt einen – je nachdem, in
welcher Reihenfolge PostgreSQL die gleichzeitigen Zeilen liefert. Mit `id` als zweitem Kriterium
bezeichnet der Cursor eine **eindeutige** Stelle. Dieselbe Falle wie bei gleichen
`position`-Werten auf dem Board, und dieselbe Lehre wie aus dem `Date.now()`-Fehler in Sprint 3:
**Sortierung und Testisolierung dürfen nicht auf der Auflösung einer Uhr beruhen.**

---

### `repository_connections`

Die Verbindung eines Projekts zu einem GitHub-Repository (ADR-013). Höchstens eine je Projekt.

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | `uuid` | |
| `projectId` | `uuid NOT NULL UNIQUE` | → `projects`, `ON DELETE CASCADE` |
| `repositoryFullName` | `text NOT NULL` | `owner/repo` – **bewusst nicht** eindeutig |
| `secretCiphertext` | `bytea NOT NULL` | AES-256-GCM |
| `secretIv` | `bytea NOT NULL` | Initialisierungsvektor |
| `secretAuthTag` | `bytea NOT NULL` | Authentifizierungs-Tag |
| `keyVersion` | `integer NOT NULL DEFAULT 1` | für den Schlüsselwechsel |
| `createdById` | `uuid NULL` | → `users`, `ON DELETE SET NULL` |
| `createdAt`, `updatedAt` | `timestamp(3)` | |

#### Warum hier **kein** `organizationId` steht

Bei `activities` steht die Spalte, bei `tasks` nicht. Diese Tabelle folgt `tasks`, und zwar aus
denselben zwei Gründen, die dort gelten – nur umgekehrt gelesen:

1. Eine Verbindung hat **immer** genau ein Projekt. Der Mandant lässt sich also lückenlos erben,
   anders als bei `activities`, wo `projectId` optional ist.
2. Es gibt keine Abfrage „alle Verbindungen dieser Organisation, sortiert". Gelesen wird über das
   Projekt. Ohne eine solche Abfrage bräuchte kein Index die Spalte.

Für den Mandantenfilter ändert das nichts – er bleibt in der `WHERE`-Bedingung, nur eine Beziehung
weiter:

```sql
WHERE project.organizationId = $1 AND project.id = $2
```

**Die Regel lautet also nicht „jede Tabelle bekommt den Mandanten".** Sie lautet: Der Mandant muss
in der Bedingung stehen, und er muss lückenlos erreichbar sein. Ob als eigene Spalte oder über eine
Beziehung, entscheidet die Frage, ob die Kette dorthin **immer** vollständig ist.

#### Warum `repositoryFullName` **nicht** eindeutig ist

Naheliegend wäre „ein Repository kann nur einmal verbunden sein". Das wäre ein **Informationsleck
über Mandantengrenzen**: Beim Verbinden bekäme man einen Konflikt gemeldet und wüsste damit, dass
eine *fremde* Organisation dieses Repository beobachtet. Dieselbe Denkweise wie bei den 404 statt
403 aus Sprint 2 – eine Fehlermeldung darf nicht mehr verraten, als der Fragende sehen darf.

Fachlich ist Mehrfachnutzung ohnehin richtig: Zwei Teams dürfen dasselbe Repository beobachten.
Jedes richtet in GitHub seinen eigenen Webhook ein und bekommt eigene Zustellungen.

#### Warum drei Spalten für ein Geheimnis

Passwörter liegen als argon2id-Hash hier, Einladungs-Token als SHA-256-Hash. Dieses Geheimnis
**nicht** – siehe ADR-014. Der Grund ist strukturell und nicht Bequemlichkeit: GitHub legt das
Geheimnis nie vor, es schickt eine HMAC-Signatur über den Rumpf. Um dieselbe Signatur
*nachzurechnen*, braucht man das Geheimnis selbst.

> **Wiedererkennen ⇒ hashen. Nachrechnen ⇒ verschlüsseln.**

AES-256-GCM braucht drei Werte: Der Schlüsseltext allein ist ohne Initialisierungsvektor nicht zu
entschlüsseln und ohne Authentifizierungs-Tag nicht auf Unversehrtheit prüfbar. `bytea` statt
Base64 in einem `text`, weil eine Kodierung, die niemand liest, nur eine Stelle ist, an der jemand
die falsche wählen kann.

`keyVersion` ist Vorsorge mit konkretem Zweck: Ohne sie ist ein Schlüsselwechsel nur mit Ausfall
möglich – man müsste alle Zeilen in einem Zug neu verschlüsseln und dürfte dazwischen keine
Zustellung annehmen.

---

### `webhook_deliveries`

Eine von GitHub empfangene Zustellung, **roh**, bevor sie gedeutet wird (ADR-015).

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | `uuid` | |
| `connectionId` | `uuid NOT NULL` | → `repository_connections`, `ON DELETE CASCADE` |
| `eventType` | `text NOT NULL` | aus `X-GitHub-Event` |
| `deliveryId` | `text NOT NULL` | aus `X-GitHub-Delivery` |
| `payload` | `jsonb NOT NULL` | unverändert, wie empfangen |
| `status` | `webhook_delivery_status` | `ACCEPTED` / `PROCESSED` / `FAILED` |
| `fehlermeldung` | `text NULL` | für die Fehlersuche, nicht für die Anzeige |
| `versuche` | `integer NOT NULL DEFAULT 0` | |
| `receivedAt` | `timestamp(3)` | |
| `processedAt` | `timestamp(3) NULL` | |

**Constraints und Indizes**

| | Zweck |
|---|---|
| `UNIQUE (connectionId, deliveryId)` | Schutz gegen Mehrfachzustellung |
| `INDEX (status, receivedAt)` | „die ältesten noch nicht verarbeiteten" |

#### Warum der Schutz ein Constraint ist und kein `findFirst`

GitHub stellt bei jedem Fehlschlag erneut zu, mit **derselben** `deliveryId`. Der naheliegende Code
wäre: nachsehen, ob es die Zeile schon gibt, und nur sonst schreiben. Zwischen dem Lesen und dem
Schreiben passen aber zwei gleichzeitige Zustellungen durch – beide finden nichts, beide schreiben,
das Ereignis steht doppelt im Feed.

**Die Bedingung gehört ins Constraint, nicht in ein `if` davor.** Zum dritten Mal dieselbe Lehre
nach ADR-010 (optimistisches Sperren) und ADR-012 (der Protokollschreiber am `count`). Der Endpoint
schreibt also blind und fängt genau die Verletzung dieses Constraints ab.

#### Warum zusammengesetzt und nicht global auf `deliveryId`

Ein globales `UNIQUE` wäre die Zusage „diese Zustellung gab es im ganzen System schon". Damit könnte
die Zustellung *einer* Organisation die einer anderen abweisen – ein Kanal zwischen Mandanten, so
unwahrscheinlich er praktisch auch ist. Die Zusage, die wirklich gebraucht wird, ist enger:
**diese Verbindung hat diese Zustellung schon gesehen.**

#### Warum `status` im Index vorne steht

Auf `status` wird auf **Gleichheit** geprüft (`= 'ACCEPTED'`), auf `receivedAt` wird **sortiert**.
In einem zusammengesetzten B-Baum-Index gehören Gleichheitsspalten nach vorne: Sie schneiden einen
zusammenhängenden Bereich heraus, und innerhalb dieses Bereichs liegen die Zeilen bereits nach der
zweiten Spalte sortiert. Andersherum müsste PostgreSQL den ganzen Index lesen und danach filtern.
Dieselbe Regel wie beim Feed-Index auf `(organizationId, createdAt, id)`.

#### Die Kehrseite, offen benannt

Diese Tabelle speichert **fremde Rohdaten** – Commit-Nachrichten, Benutzernamen, Zweignamen. Sie
wächst unbegrenzt und enthält personenbezogene Angaben, die DevBoard nicht selbst erhoben hat. Sie
braucht deshalb eine Aufbewahrungsfrist; das ist Scheibe 5.7 und steht in `10_SECURITY.md`.

---

### Ergänzung an `activities`: die Spalte `source`

| Spalte | Typ | Anmerkung |
|---|---|---|
| `source` | `activity_source NOT NULL DEFAULT 'APP'` | `APP` / `GITHUB` |

**Diese Spalte behebt eine Falle, die vorher keine war.** `actorId` ist bisher genau dann `NULL`,
wenn ein **Konto gelöscht** wurde – das Frontend leitet daraus „Ein entferntes Mitglied" ab. Die
Ableitung war richtig, solange es nur eine Ursache für `NULL` gab.

Ein GitHub-Ereignis hat ebenfalls keinen DevBoard-Nutzer; wer gepusht hat, muss hier gar kein Konto
besitzen. Ohne unterscheidendes Feld würde der Feed also behaupten, **ein ausgetretener Kollege habe
gepusht**.

Die Alternative wäre gewesen, es aus dem `payload` zu schließen („steht ein `githubLogin` drin, ist
es GitHub"). Das wäre eine Herkunftsangabe, die die Datenbank nicht prüft und die beim ersten
Ereignistyp ohne dieses Feld still falsch wird. **Die Herkunft ist eine Eigenschaft der Zeile, kein
Nebenprodukt ihres Inhalts.**

Der Vorgabewert `APP` ist kein Bequemlichkeitswert: Alle bestehenden Zeilen stammen tatsächlich aus
der Anwendung, die Migration braucht deshalb kein Backfill-Skript. **Ein Vorgabewert ist dann
richtig, wenn er für die Altdaten wahr ist** – nicht, wenn er nur das Schreiben bequemer macht.

---

### Diese Migration wurde nicht mit `migrate dev` erzeugt

`npm run db:migrate` (also `prisma migrate dev`) ist interaktiv: Es kann bei erkannter Drift
nachfragen und dabei anbieten, die Datenbank **zurückzusetzen**. In einer nicht-interaktiven Sitzung
bleibt es an dieser Rückfrage hängen, ohne etwas auszugeben.

Der Weg hier war deshalb zweistufig – und er ist auch der ehrlichere, weil das SQL vor dem Anwenden
gelesen wurde:

```bash
# 1. SQL erzeugen, ohne irgendetwas anzuwenden
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  -o "prisma/migrations/<zeitstempel>_<name>/migration.sql"

# 2. lesen, dann anwenden
npx prisma migrate deploy
```

Zwei Anmerkungen dazu:

- **Die Flags heißen in Prisma 7 anders.** `--from-schema-datasource` gibt es nicht mehr; die
  Fehlermeldung nennt den Ersatz (`--from-config-datasource`) selbst. Wieder der Beleg für die
  Hausregel: Fehlermeldungen werden gelesen, nicht gegoogelt.
- **`ALTER TYPE … ADD VALUE` in einer Transaktion** ist erst ab PostgreSQL 12 erlaubt, und auch
  dann nur, solange der neue Wert im selben Zug nicht *benutzt* wird. Prisma warnt im erzeugten SQL
  pauschal davor. Hier läuft PostgreSQL 18 und die Migration benutzt die neuen Werte nicht – also
  unbedenklich.

---

## Arbeiten mit Migrationen

```bash
# Schema aendern -> Migration erzeugen und lokal anwenden
npm run db:migrate -- --name beschreibender_name

# Client nach Schemaaenderung neu erzeugen (macht db:migrate automatisch mit)
npm run db:generate

# Daten im Browser ansehen
npm run db:studio

# In Produktion: nur anwenden, nie erzeugen
npm run db:deploy
```

**Der Unterschied zwischen `migrate dev` und `migrate deploy` ist wichtig:**
`dev` vergleicht Schema und Datenbank, erzeugt neue Migrationsdateien und kann die Datenbank
zurücksetzen. `deploy` wendet nur vorhandene Migrationen an und verändert nie etwas anderes – das
Einzige, was auf einem Server laufen darf.

**Migrationen sind unveränderlich.** Eine bereits angewendete Migration wird nie bearbeitet. Ist
etwas falsch, kommt eine neue Migration obendrauf. Sonst laufen die Datenbanken verschiedener
Umgebungen auseinander – dieselbe Logik wie bei Git-Commits nach dem Push.

---

## Geplante Modelle

| Modell | Sprint | Zweck |
|---|---|---|
| `User` erweitert | 1 | `passwordHash`, Refresh-Token |
| ~~`Organization`, `Membership`~~ | 2 | Mandanten und Rollen – **umgesetzt** |
| `Invitation` | 2 | Einladungen per Token |
| ~~`Project`~~ | 3 | Projekte innerhalb einer Organisation – **umgesetzt** |
| ~~`Task`~~ | 3 | Aufgaben mit Status und Sortierposition – **umgesetzt** |
| ~~`Activity`~~ | 4 | Aktivitäts-Feed – **umgesetzt** (hieß in der Planung `ActivityEvent`; das `Event` ist entfallen, weil die Tabelle ein Protokoll ist und kein Event Sourcing – ADR-011) |
| ~~`RepositoryConnection`~~ | 5 | Projekt ↔ GitHub-Repository, verschlüsseltes Webhook-Geheimnis – **umgesetzt** (ADR-013, ADR-014) |
| ~~`WebhookDelivery`~~ | 5 | Empfangene Zustellungen, roh – **umgesetzt** (ADR-015) |

Zu jedem Modell wird hier festgehalten: Felder, Constraints, Indizes – und **warum** ein Index
gesetzt wurde.
