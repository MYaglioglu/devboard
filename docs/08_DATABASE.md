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
| `email` | `text` | **UNIQUE** |
| `name` | `text` | nullable |
| `createdAt` | `timestamp(3)` | Default `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp(3)` | von Prisma bei jedem Update gesetzt |

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
| `Organization`, `Membership` | 2 | Mandanten und Rollen |
| `Project` | 3 | Projekte innerhalb einer Organisation |
| `Task` | 3 | Aufgaben mit Status und Sortierposition |
| `ActivityEvent` | 4 | Aktivitäts-Feed |

Zu jedem Modell wird hier festgehalten: Felder, Constraints, Indizes – und **warum** ein Index
gesetzt wurde.
