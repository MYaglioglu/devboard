# Architektur

Stand: Sprint 0. Wächst mit jedem Sprint.

---

## Gesamtbild

```
Browser
   │  HTTPS
   ▼
Next.js  (Frontend, Port 3001)
   │  REST + JSON
   ▼
NestJS   (Backend, Port 3000)
   │  Prisma
   ▼
PostgreSQL  (Container, Port 5432)
```

Frontend und Backend sind **getrennte Anwendungen** mit eigenem Build und eigenem Container. Das
Frontend rendert und ruft die API; die gesamte Fachlogik und jede Autorisierungsentscheidung liegt
im Backend.

Warum nicht die API-Routes von Next.js? Weil das genau die Schichtentrennung verhindert, die hier
gelernt werden soll – und weil ein eigenständiges Backend der Normalfall in Stellenausschreibungen
ist. Siehe ADR-002.

### Netzwerk

Innerhalb des Docker-Netzwerks sprechen die Dienste über ihre **Service-Namen** miteinander
(`db:5432`), nicht über `localhost`. `localhost` bedeutet innerhalb eines Containers immer den
Container selbst.

### CORS – warum es zwei Anwendungen betrifft

Sobald der Browser von `http://localhost:3001` eine Anfrage an `http://localhost:3000` schickt, gilt
das als **fremde Herkunft (Origin)** – ein abweichender Port genügt, Schema und Host müssen ebenfalls
übereinstimmen. Der Browser blockiert die Antwort, wenn der Server nicht ausdrücklich erlaubt, dass
diese Herkunft zugreifen darf.

Das ist kein Hindernis, sondern Schutz: Ohne diese Regel könnte eine beliebige Webseite im
Hintergrund Anfragen an deine API stellen – mit den Cookies des angemeldeten Nutzers.

Erlaubt wird die Herkunft im **Backend**, konfiguriert über `CORS_ORIGIN`:

```ts
app.enableCors({ origin: [...], credentials: true });
```

Bewusst **kein** `origin: '*'`. Das erlaubte jeder Webseite den Zugriff, und in Verbindung mit
`credentials: true` verbietet die Spezifikation den Platzhalter ohnehin.

**Debugging-Hinweis:** Im JavaScript kommt bei einem CORS-Verstoß nur `Failed to fetch` an – ohne
Details. Der Browser verrät dem Skript absichtlich nichts, sonst wäre die Sperre umgehbar. Der
tatsächliche Grund steht ausschließlich in der Browser-Konsole.

---

## Frontend

```
frontend/src/
  app/            App Router: Layouts und Seiten
    layout.tsx    Wurzel-Layout, Metadaten
    page.tsx      Startseite: Systemstatus
  lib/
    api.ts        Zugriff auf das Backend, Basis-URL und Typen
```

**Das Frontend kennt die Datenbank nicht.** Es spricht ausschließlich über HTTP mit dem Backend.
Keine Datenbankverbindung, kein ORM, keine Fachlogik, keine Autorisierungsentscheidung – die liegen
vollständig im Backend. Genau diese Trennung ist der Zweck zweier getrennter Anwendungen.

### Server Components und Client Components

| | Läuft | CORS | Zugriff auf Geheimnisse |
|---|---|---|---|
| **Server Component** | auf dem Server | entfällt (Server zu Server) | ja |
| **Client Component** (`'use client'`) | im Browser | greift | nein |

Die Statusseite ist bewusst eine Client Component: Der Status soll sich im Browser aktualisieren
lassen, und die spätere Datenhaltung mit TanStack Query läuft ebenfalls dort.

**Wichtig zu wissen:** Ein `fetch` in einer Server Component löst nie einen CORS-Fehler aus, weil
kein Browser beteiligt ist. Wer einen CORS-Fehler dadurch „behebt", dass er die Anfrage auf den
Server verschiebt, hat ihn nicht verstanden – manchmal ist es die richtige Lösung, oft ist es eine
Verlagerung des Problems.

### Anmeldung im Frontend

```
Seitenaufruf
   │
   ▼
AuthProvider ruft einmal POST /auth/refresh auf   (Cookie geht automatisch mit)
   │
   ├── 200 → Access-Token in eine JS-Variable, Nutzer in den State
   └── 401 → abgemeldet
   │
   ▼
authFetch(pfad)  hängt "Authorization: Bearer …" an
   │
   ├── 200 → fertig
   └── 401 → einmal erneuern, dann genau einen Wiederholungsversuch
```

**Der Access-Token liegt in `useRef`, nicht in `localStorage` und nicht in `useState`.**

- Nicht `localStorage`: Dort ist er für jedes Skript auf der Seite lesbar – eine XSS-Lücke, auch in
  einer fremden Bibliothek, genügt. Siehe ADR-007.
- Nicht `useState`: Der Token ist kein Anzeigezustand. Seine Änderung soll kein Neuzeichnen
  auslösen. Der *Nutzer* dagegen schon – der steht in `useState`.

Beim Neuladen ist der Token weg. Das ist gewollt: Die Sitzung wird still über das
httpOnly-Refresh-Cookie wiederhergestellt, an das JavaScript nicht herankommt. Deshalb gibt es den
Zustand `laedt` – ohne ihn blitzte beim Neuladen kurz die Anmeldemaske auf.

**Genau ein Wiederholungsversuch bei 401.** Ohne diese Grenze entstünde bei dauerhaft ungültiger
Sitzung eine Endlosschleife aus 401 und Erneuerungsversuchen.

### `credentials: 'include'` – wo CORS ein zweites Mal zuschlägt

Bei Anfragen über Herkunftsgrenzen schickt der Browser Cookies standardmäßig **nicht** mit – auch
dann nicht, wenn CORS grundsätzlich erlaubt ist. Ohne diese Angabe käme das Refresh-Cookie nie beim
Backend an und `/auth/refresh` antwortete immer mit 401.

Die Erlaubnis muss auf **beiden** Seiten stehen:

```
Client:  credentials: 'include'
Server:  enableCors({ credentials: true, origin: <konkrete Herkunft> })
```

Und genau deshalb verbietet die Spezifikation `origin: '*'` in Verbindung mit Anmeldedaten: Sonst
könnte jede beliebige Webseite Anfragen mit den Cookies des angemeldeten Nutzers stellen **und die
Antworten lesen**.

### Geschützte Seiten sind kein Sicherheitsmechanismus

Die Komponente `<Geschuetzt>` verhindert nur, dass ein nicht angemeldeter Nutzer eine leere Seite
sieht. Sie schützt **keine Daten** – alles dort läuft im Browser und ist mit den
Entwicklerwerkzeugen in Sekunden auszuhebeln. Ein Angreifer würde die Seite ohnehin nicht aufrufen,
sondern die API direkt.

Der echte Schutz sitzt im globalen Guard des Backends. Selbst wer die Weiterleitung umgeht, bekommt
nichts zu sehen: Die Daten kämen gar nicht erst an.

**Frontend-Schutz ist Benutzerführung, Backend-Schutz ist Sicherheit.** Dasselbe gilt für die
Formularvalidierung: Zod im Browser ist Bequemlichkeit, Zod im Backend ist Kontrolle.

### Umgebungsvariablen im Frontend

Variablen mit dem Präfix `NEXT_PUBLIC_` werden beim **Build** in das Browser-Bundle eingebacken.
Sie sind für jeden Besucher lesbar – dort gehören **niemals** Geheimnisse hinein. Ohne das Präfix
ist eine Variable nur serverseitig sichtbar.

---

## Backend – Schichten

```
Controller   nimmt HTTP entgegen, validiert Eingaben, gibt Antworten zurück
    │        kennt HTTP, kennt keine Fachlogik
    ▼
Service      enthält die Fachlogik
    │        kennt kein HTTP
    ▼
Repository   Datenzugriff (über Prisma)
    │
    ▼
Datenbank
```

**Regel: Controller dünn, Service dick.** Ein Controller nimmt entgegen, gibt weiter, antwortet.
Die Logik liegt im Service – dadurch ist sie auch aus einem Cronjob, einem Queue-Worker oder einem
Unit-Test heraus aufrufbar. Ein Service, der `request` und `response` kennt, kann das nicht.

Die Abhängigkeiten zeigen **nur nach unten**. Ein Service darf keinen Controller aufrufen.

---

## Dependency Injection

Klassen erzeugen ihre Abhängigkeiten nicht selbst, sondern bekommen sie hineingereicht:

```ts
@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}
}
```

Nest liest beim Start die Konstruktor-Typen aus (möglich durch `emitDecoratorMetadata` in der
`tsconfig.json`), erzeugt jede registrierte Klasse einmal und verdrahtet sie miteinander. Der Ort,
an dem dieser Objektgraph entsteht, ist die **Composition Root** in `main.ts`.

**Warum das nicht optional ist:** Eine Klasse, die `new PrismaService()` selbst aufruft, ist an eine
echte Datenbank gekettet. Sie lässt sich nicht isoliert testen, Fehlerfälle lassen sich nicht
simulieren, die Implementierung nicht austauschen. Genau deshalb sind Enterprise-Backends so gebaut.

Provider sind standardmäßig **Singletons** – eine Instanz für die gesamte Anwendung.

---

## Feature-basierte Modulstruktur

Nicht nach technischen Schichten gruppieren, sondern nach Fachlichkeit:

```
backend/src/
  main.ts                  Composition Root
  app.module.ts            Wurzelmodul, hängt Feature-Module ein
  config/                  Umgebungsvariablen + Validierung (Zod)
  health/                  health.module.ts, health.controller.ts
  auth/                    Sprint 1
  organizations/           Sprint 2
  projects/                Sprint 3
  tasks/                   Sprint 3
  prisma/                  PrismaService (globales Modul)
```

**Warum nicht `controllers/`, `services/`, `repositories/`?** Weil bei einer Änderung an „Tasks"
dann drei entfernte Ordner angefasst werden. Bei feature-basierter Gliederung liegt alles zu einem
Thema beieinander, Module lassen sich als Ganzes verstehen, verschieben oder entfernen. Das ist in
modernen Backends der Standard.

Jedes Modul deklariert selbst, was es nach außen sichtbar macht (`exports`). Was nicht exportiert
ist, bleibt privat – Kapselung auf Modulebene.

---

## Mandantentrennung

Ab Sprint 2 gehört jedes fachliche Datum zu genau einer **Organisation**. Sie ist die Grenze, an der
Sichtbarkeit endet – und die Frage, wie diese Grenze durchgesetzt wird, prägt jede Schicht.

### Die Grenze wird an drei Stellen durchgesetzt

```
Anfrage
  │
  ├─ AccessTokenGuard      "Wer bist du?"                     → 401
  │
  ├─ MitgliedschaftsGuard  "Darfst du in diese Organisation?" → 404
  │                        "Reicht deine Rolle?"              → 403
  │
  └─ Service               "Gehört diese Ressource dorthin?"  → 404
                           "Erlaubt der Zustand das?"         → 409
```

Die **dritte** Stelle ist die, die am häufigsten fehlt. Ein Guard prüft die Organisation aus dem
**Pfad** – nicht, ob die angesprochene Ressource zu ihr gehört:

```ts
// FALSCH – der Guard hat die Organisation geprüft, nicht diese Einladung
prisma.invitation.update({ where: { id: einladungId } })

// RICHTIG
prisma.invitation.updateMany({ where: { id: einladungId, organizationId } })
```

> **Merksatz:** Die ID im Pfad gehört nicht automatisch zu der Organisation im Pfad.

### Der Mandant steht in der Bedingung, nicht in einer Prüfung danach

```ts
// Die Lücke: erst laden, dann filtern – die fremden Daten wurden schon gelesen
const alle = await prisma.membership.findMany();
return alle.filter((m) => m.userId === nutzerId);

// Richtig
return prisma.membership.findMany({ where: { userId: nutzerId } });
```

Beide liefern dasselbe Ergebnis. Der erste ist eine Lücke, die spätestens dann aufreißt, wenn jemand
später ein `select` erweitert oder Paginierung einbaut.

### Wo welche Regel liegt – und warum

| Regel | Ort | Warum dort |
|---|---|---|
| „bist du angemeldet?" | globaler Guard | hängt an nichts Fachlichem |
| „bist du Mitglied?" | globaler Guard | hängt nur an Anfragendem und Route |
| „nur `OWNER` darf Rollen ändern" | `@Rollen()` am Endpoint | hängt nur am Anfragenden |
| „`ADMIN` darf keinen `OWNER` entfernen" | Service | hängt an der Rolle des **Ziels** |
| „sich selbst entfernen darf jeder" | Service | hängt daran, **wen** es trifft |
| „der letzte `OWNER` darf nicht gehen" | Service | hängt am **Zustand** der Organisation |

> **Faustregel:** Ein Guard entscheidet über den **Zugang**, nicht über den **Einzelfall**. Sobald
> die Antwort davon abhängt, welche Ressource betroffen ist, gehört sie in den Service.

Die letzte Regel kann auf **vier** Wegen verletzt werden – entfernt werden, selbst gehen,
herabgestuft werden, Konto löschen. Deshalb steht sie einmal im Service statt viermal am Endpoint.

### Der Mandant steht im Pfad (ADR-008)

```
GET /organizations/:orgId/members
```

Damit gilt die Äquivalenz *„Route hat `:orgId`" ⟺ „Route betrifft einen Mandanten"* – und der Guard
kann global laufen, ohne dass man ihn irgendwo eintragen müsste. Ein vergessener Guard ist damit
strukturell ausgeschlossen.

Die Kehrseite: Der Guard kann nicht vergessen werden, aber **ins Leere greifen**. Schriebe ein
Controller `:organizationId`, fände er nichts und gäbe `true` zurück. Deshalb kommt der
Parametername aus einer geteilten Konstanten – ein Tippfehler ist ein Compilerfehler.

### Rollen kommen nicht aus dem Token

Sie werden bei jeder Anfrage aus der Datenbank gelesen. Der Preis ist eine Abfrage (ein exakter
Treffer im `UNIQUE (organizationId, userId)`), der Gewinn ist **Frische**: Ein Rollenentzug wirkt
sofort statt erst nach Ablauf des Access-Tokens.

### Im Frontend ist die Rolle Anzeigelogik

Ausgeblendete Knöpfe sind **Benutzerführung**. Wer sie mit den Entwicklerwerkzeugen zurückholt,
bekommt `403` oder `409`. Dieselbe Trennung wie bei der Formularvalidierung: im Browser aus
Bequemlichkeit, im Backend aus Sicherheit.

---

## Konfiguration

Umgebungsvariablen werden beim Start **validiert**. Fehlt eine Variable oder enthält sie Unsinn,
bricht die Anwendung sofort ab, statt halb zu funktionieren.

**Fail fast:** Ein Fehler soll so früh und so nah an seiner Ursache wie möglich auftreten. Ein
Container, der wegen fehlender Konfiguration gar nicht erst hochkommt, ist besser als einer, der
scheinbar läuft und Stunden später an unerwarteter Stelle umfällt.

Werte kommen aus der Umgebung, nie aus dem Code. Lokal aus `.env` (gitignored), in Produktion aus
dem Secret-Store der Umgebung.

---

## Leitplanken

- **Vertikale Slices:** ein Feature komplett durch alle Schichten, statt Schicht für Schicht.
- **Autorisierung auf Datenebene**, nicht nur am Endpoint. Jede Abfrage wird auf die Organisation des
  Nutzers eingeschränkt (ab Sprint 2).
- **Was sich aus dem Repository erzeugen lässt, gehört nicht ins Repository** (`node_modules`, `dist`).
- **Infrastruktur als Code:** Eine Konfiguration, die nicht im Repository steht, existiert nicht.
