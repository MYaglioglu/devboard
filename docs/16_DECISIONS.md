# Architekturentscheidungen (ADRs)

Eine **ADR** (Architecture Decision Record) hält *eine* wichtige Entscheidung fest – zusammen mit
dem Kontext, den verworfenen Alternativen und den Konsequenzen. Das Format stammt von Michael Nygard
und ist in vielen Firmen Standard.

**Warum ADRs?** Code zeigt *was* gebaut wurde, nie *warum*. Ohne ADR fragt in sechs Monaten jemand
„warum eigentlich Prisma?" – und niemand weiß es mehr, auch der Autor nicht. Im Bewerbungsgespräch
sind ADRs außerdem der beste Beleg dafür, dass Entscheidungen bewusst getroffen wurden statt
zufällig aus einem Tutorial übernommen.

Eine ADR wird **nie gelöscht oder umgeschrieben**. Ändert sich die Entscheidung, bekommt sie den
Status „Ersetzt durch ADR-0xx" und die neue ADR wird angelegt. Die Historie ist der Wert.

Struktur: Titel · Status · Kontext · Entscheidung · Alternativen · Konsequenzen.

---

## ADR-001: TypeScript statt Java für das Backend

**Status:** Angenommen (06.08.2026)

### Kontext
Der Autor ist Frontend-Entwickler mit knapp zwei Jahren Erfahrung (React, Next.js, TypeScript) und
seit April 2026 arbeitslos. Der Arbeitsmarkt verlangt überwiegend Fullstack-, Backend- oder
DevOps-Profile. Die harte Randbedingung ist **Zeit bis zum nächsten Job**, nicht technische
Vollständigkeit. Backend-Erfahrung ist bisher nicht vorhanden: kein Java, keine eigene API, kein ORM,
kein Docker, keine Tests, keine CI/CD.

### Entscheidung
Das Backend wird in **TypeScript** gebaut. Java und Spring Boot werden zurückgestellt, bis wieder
ein Einkommen besteht.

### Alternativen
| Option | Bewertung |
|---|---|
| **Java + Spring Boot** | Die im Enterprise-Umfeld am häufigsten geforderte Kombination. Aber: von null bis zu einem Stand, der in Bewerbungen trägt, sind 6–9 Monate ohne Einkommen realistisch. Sprache, Ökosystem, Build-Tooling, Typsystem und Framework wären alle gleichzeitig neu. |
| **TypeScript** | Rund 70 % des Wissens ist bereits vorhanden: Sprache, Typsystem, npm, async, HTTP. Neu sind nur die Backend-*Konzepte* – und genau die sind das eigentliche Lernziel. In 6–8 Wochen zu einem glaubwürdigen Fullstack-Profil. |
| **Go / Python** | Beides gute Backend-Sprachen, aber ohne bestehende Basis kein Zeitvorteil gegenüber Java. |

### Konsequenzen
- **Positiv:** Deutlich schnellerer Weg zur Bewerbungsfähigkeit. Ein einziges Sprach-Ökosystem für Frontend und Backend, dadurch gemeinsame Typen und Validierungsschemata.
- **Negativ:** Stellenausschreibungen mit harter Java-Anforderung bleiben vorerst verschlossen.
- **Risiko-Minderung:** Das Backend-Framework wird so gewählt, dass die gelernten Konzepte direkt auf Spring Boot übertragbar sind – siehe ADR-002.

---

## ADR-002: NestJS als Backend-Framework

**Status:** Angenommen (06.08.2026)

### Kontext
Nach ADR-001 steht die Sprache fest. Im TypeScript-Ökosystem gibt es sehr unterschiedliche
Backend-Philosophien. Ein Nebenziel ist ausdrücklich, dass die gelernten Konzepte später den
Umstieg auf Spring Boot verkürzen.

### Entscheidung
**NestJS.**

### Alternativen
| Option | Bewertung |
|---|---|
| **Express** | Minimal und weit verbreitet, gibt aber keine Struktur vor. Architektur müsste komplett selbst erfunden werden – ohne Backend-Erfahrung ein Rezept für eine Struktur, die im Code Review nicht besteht. |
| **Fastify** | Schneller als Express, gleiche strukturelle Lücke. |
| **NestJS** | Bringt Module, Dependency Injection, Decorators, Guards, Interceptors und Pipes mit. Diese Bausteine sind fast 1:1 die von Spring Boot: Guards ≈ Security-Filter, Interceptors ≈ Aspects, Module ≈ Spring-Konfiguration, DI ≈ DI. Die Enterprise-Denkweise wird in einer bereits beherrschten Sprache gelernt. |
| **Next.js API-Routes** | Kein separates Backend nötig. Verfehlt aber genau das Lernziel: keine Schichtentrennung, kein DI, keine Guards – und in Bewerbungen kein Beleg für Backend-Kompetenz. |

### Konsequenzen
- **Positiv:** Vorgegebene, in der Industrie anerkannte Struktur. Direkte Begriffs-Brücke zu Spring Boot. Testbarkeit durch DI eingebaut.
- **Negativ:** Steilere Lernkurve als Express; Decorators und DI sind für Frontend-Entwickler zunächst ungewohnt. Mehr Boilerplate.
- **Bewusst in Kauf genommen:** Genau dieser Boilerplate *ist* der Lerninhalt.

---

## ADR-003: Scope-Schnitt auf vier Kern-Features plus eine Integration

**Status:** Angenommen (06.08.2026)

### Kontext
Die ursprüngliche Feature-Liste umfasste zwölf Blöcke: Auth, Organisationen/Teams, Projekte, Kanban,
Dashboard, Monitoring, Deployments, API-Keys, Dateien, Suche, Benachrichtigungen und Administration.
Für eine Person neben aktiver Jobsuche ist das nicht lieferbar. Zugleich ist DevBoard das einzige
vorzeigbare Codebeispiel des Autors.

### Entscheidung
Gebaut werden **vier Kern-Features** – Auth/RBAC, Organisationen & Multi-Tenancy, Projekte + Tasks +
Kanban, Dashboard/Aktivitäts-Feed – plus **eine echte GitHub-Integration**. Quer dazu und nicht
verhandelbar: Docker, Tests, CI, Staging und Deployment.

Alle übrigen Features werden mit Begründung in `06_BACKLOG.md` geparkt.

### Alternativen
| Option | Bewertung |
|---|---|
| **Alle zwölf Features anfangen** | Ergibt zwölf halbfertige Features. Ein Interviewer sieht sich ein Repo 5–15 Minuten an und sucht Belege für Datenmodellierung, Autorisierung, Testverhalten und Deployment-Fähigkeit. Halbfertige Features belegen nichts. |
| **Nur zwei Features, dafür perfekt** | Zu wenig Fläche, um Multi-Tenancy und Query-Performance überhaupt zu demonstrieren. |
| **Vier Kern-Features + eine Integration** | Genug Fläche für alle relevanten Backend-Themen, klein genug, um wirklich fertig zu werden. |
| **Vier Integrationen andeuten** (GitHub, Jira, Linear, Grafana) | Vier angedeutete Integrationen belegen nichts. Eine vollständige – mit Signaturprüfung, Idempotenz und Retry – ist echte Backend-Arbeit, die sich nicht vortäuschen lässt. |

### Konsequenzen
- **Positiv:** Realistischer Fertigstellungstermin. Jedes gebaute Feature ist im Gespräch vollständig verteidigbar. Tiefe statt Breite.
- **Negativ:** Die Feature-Liste im README wirkt kürzer als bei typischen „Portfolio-SaaS"-Projekten.
- **Umgang damit:** Das README benennt den Schnitt ausdrücklich als bewusste Entscheidung und verweist auf diese ADR. Eine begründete Priorisierung ist ein stärkeres Signal als eine lange Feature-Liste.

---

## ADR-004: PostgreSQL im Container statt lokaler Installation

**Status:** Angenommen (07.08.2026)

### Kontext
Das Projekt braucht lokal eine PostgreSQL-Datenbank. Produktion läuft später unter Linux auf einem
eigenen Hetzner-Server. Entwicklungsrechner ist Windows 11.

### Entscheidung
PostgreSQL läuft ausschließlich in einem Docker-Container, gesteuert über `docker-compose.yml` im
Wurzelverzeichnis des Repositories. Die Version ist auf `postgres:18-alpine` gepinnt.

### Alternativen
| Option | Bewertung |
|---|---|
| **Lokale Installation** unter Windows | Versions-Drift bei mehreren Projekten, keine saubere Deinstallation, aufwendiges Onboarding. Vor allem: Postgres verhält sich unter Windows anders als unter Linux – insbesondere bei Collation und Groß-/Kleinschreibung. Solche Abweichungen erzeugen Fehler, die lokal nicht reproduzierbar sind. |
| **Managed Cloud** (Neon, Supabase, RDS) | Bequem, aber kein Lerneffekt beim Betrieb, Internet zwingend erforderlich, ab einer gewissen Nutzung kostenpflichtig. |
| **Container** | Identische Umgebung wie in Produktion, wegwerfbar, ein Befehl zum Starten, Konfiguration liegt versioniert im Repository. |

### Konsequenzen
- **Positiv:** `docker compose up -d` genügt zum Aufsetzen der gesamten lokalen Umgebung. Die Konfiguration ist Teil des Repositories (Infrastructure as Code) statt angeklickter GUI-Zustand.
- **Negativ:** Docker Desktop und aktivierte Hardware-Virtualisierung sind Voraussetzung. Unter Windows läuft eine WSL2-VM mit, die Arbeitsspeicher belegt.
- **Wichtig:** Die Daten liegen in einem **named volume** (`devboard-db-data`). Ohne das wären sie nach jedem `docker compose down` verloren. `docker compose down -v` löscht sie ausdrücklich.
- **Version gepinnt**, nicht `latest`: `latest` ist ein beweglicher Zeiger. Ein Versionssprung macht das Datenverzeichnis unlesbar und bricht Builds ohne jede Code-Änderung.

---

## ADR-005: Ein Repository, zwei getrennte npm-Projekte

**Status:** Angenommen (08.08.2026)

### Kontext
Das Projekt besteht aus einem NestJS-Backend und einem Next.js-Frontend. Beide sind
TypeScript-Projekte mit eigenen Abhängigkeiten, eigenem Build und eigenem Dockerfile. Entwickelt
wird von einer Person.

### Entscheidung
**Ein Git-Repository** mit `backend/` und `frontend/` als voneinander unabhängige npm-Projekte, jedes
mit eigener `package.json` und eigenem Lockfile. Kein Workspace-Werkzeug. Als Paketmanager **npm**.

### Alternativen
| Option | Bewertung |
|---|---|
| **Zwei getrennte Repositories** | Klare Trennung, aber jede übergreifende Änderung (neues Feld in der API plus Anzeige im Frontend) zerfällt in zwei PRs, die getrennt reviewt und in der richtigen Reihenfolge gemergt werden müssen. Für eine Person reine Reibung. |
| **Monorepo mit npm-Workspaces / Turborepo / Nx** | Löst gemeinsame Abhängigkeiten und orchestrierte Builds – Probleme, die bei zwei Paketen noch nicht existieren. Erzeugt aber sofort ein neues: Docker-Builds werden deutlich komplizierter, weil das Lockfile im Wurzelverzeichnis liegt und der Build-Kontext anders geschnitten werden muss. |
| **Ein Repo, zwei unabhängige Projekte** | Eine Historie, ein PR pro Feature über alle Schichten, aber jedes Projekt bleibt für sich baubar und dockerisierbar. |

### Paketmanager
`npm` statt `pnpm`, obwohl pnpm schneller ist und weniger Plattenplatz braucht. Grund: pnpms
Symlink-Ansatz erfordert in Dockerfiles Sonderbehandlung. In dieser Projektphase soll pro Schritt
nur **eine** neue Variable eingeführt werden – gelernt wird gerade NestJS, nicht
Paketmanager-Feinheiten.

### Konsequenzen
- **Positiv:** Ein vertikaler Slice (Datenbank bis UI) ist ein einziger PR. Kein Werkzeug zwischen dir und dem Build. Dockerfiles bleiben einfach.
- **Negativ:** Gemeinsame Typen zwischen Backend und Frontend müssen anders gelöst werden – zunächst durch Duplizieren der Zod-Schemata, später ggf. durch ein generiertes API-Client-Paket.
- **Revidierbar:** Wächst das Projekt auf mehrere Pakete, lässt sich nachträglich ein Workspace einführen. Der umgekehrte Weg wäre aufwendiger.

---

## ADR-006: Prisma als ORM

**Status:** Angenommen (08.08.2026)

### Kontext
Das Backend braucht Datenbankzugriff. Gefordert sind Typsicherheit bis in die Datenbank,
versionierte Schemaänderungen und ein Lerneffekt, der später auf Spring Data JPA übertragbar ist.

### Entscheidung
**Prisma 7** mit dem Driver Adapter `@prisma/adapter-pg`.

### Alternativen
| Option | Bewertung |
|---|---|
| **Rohes SQL** (`pg`) | Volle Kontrolle, aber keine Typsicherheit, Migrationen von Hand, und string-gebautes SQL öffnet die Tür für SQL-Injection. |
| **Query Builder** (Kysely, Knex) | SQL bleibt sichtbar und wird typsicher zusammengesetzt. Gute Wahl für Teams, die SQL sicher beherrschen – setzt aber genau das voraus. |
| **TypeORM** | Klassisches Active-Record/Data-Mapper-ORM, näher an JPA. Schwächere Typsicherheit, wechselhafte Wartungslage. |
| **Drizzle** | Sehr schlank, SQL-nah, hervorragende Typen. Jüngeres Ökosystem, weniger Material zum Lernen. |
| **Prisma** | Deklaratives Schema, generierter Client mit exakten Typen, Migrationen als versionierte SQL-Dateien, gute Fehlermeldungen und Dokumentation. |

### Konsequenzen
- **Positiv:** Eine Schemaänderung wird sofort im Compiler sichtbar. Migrationen liegen als SQL im Repository und sind auf jedem Rechner, in der CI und auf dem Server reproduzierbar.
- **Negativ:** Starke Abstraktion. Bei komplexen Abfragen (mehrere Joins, Fensterfunktionen, rekursive CTEs) muss auf `$queryRaw` ausgewichen werden. Wer nur mit ORM arbeitet, lernt kein SQL – deshalb wird zu jedem Modell das erzeugte SQL angesehen.
- **Prisma 7 im Besonderen:** Die Rust-Query-Engine als Binärdatei entfällt, der Zugriff läuft über einen Node-Treiber (Driver Adapter). Das macht Container-Images kleiner. Preis: ein zusätzliches Paket und eine explizite Verbindungskonfiguration im Code.

---

## ADR-007: Access-Token im Speicher, Refresh-Token im httpOnly-Cookie

**Status:** Angenommen (09.08.2026)

### Kontext
Sprint 1 baut die Authentifizierung. Die Frage, wo der Token im Browser liegt, bestimmt Backend,
Frontend und Sicherheitskonzept gleichermaßen – sie muss vor der ersten Zeile Code entschieden sein.
Frontend (`:3001`) und Backend (`:3000`) laufen lokal auf getrennten Ports.

### Entscheidung
Ein **kurzlebiger Access-Token** (Laufzeit ca. 15 Minuten) wird ausschließlich in einer
JavaScript-Variablen im Speicher gehalten. Ein **langlebiger Refresh-Token** liegt in einem
`httpOnly`-Cookie mit `SameSite` und `Secure`, wird bei jeder Erneuerung **rotiert** und ist
serverseitig widerrufbar.

### Alternativen
| Option | Bewertung |
|---|---|
| **`localStorage`** | Am einfachsten und in Tutorials allgegenwärtig. Jedes eingeschleuste Skript kann darauf zugreifen – eine XSS-Lücke bedeutet sofort übernommene Sitzungen. Zudem überlebt der Token das Schließen des Browsers ohne serverseitige Kontrolle. |
| **Beide Token im httpOnly-Cookie** | JavaScript kommt nicht heran, XSS kann nichts stehlen. Solide und gut verteidigbar. Preis: Cookies werden automatisch mitgeschickt, also ist CSRF-Schutz zwingend; außerdem ist die Token-Lebensdauer schwerer feingranular zu steuern. |
| **Speicher + httpOnly-Cookie** | Der Access-Token ist für Skripte unerreichbar *und* überlebt kein Neuladen. Der Refresh-Token ist für JavaScript unsichtbar und serverseitig widerrufbar. Deckt XSS, CSRF und Token-Lebensdauer in einem Konzept ab. |

### Konsequenzen
- **Positiv:** Ein gestohlener Access-Token ist nach spätestens 15 Minuten wertlos. Der Refresh-Token
  ist per XSS nicht auslesbar. Ein Logout wirkt tatsächlich, weil der Refresh-Token serverseitig
  ungültig gemacht wird.
- **Negativ:** Mehr bewegliche Teile. Nach dem Neuladen der Seite ist der Access-Token weg und muss
  still über den Refresh-Endpoint erneuert werden – das braucht im Frontend einen kurzen
  Ladezustand und eine Wiederholungslogik bei `401`.
- **Zwingend mitzudenken:** `SameSite=Lax` (bzw. `None` + `Secure`, sobald Frontend und Backend auf
  verschiedenen Domains liegen), CSRF-Schutz für den Refresh-Endpoint, und **Rotation mit Erkennung
  wiederverwendeter Token** – wird ein bereits verbrauchter Refresh-Token noch einmal vorgelegt, ist
  das ein Diebstahlverdacht und die gesamte Token-Familie wird widerrufen.
- **Lokale Besonderheit:** Solange Frontend und Backend auf verschiedenen Ports laufen, gelten
  Cookies als „third-party". In Produktion liegen beide hinter demselben nginx auf derselben
  Domain – das entschärft die Cookie-Frage erheblich und ist ein weiterer Grund für diesen Aufbau.

### Umsetzungsdetails, die Zeit gekostet haben
- Prisma 7 lädt `.env` **nicht** mehr automatisch. Geladen wird sie explizit in `prisma.config.ts` – dort zeigt sie auf die Wurzel-`.env`, damit Compose, ConfigModule und Prisma dieselbe Quelle nutzen.
- Der Generator muss auf `moduleFormat = "cjs"` und `importFileExtension = ""` gestellt werden, weil NestJS nach CommonJS kompiliert. Sonst scheitern Jest und der Node-Start an ESM-Syntax.
- Der Client lädt seinen Query-Compiler als WASM per dynamischem Import. In Jest braucht das `NODE_OPTIONS=--experimental-vm-modules`; im echten Node-Prozess ist es unproblematisch.

---

## ADR-008: Aktive Organisation als Pfad-Parameter

**Status:** Angenommen (11.08.2026)

### Kontext
Ab Sprint 2 gehört jedes fachliche Datum zu genau einer Organisation. Das Backend muss bei jeder
Anfrage wissen, **welcher Mandant** gemeint ist. Diese Entscheidung prägt jede URL bis Sprint 4 und
lässt sich später nur mit Bruch in der öffentlichen Schnittstelle korrigieren – sie gehört deshalb
vor die erste Zeile Sprint-2-Code.

### Entscheidung
Die Organisation steht als **Pfad-Parameter** in der URL:

```
GET /organizations/:orgId/members
GET /organizations/:orgId/projects/:projectId
```

Ein `MitgliedschaftsGuard` liest `orgId` aus der Route, prüft die Mitgliedschaft und hängt sie an
die Anfrage. Die Rolle wird dabei **aus der Datenbank** gelesen, nicht aus dem Token.

### Alternativen
| Option | Bewertung |
|---|---|
| **Header `X-Org-Id`** | Kürzere URLs, Umschalten ohne Navigation. Aber: Dieselbe URL liefert je nach Header andere Daten – schlecht cachebar, Links nicht teilbar, und im Zugriffslog steht nicht mehr, worauf zugegriffen wurde. Ein vergessener Header fällt zudem nicht auf, er liefert einfach die falsche Organisation. |
| **Organisation im JWT** | Der Client kann sie nicht fälschen, keine Extra-Abfrage. Aber: Umschalten braucht einen neuen Token, also einen eigenen Endpoint. Und der Mandant erbt denselben Frische-Nachteil wie die Rolle – ein Entzug wirkt erst nach Ablauf des Tokens. |
| **Pfad-Parameter** | Jede Ressource ist eindeutig adressierbar; ein Link an eine Kollegin funktioniert. REST-konform (Hierarchie in der URL). Im Log steht sofort, wer worauf zugegriffen hat. Preis: längere URLs, und der Guard muss den Parameter aus der Route lesen. |

### Konsequenzen
- **Positiv:** Der Mandant ist Teil der Ressourcen-**Identität**, nicht ein Zustand nebenbei. Ein
  fehlender Mandanten-Filter fällt beim Lesen des Controllers auf, weil `:orgId` sichtbar in der
  Signatur steht.
- **Negativ:** Die URLs werden länger, und jede Route unterhalb einer Organisation muss den
  Parameter mitführen. Ohne Guard wäre das eine Fehlerquelle – deshalb ist der Guard nicht
  optional, sondern die Bedingung dafür, dass diese Entscheidung trägt.
- **Ausdrücklich nicht getroffen:** Die Rollen wandern **nicht** ins JWT. Verlockend wären null
  Datenbankabfragen; der Preis wäre, dass ein Rollenentzug bis zu 15 Minuten wirkungslos bleibt.
  Bei einem ausgeschiedenen Mitarbeiter ist das nicht vertretbar. Wir tauschen Latenz gegen
  Frische – abgesichert durch den Index auf `memberships`.
- **Nicht dasselbe wie Authentifizierung:** Der `AccessTokenGuard` beantwortet weiterhin „wer bist
  du?" (401). Der neue Guard beantwortet „darfst du hier hinein?" (403/404).

---

## ADR-009: Fractional Indexing auf `numeric(65,30)` für die Board-Sortierung

**Status:** Angenommen (12.08.2026)

### Kontext
Ein Kanban-Board braucht eine persistierte Reihenfolge innerhalb jeder Spalte. Zwei Nutzer können
gleichzeitig umsortieren. Die Entscheidung prägt das Datenmodell, den Verschiebe-Endpoint und die
Form der API – sie lässt sich später nur mit einer Migration **und** einer brechenden
Schnittstellenänderung korrigieren.

### Entscheidung
Jede Aufgabe trägt eine `position` vom Typ `numeric(65,30)`. Beim Verschieben bekommt sie den
**Mittelwert ihrer beiden künftigen Nachbarn**. Der Client schickt die IDs der Nachbarn, nicht die
Position – gerechnet wird ausschließlich serverseitig.

Erreicht die Zahl mehr als 30 Nachkommastellen, verteilt der Server die betroffene Spalte neu
(1000, 2000, 3000 …) und rechnet erneut.

### Alternativen
| Option | Schreibzugriffe je Verschiebung | Bewertung |
|---|---|---|
| Ganzzahlen 1, 2, 3 neu vergeben | **N** (ganze Spalte) | Einfach zu verstehen, aber zwei gleichzeitige Verschiebungen überschreiben sich gegenseitig – genau der Datenverlust, den F3 ausschließt |
| Ganzzahlen mit Lücken (100, 200) | 1 | Die Lücken gehen aus; irgendwann doch Neuvergabe – also dieselbe Mechanik, nur später |
| `float8` + Mittelwert | 1 | **Abgelehnt:** Die Grenze ist unsichtbar. Nach ~50 Halbierungen an derselben Stelle sind die Bits verbraucht, zwei Karten bekommen denselben Wert, die Sortierung wird stillschweigend zufällig |
| String-Ränge (LexoRank, Base62) | 1 | Bewährt (Jira), aber eigene Arithmetik ohne Datenbankunterstützung; `ORDER BY` wäre eine Zeichenkettensortierung |
| **`numeric` + Mittelwert** | **1** | **Gewählt** |

### Konsequenzen
- **Positiv:** Eine Verschiebung schreibt **eine** Zeile. Der Index `(projectId, status, position)`
  liefert die Board-Abfrage sortiert, ohne Sortierschritt.
- **Positiv:** Die Grenze ist **bekannt und nachrechenbar** – die *n*-te Halbierung an derselben
  Stelle braucht *n* Nachkommastellen. Damit ist sie testbar und behandelbar. Das ist der
  entscheidende Unterschied zu `float8`: Beide Varianten haben eine Grenze, aber nur eine davon
  kann man sehen.
- **Negativ:** Die Neuverteilung schreibt N Zeilen. Sie läuft synchron in der auslösenden Anfrage;
  eine Hintergrundvariante steht im Backlog.
- **Negativ, und teuer gelernt:** Die Entscheidung in der Datenbank gilt nicht automatisch im Code.
  `decimal.js` rechnet voreingestellt mit 20 signifikanten Stellen und hätte gerundet, bevor die
  Datenbank überhaupt gefragt war (siehe `17_MISTAKES_AND_LESSONS.md`, 13.08.2026). Wer Genauigkeit
  wählt, muss die **ganze Kette** prüfen: Spalte, Treiber, Rechenbibliothek, Serialisierung.
- **Folge für die API:** `position` geht als **Zeichenkette** nach außen. JSON kennt nur `float64`;
  eine Zahl wäre derselbe Präzisionsverlust auf dem Transportweg.

---

## ADR-010: Optimistisches Sperren beim Verschieben, pessimistisch bei der Eigentümerregel

**Status:** Angenommen (13.08.2026)

### Kontext
Sprint 2 löste den Wettlauf um die letzte `OWNER`-Mitgliedschaft mit einer Zeilensperre
(`SELECT … FOR UPDATE`). Beim Board stellt sich dieselbe Frage neu: Zwei Nutzer verschieben
dieselbe Karte. Es wäre bequem, das gleiche Verfahren zu wiederholen – und falsch.

### Entscheidung
Beim Verschieben wird **optimistisch** gesperrt. `tasks.version` steht im `WHERE` des `UPDATE`:

```sql
UPDATE tasks SET status = ?, position = ?, version = version + 1
WHERE id = ? AND version = ?
```

Ändert die Anweisung 0 Zeilen, war jemand schneller ⇒ **409 Conflict**, nichts wurde geschrieben.
Die Versionsangabe ist **Pflichtfeld** im Request-Körper, nicht optional.

Die Zeilensperre aus Sprint 2 bleibt, wo sie ist.

### Das Unterscheidungsmerkmal
**Ob der Konflikt heilbar ist.**

- Letzter Eigentümer: Treten zwei gleichzeitig aus, bleibt die Organisation ohne Eigentümer zurück.
  Durch Neuladen nicht reparierbar – der Zustand ist bereits kaputt. Die zweite Anfrage **muss**
  warten.
- Board: Die Karte liegt woanders als gedacht. Ärgerlich, nicht kaputt, und selten – zwei Menschen
  fassen selten dieselbe Karte in derselben Sekunde an. Sperren würde jeden Normalfall
  verlangsamen, um einen harmlosen Ausnahmefall zu vermeiden.

> **Faustregel:** Pessimistisch sperren, wenn ein Konflikt Daten zerstört. Optimistisch, wenn er
> nur eine Wiederholung kostet.

### Konsequenzen
- **Positiv:** Kein Warten im Normalfall, keine Sperren über HTTP-Anfragen hinweg.
- **Positiv, und selten genannt:** Der Nebenläufigkeitsfehler wird **deterministisch
  reproduzierbar**. Zwei Anfragen mit derselben gelesenen Version sind genau das, was zwei
  gleichzeitig ladende Nutzer erzeugen – unabhängig vom Absendezeitpunkt. Der Test braucht kein
  Zeitspiel, anders als der Sperrtest aus Sprint 2.
- **Negativ:** Der Client muss den Konflikt behandeln. Im Frontend heißt das: Rollback des
  optimistischen Updates, Neuladen, und eine Erklärung statt einer Fehlermeldung – ein `409` ist
  keine Störung.
- **Warum die Version im `WHERE` und nicht in einem `if` davor:** Zwischen Prüfung und Schreiben
  läge eine Lücke. So entscheidet die Datenbank in einem Schritt.
- **Warum `409` und nicht `412`:** `412 Precondition Failed` gehört zu `If-Match`/ETag in der
  Kopfzeile. Wir tragen die Version im Körper – der Konflikt ist fachlich, nicht protokollarisch.

---

## ADR-011: Der Aktivitäts-Feed bekommt eine eigene Tabelle – und ist trotzdem kein Event Sourcing

**Status:** Angenommen (14.08.2026)

### Kontext
Sprint 4 verlangt einen chronologischen Aktivitäts-Feed pro Organisation. Die Daten dafür liegen
scheinbar schon vor: `projects` und `tasks` haben beide `createdAt` und `updatedAt`.

### Verworfene Alternative: den Feed ableiten
Beide Tabellen lesen, nach Zeitstempel zusammensortieren, anzeigen. Keine neue Tabelle, kein
zusätzlicher Schreibvorgang. Scheitert an drei Punkten:

- **`updatedAt` weiß nicht, *was* sich geändert hat.** Der alte Wert ist überschrieben. „Murat hat
  ‚Login-Bug' von TODO nach DONE gezogen" lässt sich daraus nicht rekonstruieren – nur „irgendwas
  an dieser Karte hat sich um 14:03 geändert".
- **`updatedAt` weiß nicht, *wer* es getan hat.** Diese Angabe existiert im Schema gar nicht.
- **Gelöschtes ist weg.** Tasks werden wirklich gelöscht. Das Ereignis, das am meisten interessiert,
  hinterlässt keine Zeile.

Dazu praktisch: Cursor-Paginierung über zwei zusammensortierte Tabellen hinweg ist in SQL
unangenehm und mit keinem Index sauber zu bedienen.

### Entscheidung
Eine eigene Tabelle `activities`. Ein Eintrag pro Ereignis, **unveränderlich**, mit Typ, Akteur,
optionalem Projekt- und Aufgabenbezug und einem `jsonb`-Feld für die typabhängigen Einzelheiten.
Schema und Indizes sind in `08_DATABASE.md` begründet.

### Was diese Entscheidung ausdrücklich nicht ist
**Kein Event Sourcing.** Der Unterschied ist keine Wortklauberei, sondern die Frage, wo die Wahrheit
liegt:

| | Protokoll daneben (hier) | Event Sourcing |
|---|---|---|
| Wahrheit über eine Aufgabe | `tasks` | die Ereignisse |
| `activities` / Event-Log | Beiwerk, verlierbar | einzige Quelle, unverzichtbar |
| Zustand lesen | direkt aus der Tabelle | Ereignisse wiedergeben oder Projektion nachführen |
| Zustand von letztem Dienstag | nicht möglich | im Entwurf enthalten |
| Kosten | ein `INSERT` mehr pro Schreibvorgang | eine zweite Datenhaltung, die konsistent bleiben muss |

Event Sourcing löst „wie sah es zu Zeitpunkt X aus" und „wie kam es zu diesem Zustand". Wir haben
keine dieser beiden Fragen – wir wollen einen Feed anzeigen. Den Aufwand zu tragen, ohne den Nutzen
zu brauchen, wäre die teuerste Art, ein Schlagwort zu belegen.

Deshalb heißt das Modell `Activity` und nicht `ActivityEvent`, wie in der Planung vorgesehen. Der
Name hätte eine Architektur behauptet, die nicht dahintersteht.

### Konsequenzen
- **Positiv:** Der Feed weiß, was, wer und wann – auch über gelöschte Aufgaben hinaus.
- **Positiv:** Sprint 5 speist GitHub-Webhooks in dieselbe Tabelle. Der Feed ist von Anfang an
  nicht auf DevBoard-eigene Ereignisse zugeschnitten.
- **Positiv:** Genau eine Tabelle für die Feed-Abfrage – Cursor-Paginierung und Index sind dadurch
  überhaupt sauber möglich.
- **Negativ:** Jeder schreibende Vorgang schreibt eine zweite Zeile. Bei einer Anwendung mit
  deutlich mehr Schreib- als Leseverkehr wäre diese Abwägung neu zu treffen.
- **Negativ:** Die Tabelle wächst unbegrenzt und ist die erste im Schema, für die das gilt. Eine
  Aufbewahrungsfrist oder Partitionierung nach Monat wäre die Antwort darauf – im Backlog, nicht in
  Sprint 4, weil ohne echten Verkehr niemand die richtige Frist kennt.
- **Negativ, bewusst in Kauf genommen:** `payload` ist von der Datenbank nicht geprüft. Die
  Struktur garantiert allein der Code.

---

## ADR-012: Aktivitäten entstehen in der Transaktion, nicht in einem Event-Listener

**Status:** Angenommen (14.08.2026)

### Kontext
ADR-011 legt die Tabelle fest. Offen bleibt, **wie** die Einträge entstehen. Das Lehrbuch-Muster
für NestJS heißt „Domain Events": Der Fachcode gibt ein Ereignis bekannt, ein `@OnEvent`-Listener
schreibt es weg. Das entkoppelt – der `TasksService` müsste den Feed nicht kennen – und es ist
genau der Begriff, der in Stellenausschreibungen steht.

### Entscheidung
Der Eintrag wird **inline in derselben Transaktion** geschrieben. `ActivitiesService.protokolliere`
bekommt den `Prisma.TransactionClient` des Aufrufers hereingereicht und hat selbst **keinen**
`PrismaService`.

```ts
return this.prisma.$transaction(async (tx) => {
  const zeile = await tx.task.updateMany({ … });   // fachliche Änderung
  await this.activities.protokolliere(tx, …);      // Protokoll – derselbe tx
});
```

### Warum nicht `EventEmitter2`
**Ein Listener läuft außerhalb der Transaktion des Auslösers.** Damit gilt seine Zusage nicht mehr:
Wird die fachliche Änderung zurückgerollt – ein `409` beim Verschieben, ein Constraint, ein
Verbindungsabbruch – steht der Feed-Eintrag trotzdem da. Der Feed behauptete dann ein Ereignis, das
die Fachdaten nicht kennen, und der Widerspruch wäre von außen nicht auflösbar.

Das ist keine theoretische Sorge. Die Mutationsprobe (`12_TESTING.md`) hat den Schreiber testweise
auf eine eigene Verbindung gelegt – also genau das getan, was ein Listener tut. Ergebnis:

```
Foreign key constraint violated on the constraint: `activities_projectId_fkey`
```

Die fremde Verbindung sieht das gerade angelegte Projekt **nicht**, weil dessen Transaktion noch
nicht committet ist. Ein Listener kann den Eintrag also nicht nur unzuverlässig schreiben – er kann
ihn im Anlege-Fall **gar nicht** schreiben, solange der Fremdschlüssel steht.

Das saubere Muster, das beides hätte, ist das **Transactional Outbox Pattern**: Das Ereignis wird
in derselben Transaktion in eine Outbox-Tabelle geschrieben, ein separater Prozess liest sie und
stellt zu. Es löst ein Problem, das wir hier nicht haben – Zustellung an ein *fremdes* System.
Sprint 5 (GitHub-Webhooks) ist der Ort, an dem sich die Frage neu stellt.

### Der Preis, ausdrücklich bezahlt
**Kopplung.** `ProjectsModule` und `TasksModule` importieren `ActivitiesModule`; die Services kennen
den Feed. Ein Interviewer wird darauf zeigen, und die Antwort ist nicht „Kopplung ist schlecht",
sondern:

> Entkopplung ist ein Mittel, kein Ziel. Sie kostet hier eine Garantie, die den ganzen Zweck der
> Tabelle trägt. **Konsistenz gehört in die Transaktion, Seiteneffekte gehören in Events** – ein
> Protokolleintrag ist kein Seiteneffekt, sondern Teil der Änderung.

Für echte Seiteneffekte (E-Mail, Webhooks) bleibt `EventEmitter2` die richtige Wahl. Sie dürfen
scheitern, ohne dass die Änderung falsch wird.

### Konsequenzen
- **Positiv:** Fachdaten und Feed können nicht auseinanderlaufen. Nach einem `409` steht nichts im
  Feed – durch einen E2E-Test festgehalten.
- **Positiv:** Idempotenz gilt auch für den Feed. Das zweite `DELETE` auf dasselbe Projekt schreibt
  keinen zweiten Eintrag, weil der Eintrag an `ergebnis.count` hängt und nicht an einem vorher
  gelesenen Wert – dieselbe Regel wie beim optimistischen Sperren: **die Bedingung gehört ins
  `WHERE`, nicht in ein `if` davor.**
- **Negativ:** Die Transaktionen werden länger. Aus `create` wurde `$transaction` – zwei Anweisungen
  statt einer, und die Sperren des ersten Schreibvorgangs werden einen Moment länger gehalten. Bei
  diesem Verkehrsaufkommen belanglos, bei hoher Schreiblast der erste Punkt, den man messen würde.
- **Negativ:** Jede schreibende Signatur bekam einen Parameter `akteurId`. Das ist Rauschen im Diff
  und hat einen Vorteil, der ihn aufwiegt: Der Akteur kommt aus der **geprüften** Mitgliedschaft
  (`AktiveMitgliedschaft.userId`), nicht aus dem Request – Organisation und Akteur stammen damit
  garantiert aus derselben Quelle.
- **Negativ, offen benannt:** Der Schutz vor einem Fehler *zwischen* Änderung und Protokolleintrag
  hat keinen wachenden Test (siehe `12_TESTING.md`). Er ist real, aber unbelegt.

---

## ADR-013: Repository-Webhook statt GitHub App

**Status:** Angenommen (16.08.2026)

### Kontext
Sprint 5 soll GitHub-Ereignisse in den Aktivitäts-Feed einspeisen. GitHub bietet dafür zwei Wege.
Eine **GitHub App** ist der offizielle, produktreife: Sie wird in einer Organisation installiert,
bekommt feingranulare Berechtigungen, authentifiziert sich mit einem selbst signierten JWT gegen
kurzlebige Installations-Token und darf im Namen der Installation auch schreiben. Ein
**Repository-Webhook** ist die einfache Variante: eine URL, ein selbst vergebenes Geheimnis, eine
Auswahl an Ereignissen – GitHub schickt bei jedem davon ein `POST`.

### Entscheidung
Repository-Webhook, je Projekt höchstens einer.

### Alternativen
**GitHub App.** Verworfen. Der Installationsablauf braucht eine **öffentlich erreichbare**
Callback-URL – die gibt es erst nach Sprint 6. Dazu kämen App-JWT, Installations-Token mit Ablauf
und deren Erneuerung, ein OAuth-Rückweg und die Registrierung der App selbst. Das ist eigener
Aufwand für ein *Zugriffs*-Thema, während die Lehrinhalte dieses Sprints – Signaturprüfung,
Idempotenz, asynchrone Verarbeitung – bei beiden Wegen **identisch** sind. Der Webhook liefert
dieselben Nutzdaten mit demselben `X-Hub-Signature-256`.

**OAuth-Anbindung mit Polling der GitHub-API.** Verworfen, und zwar deutlich: Polling ersetzt genau
die Themen durch ihre langweiligen Gegenstücke. Kein Signaturproblem, keine Mehrfachzustellung,
kein Zustellungsdruck – dafür Ratenbegrenzung und Abfrageintervalle.

### Konsequenzen
- **Positiv:** Kein Aufbau vor dem ersten Ereignis. Ein Projekt wird verbunden, indem jemand
  `owner/repo` einträgt; DevBoard erzeugt ein Geheimnis und zeigt die URL an.
- **Positiv:** Prüfbar ohne GitHub. Die E2E-Tests erzeugen selbst signierte Nutzdaten – das ist
  ohnehin der ehrlichere Test, weil er auch die *falsche* Signatur stellen kann.
- **Negativ:** Nur Empfang. Ein Kommentar zurück an GitHub bräuchte einen Token mit Schreibrecht,
  und dafür ist der Webhook der falsche Weg (siehe ADR-015 zum Ausblick).
- **Negativ:** Das Eintragen geschieht von Hand in den Repository-Einstellungen. Eine App würde das
  bei der Installation erledigen.
- **Offen bis Sprint 6:** In der Entwicklung ist `localhost` für GitHub nicht erreichbar. Bis zum
  Staging wird gegen selbst erzeugte Zustellungen geprüft, nicht gegen echte.

---

## ADR-014: Das Webhook-Geheimnis wird verschlüsselt gespeichert, nicht gehasht

**Status:** Angenommen (16.08.2026)

### Kontext
DevBoard speichert bereits zwei Arten von Geheimnissen, beide **gehasht**: Passwörter mit argon2id
und Einladungs-Token mit SHA-256. Die Regel dahinter klang bisher wie ein Naturgesetz – *ein
Geheimnis wird niemals im Klartext abgelegt*. Beim Webhook-Geheimnis lässt sie sich nicht anwenden,
und der Grund ist keine Bequemlichkeit.

### Entscheidung
Das Geheimnis wird **symmetrisch verschlüsselt** abgelegt (AES-256-GCM, Schlüssel aus
`WEBHOOK_ENCRYPTION_KEY`), nicht gehasht.

### Warum ein Hash hier nicht funktioniert
Ein Hash reicht immer dann, wenn man einen **vorgelegten Wert wiedererkennen** muss: Der Nutzer
schickt sein Passwort, wir hashen es und vergleichen. Bei einem Webhook legt GitHub das Geheimnis
aber nie vor. Es schickt eine **HMAC-Signatur über den Nachrichtenrumpf**, und um dieselbe Signatur
nachzurechnen, braucht man das Geheimnis **selbst**. Aus `SHA-256(geheimnis)` lässt es sich nicht
zurückgewinnen – das ist ja der Zweck.

Damit ist die Regel präziser zu fassen, und in dieser Form gilt sie weiter:

> **Wiedererkennen ⇒ hashen. Nachrechnen ⇒ verschlüsseln.** Der Klartext im Speicher ist nur dann
> ein Fehler, wenn man ihn nicht braucht.

### Alternativen
**Ein einziges Geheimnis für alle Projekte, aus der Umgebung.** Verworfen. Es stünde in der
Konfiguration statt in der Datenbank – bequem, aber es macht jedes Projekt zum Nachbarn jedes
anderen: Wer das Geheimnis eines Repositories kennt, kann Ereignisse für **jedes** Projekt
signieren. Bei einer mandantengetrennten Anwendung wäre das die Wiederholung genau des Fehlers, den
Sprint 2 vermieden hat, eine Ebene tiefer.

**Ein Schlüsselverwaltungsdienst (Vault, KMS).** Die richtige Antwort in Produktion, hier nicht.
Der Schlüssel läge dann nicht neben den Daten – der eigentliche Gewinn. Vermerkt in `10_SECURITY.md`
mit Fälligkeit Sprint 6.

### Konsequenzen
- **Positiv:** Jedes Projekt hat sein eigenes Geheimnis. Ein verlorenes betrifft ein Repository.
- **Positiv:** GCM liefert einen Authentifizierungs-Tag mit. Eine veränderte Zeile in der Datenbank
  fällt beim Entschlüsseln auf, statt stillschweigend Unsinn zu ergeben.
- **Negativ, ausdrücklich benannt:** Wer die Datenbank **und** `WEBHOOK_ENCRYPTION_KEY` hat, hat die
  Geheimnisse. Verschlüsselung im Ruhezustand schützt gegen ein geleaktes Backup, nicht gegen einen
  übernommenen Anwendungsserver. Das ist der Unterschied zu argon2 – und er gehört in die Antwort,
  wenn im Gespräch danach gefragt wird.
- **Negativ:** Der Schlüssel muss gewechselt werden können. Dafür braucht die Zeile eine
  Versionsangabe, sonst ist eine Rotation später nur mit Ausfall möglich.
- **Negativ:** Das Geheimnis wird **einmal** im Klartext angezeigt, direkt beim Verbinden. Danach
  nie wieder – dieselbe Entscheidung wie bei den Einladungs-Token.

---

## ADR-015: Zustellung annehmen und quittieren, verarbeiten danach

**Status:** Angenommen (16.08.2026)

### Kontext
ADR-012 hat entschieden, dass Aktivitäten **inline in der Transaktion** der fachlichen Änderung
entstehen, und hat dort ausdrücklich vermerkt: Bei der Anbindung eines fremden Systems stellt sich
die Frage neu. Hier ist sie.

Ein Webhook kehrt die Richtung um. Bei einer Aufgabe ruft *unser* Frontend *unseren* Server – wir
bestimmen, wie lange das dauert. Bei einer Zustellung ruft **GitHub** an, erwartet innerhalb von
zehn Sekunden eine Antwort und wertet alles außerhalb von 2xx als Fehlschlag. Die Folge eines
Fehlschlags ist **erneute Zustellung**.

### Entscheidung
Der Endpoint tut drei Dinge und hört dann auf: Signatur prüfen, die rohe Zustellung in eine Tabelle
`webhook_deliveries` schreiben, `202 Accepted` antworten. Die Übersetzung in Feed-Einträge geschieht
**danach**, in einem eigenen Schritt.

### Das Muster heißt Inbox, nicht Outbox
Eine Klarstellung, weil die Begriffe leicht durcheinandergehen und die frühere Notiz zu ADR-012 an
dieser Stelle ungenau war:

- Eine **Outbox** löst das Problem beim *Senden*: Ich ändere Daten und will danach zuverlässig ein
  fremdes System benachrichtigen, ohne dass Änderung und Zustellung auseinanderfallen.
- Eine **Inbox** (auch: idempotenter Empfänger) löst das Problem beim *Empfangen*: Dieselbe
  Nachricht kommt mehrfach an, und die Wirkung soll trotzdem einmalig sein.

Sprint 5 empfängt. Es ist also die Inbox. **Die Outbox wird in diesem Sprint nicht gebaut**, weil es
nichts zu senden gibt – sie würde erst durch eine Rückmeldung an GitHub verdient, etwa einen
Kommentar am Pull Request, wenn eine Aufgabe auf „Erledigt" wandert. Das steht als möglicher
Abschluss in der Roadmap und ist bewusst nicht gesetzt.

### Woran die Einmaligkeit hängt
An einem `UNIQUE` auf `deliveryId` – dem Wert aus `X-GitHub-Delivery`. Die zweite Zustellung
verletzt das Constraint, der Endpoint fängt genau diesen Fehler ab und antwortet `200`. Es gibt
**kein** vorheriges `findFirst`: Zwischen Lesen und Schreiben passen zwei gleichzeitige
Zustellungen, und dann stünde der Eintrag doppelt im Feed. Dieselbe Regel wie in ADR-010 und
ADR-012 – **die Bedingung gehört ins `WHERE` beziehungsweise ins Constraint, nicht in ein `if`
davor.** Zum dritten Mal dieselbe Lehre.

### Alternativen
**Alles inline im Endpoint verarbeiten.** Verworfen, aber knapper als es klingt: Bei unserem
Datenaufkommen wäre es schnell genug. Der Grund ist ein anderer – die **Wirkung eines Fehlers**.
Scheitert die Übersetzung eines Ereignisses inline, gibt es zwei schlechte Antworten: eine 5xx, dann
stellt GitHub erneut zu und dieselbe kaputte Nutzlast scheitert wieder, bis GitHub aufgibt und die
Zustellung endgültig verloren ist; oder eine 200, dann ist sie sofort verloren. Mit der Tabelle ist
sie **da**, unabhängig davon, ob wir sie schon deuten können.

**Eine echte Warteschlange (BullMQ mit Redis).** Verworfen für diesen Sprint. Sie brächte einen
weiteren Dienst in `docker-compose.yml` und in Sprint 6 in die Bereitstellung, und sie löste ein
Problem, das wir bei diesem Aufkommen nicht haben. Die Tabelle ist ohnehin der ehrlichere erste
Schritt: Eine Warteschlange ohne haltbaren Zustand *daneben* verliert Aufträge beim Neustart.
Vermerkt im Backlog.

### Konsequenzen
- **Positiv:** Eine unbekannte oder fehlerhafte Nutzlast kostet keine Zustellung. Sie liegt in der
  Tabelle und kann nach einer Korrektur erneut verarbeitet werden.
- **Positiv:** Der Endpoint bleibt schnell und berechenbar – er schreibt eine Zeile.
- **Positiv:** Die Tabelle ist bei der Fehlersuche das, was sonst in Protokolldateien steht: Was hat
  GitHub *wirklich* geschickt.
- **Negativ:** Der Feed hinkt der Wirklichkeit um die Verarbeitungsspanne hinterher. Bei einem
  Aktivitätsprotokoll belanglos, bei einer Zahlung nicht.
- **Negativ:** Zwei Zustände statt einem. Eine Zeile kann angenommen, verarbeitet oder gescheitert
  sein, und es braucht eine Antwort auf „was passiert mit den gescheiterten" – sonst wächst dort
  still eine Halde.
- **Negativ:** `webhook_deliveries` speichert rohe Nutzdaten von GitHub. Sie enthalten
  Commit-Nachrichten und Benutzernamen; die Tabelle braucht deshalb eine Aufbewahrungsfrist und
  gehört in `10_SECURITY.md`.

---

## ADR-016: Betrieb auf drei Plattformen statt auf einem Server

**Status:** Angenommen (16.08.2026)

### Kontext
Die Roadmap sah für Sprint 6 vor: „Multi-Stage-Dockerfiles, nginx als Reverse Proxy, Staging- und
Produktionsumgebung auf dem eigenen Hetzner-Server". Also alles auf einer Maschine – Frontend,
Backend und PostgreSQL.

Vor der Umsetzung stand die Frage, ob das überhaupt der richtige Zuschnitt ist. Zur Auswahl standen
drei Wege:

1. **Alles als PaaS** (Vercel, Render, Neon). Kein Betriebssystem, kein SSH, ein Nachmittag Arbeit.
2. **Alles auf einem eigenen Server.** Volle Kontrolle, ~5 €/Monat, zwei bis vier Tage Arbeit und
   dauerhafte Pflege.
3. **Geteilt** nach der Frage, wo ein Fehler wie viel kostet.

Die harte Randbedingung dieses Projekts ist unverändert **Zeit bis zum nächsten Job** – aber sie ist
nicht die einzige. Betrieb ist die letzte offene Lücke im Profil: Backend deckt DevBoard inzwischen
ab, Deployment bisher nicht.

Ein Argument, das während der Diskussion **auftauchte und wieder verworfen wurde**, sei hier
festgehalten, weil es sonst irgendwann als Begründung zurückkehrt: „Serverless kann unser
Outbox-Muster nicht ausführen." Das stimmt für Serverless, aber DevBoard hat **keine Outbox** –
ADR-015 hat ausdrücklich die *Inbox* gebaut, und es gibt bis heute keinen Scheduler im Code. Die
Begründung wäre falsch gewesen.

### Entscheidung
Aufgeteilt nach **Schadenshöhe**, nicht nach Bequemlichkeit:

| Teil | Wo | Warum dort |
|---|---|---|
| Next.js | **Vercel** | Kostenlos, von den Next.js-Machern, Vorschau-URL pro Pull Request. Ein Ausfall kostet eine Neubereitstellung, mehr nicht. |
| NestJS | **Hetzner** (Docker) | Kein Kaltstart, ein dauerhafter Prozess, und der Lerninhalt des Sprints liegt genau hier. |
| PostgreSQL | **Neon** | Backups und Wiederherstellung durch den Anbieter. |

Der Bruch in der Logik ist die Datenbank, und er ist beabsichtigt: **Ein abgestürztes Backend
startet neu, eine verlorene Datenbank ist weg.** Selbst betriebene Backups sind erst dann Backups,
wenn sie einmal zurückgespielt wurden – und das ist Arbeit, die in diesem Projekt niemand
regelmäßig leisten wird. Wo der Schaden nicht reparierbar ist, wird ausgelagert. Wo er eine
Wiederholung kostet, wird selbst betrieben.

### Was daraus technisch folgt
Neon ist **öffentlich erreichbar**. Damit kann der GitHub-Actions-Runner Migrationen selbst
ausführen, und der Prisma-CLI muss nicht ins Produktions-Image (gemessen: 743 MB gegenüber 390 MB).
Läge PostgreSQL auf dem Server hinter einer Firewall, wäre dieser Weg zu.

Der Preis dieser Trennung ist echt und gehört benannt: Migration und neuer Code werden zu
**verschiedenen Zeitpunkten** wirksam. Für einen Moment läuft die alte Anwendung gegen das neue
Schema. Migrationen müssen deshalb abwärtskompatibel sein – Spalte hinzufügen ja, Spalte umbenennen
nur in zwei Schritten.

### Alternativen
**Alles als PaaS.** Verworfen, aber knapp. Es wäre schneller und für den reinen Zweck „Link im
Lebenslauf" ausreichend. Zwei Gründe dagegen: Die kostenlosen Backend-Stufen schlafen nach etwa 15
Minuten ein, und ein Recruiter wartet keine 30 bis 60 Sekunden auf eine weiße Seite. Und der Sprint
hätte keinen Lerninhalt mehr gehabt, der über „Repository verbinden" hinausgeht.

**Alles auf dem eigenen Server**, wie ursprünglich geplant. Verworfen wegen der Datenbank – siehe
oben. Das Frontend zusätzlich selbst auszuliefern hätte weder etwas gespart noch etwas gelehrt: Es
sind statische Dateien, und Vercel liefert sie kostenlos und näher am Nutzer.

**GitHub Actions als Deployment-Ziel** über einen fertigen Dienst wie Coolify. Nicht verworfen,
sondern **aufgeschoben**: Coolify nimmt genau den Teil ab, der im Gespräch am wenigsten wert ist.
Für diesen Sprint ist der Reverse Proxy von Hand aber der Lerninhalt. Vermerkt im Backlog.

### Konsequenzen
- **Positiv:** Kein Kaltstart. Die Seite antwortet sofort, auch nach Wochen ohne Zugriff.
- **Positiv:** Der Lerninhalt bleibt: Docker in Produktion, Reverse Proxy, TLS, Staging, Rollback.
- **Positiv:** Das unwiederbringliche Risiko – Datenverlust – liegt bei einem Anbieter, der davon
  lebt, es nicht eintreten zu lassen.
- **Positiv:** Migrationen laufen in der Pipeline; das Produktions-Image bleibt schlank.
- **Negativ:** Drei Konten, drei Dashboards, drei Orte für Umgebungsvariablen. Ein Wert, der an
  zwei Stellen gepflegt werden muss, läuft irgendwann auseinander.
- **Negativ:** Die Anwendung ist über drei Netze verteilt. Jede Anfrage überquert zwei
  Anbietergrenzen, und bei der Fehlersuche gibt es kein gemeinsames Protokoll.
- **Negativ:** Der Server bleibt in **voller** Verantwortung: Sicherheitsupdates, Erreichbarkeit,
  TLS-Erneuerung. Ohne Uptime-Wächter erfährt niemand von einem Ausfall (Scheibe 6.7).
- **Negativ:** Die Trennung erzwingt abwärtskompatible Migrationen. Das ist gute Praxis, aber ab
  jetzt eine Pflicht und keine Empfehlung.

---

## ADR-017: Caddy als Reverse Proxy statt nginx

**Status:** Angenommen (21.08.2026)

### Kontext
Vor dem Backend muss ein Reverse Proxy stehen. Er nimmt als Einziger Verkehr aus dem Internet
entgegen, beendet TLS und leitet intern weiter. Das Backend selbst lauscht nur im Docker-Netz.

Die Roadmap nannte **nginx**. Die Frage vor der Umsetzung war, ob das noch die richtige Wahl ist –
nicht aus Geschmack, sondern weil sich der Sprint an einer Stelle entscheidet: **Zertifikate laufen
alle 90 Tage ab.** Was dabei kaputtgeht, geht still kaputt und fällt erst auf, wenn ein Besucher
eine Zertifikatswarnung sieht.

### Entscheidung
**Caddy 2.**

Ausschlaggebend ist, wie beide mit TLS umgehen:

- **nginx** kann selbst keine Zertifikate beschaffen. Man setzt **certbot** daneben, das per Timer
  erneuert und nginx danach neu lädt. Drei bewegliche Teile, die zusammenpassen müssen.
- **Caddy** hat ACME eingebaut. Ein Domainname in der Konfiguration genügt: anfordern, einbauen,
  vor Ablauf erneuern. Es gibt keinen Schalter dafür, weil HTTPS der Normalfall ist und nicht der
  Zusatz.

Die vollständige Konfiguration für DevBoard sind **fünf wirksame Zeilen**. Dieselbe Aufgabe in nginx
sind rund 40 Zeilen plus certbot-Einrichtung.

Das ist dieselbe Abwägung wie bei Neon in ADR-016: **Was unbemerkt ausfallen kann und dessen Ausfall
teuer ist, wird automatisiert** – nicht, weil Handarbeit falsch wäre, sondern weil sie hier niemand
regelmäßig kontrollieren wird.

### Alternativen
**nginx mit certbot**, wie ursprünglich geplant. Der ehrliche Nachteil der getroffenen Entscheidung
steckt genau hier: **In Stellenanzeigen steht nginx, nicht Caddy.** nginx ist verbreiteter, und
Erfahrung damit ist unmittelbar verwertbar.

Zwei Gründe haben trotzdem dagegen entschieden. Erstens ist das, was man an nginx lernt und was in
einem Gespräch zählt, nicht die Konfigurationssyntax, sondern das **Konzept**: Was ein Reverse Proxy
tut, warum das Backend nicht selbst am Internet hängt, wie TLS beendet wird. Das lernt man mit Caddy
genauso. Zweitens ist „warum nicht nginx?" eine Frage, die man beantworten kann – und eine begründete
Antwort ist mehr wert als die unreflektierte Standardwahl.

**Traefik.** Verworfen. Es konfiguriert sich über Docker-Labels statt über eine Datei, was bei
vielen dynamischen Diensten stark ist. Bei zwei Containern ist es Mehraufwand, und die Konfiguration
wäre über die Compose-Datei verstreut statt an einer Stelle lesbar.

**Kein Proxy, Backend direkt auf Port 443.** Verworfen. Die Anwendung müsste dann selbst TLS
beenden und Zertifikate erneuern – Aufgaben, die nichts mit ihrer Fachlichkeit zu tun haben. Und in
6.5 gäbe es keine Stelle, an der zwischen alter und neuer Fassung umgeschaltet werden kann.

### Konsequenzen
- **Positiv:** Zertifikate erneuern sich selbst. Der wahrscheinlichste stille Ausfall entfällt.
- **Positiv:** Die Konfiguration passt auf einen Bildschirm und ist ohne Handbuch lesbar.
- **Positiv:** HTTP/3 und HTTP→HTTPS-Umleitung sind ohne Zutun aktiv.
- **Negativ:** Weniger verbreitet als nginx. Für DevOps-lastige Stellen ist das ein echter Punkt,
  und die Antwort darauf muss sitzen.
- **Negativ:** Bei sehr spezieller Anforderung ist nginx besser dokumentiert – schlicht, weil mehr
  Menschen dieselben Probleme schon hatten.
- **Achtung im Betrieb:** Das Volumen `caddy-data` enthält Zertifikate und private Schlüssel. Geht
  es verloren, werden alle Zertifikate neu angefordert – und Let's Encrypt begrenzt das auf fünf
  gleiche Zertifikate pro Woche. Ein unbedachtes `docker compose down -v` sperrt die Domain für
  Tage aus.

---

## ADR-018: Staging teilt sich den Reverse Proxy – und sonst nichts

**Status:** Angenommen (22.08.2026)

### Kontext
Scheibe 6.3 stellt neben die Produktion eine Testumgebung. Beide sollen auf demselben Server
laufen – ein zweiter Server wäre für ein Portfolio-Projekt nicht zu rechtfertigen.

Eine Sache lässt sich dabei nicht doppeln: **Port 443 existiert nur einmal.** Zwei Reverse Proxys
können ihn sich nicht teilen. Es muss also genau einen gemeinsamen Eingang geben, und die Frage ist
nur, wo der wohnt und was sonst noch geteilt wird.

Nach Scheibe 6.2 lag Caddy im Produktions-Stapel. Käme Staging einfach dazu, entstünde eine
Abhängigkeit in die falsche Richtung: Ein `docker compose down` für einen Staging-Versuch hätte den
Proxy mitgenommen – und damit die Produktion vom Netz. **Eine Testumgebung, die die Produktion
umwerfen kann, ist keine Testumgebung.**

### Entscheidung
Drei unabhängige Stapel an einem gemeinsamen Netz:

```
docker-compose.proxy.yml        Caddy + Netz `devboard-web`   ← definiert das Netz
docker-compose.produktion.yml   backend           → Neon Branch `production`
docker-compose.staging.yml      backend-staging   → Neon Branch `staging`
```

Die beiden Anwendungs-Stapel binden das Netz als `external` ein – sie **erwarten** es, legen es
aber nicht an. Damit ist die Abhängigkeit umgekehrt und schwach: Die Backends hängen am Proxy, der
Proxy an keinem von ihnen. Fällt ein Backend aus, antwortet Caddy für das andere weiter.

Caddy unterscheidet die Umgebungen über **namensbasiertes Routing**: Er liest den Hostnamen aus der
Anfrage – bei HTTPS aus der SNI-Erweiterung des TLS-Handshakes, also bevor die Verbindung
verschlüsselt steht – und leitet an `backend:3000` oder `backend-staging:3000` weiter.

Dass beide Backends intern auf demselben Port lauschen, ist kein Problem, weil keiner von beiden
einen Port am Server veröffentlicht. **Die Entscheidung `expose` statt `ports` aus Scheibe 6.2
zahlt hier zum zweiten Mal aus** – mit `ports` ließe sich Staging gar nicht danebenstellen, der
Port wäre belegt.

### Was ausdrücklich NICHT geteilt wird

| | Produktion | Staging |
|---|---|---|
| Container | eigener | eigener |
| Umgebungsdatei | `.env.produktion` | `.env.staging` |
| Datenbank | Neon-Branch `production` | Neon-Branch `staging` |
| `JWT_SECRET` | eigenes | eigenes |
| `WEBHOOK_ENCRYPTION_KEY` | eigenes | eigenes |
| Domain | `api.devboard.info` | `staging-api.devboard.info` |

Die Datenbank ist der offensichtliche Punkt: Ein Test, der in echte Daten schreibt, ist schlimmer
als gar kein Staging – er erzeugt Vertrauen, das nicht gedeckt ist.

Der weniger offensichtliche ist `JWT_SECRET`. Ein gemeinsamer Signierschlüssel hieße: **Ein in
Staging ausgestelltes Token wird in Produktion akzeptiert.** In Staging wird bewusst mehr
ausprobiert, dort haben mehr Leute Zugang, dort läuft ungeprüfter Code. Wer sich dort ein Token
ausstellen kann, hätte damit die Produktion offen.

### Alternativen
**Ein Stapel mit drei Diensten.** Einfacher, eine Datei weniger. Verworfen wegen der Kopplung: Jedes
`down` und jedes `up` ohne Dienstnamen beträfe beide Umgebungen. Der Unterschied zeigt sich genau
dann, wenn man ihn braucht – unter Zeitdruck bei einem Fehler.

**Zweiter Server für Staging.** Die sauberste Trennung, und in einer Firma die richtige Antwort.
Hier verworfen: verdoppelte Kosten und verdoppelte Pflege für eine Umgebung, die stundenweise
benutzt wird. Der geteilte Proxy ist die bewusst in Kauf genommene Schwachstelle – fällt er aus,
sind beide Umgebungen weg.

**Staging mit Passwortschutz abschirmen** (HTTP Basic Auth im Proxy). Verworfen, weil Staging sich
verhalten soll wie Produktion – ein zusätzlicher Authentisierungsschritt davor testet etwas
anderes. Der Schutz liegt darin, dass dort keine echten Daten stehen.

**Ein Neon-Projekt mit zwei Datenbanken** statt zwei Branches. Verworfen: Branches sind bei Neon
genau dafür gedacht, kosten im Free-Tarif nichts (zehn sind erlaubt) und haben eigene Hostnamen –
die beiden Verbindungsstrings lassen sich damit nicht verwechseln.

### Konsequenzen
- **Positiv:** Staging lässt sich stoppen, neu bauen und wegwerfen, ohne die Produktion zu berühren.
- **Positiv:** Eine neue Umgebung kostet einen DNS-Eintrag, einen Neon-Branch und eine Compose-Datei.
- **Positiv:** Der Proxy ist der einzige Dienst mit Kontakt zum Internet – eine Stelle, an der TLS,
  Protokollierung und künftig Sicherheitskopfzeilen zu pflegen sind, nicht zwei.
- **Negativ:** Der Proxy ist ein **gemeinsamer Ausfallpunkt**. Fällt er, sind beide Umgebungen weg.
  Bewusst in Kauf genommen; die Alternative wäre ein zweiter Server.
- **Negativ:** Die Startreihenfolge ist jetzt vorgegeben – der Proxy muss zuerst laufen, weil er das
  Netz definiert. Compose sagt das mit einer klaren Meldung, aber man muss es wissen.
- **Negativ:** Beide Umgebungen teilen sich Arbeitsspeicher und CPU eines CX23. Bei vier Gigabyte und
  je etwa 300 MB pro Container unkritisch, aber keine Umgebung für Lasttests.
- **Achtung beim Umstellen:** Der Proxy bekommt eigene Volumen (`devboard-caddy-data`). Die
  Zertifikate aus dem alten Produktions-Stapel liegen unter einem anderen Namen und werden **einmal
  neu angefordert**. Let's Encrypt erlaubt fünf gleiche Zertifikate pro Woche – einmal ist
  unkritisch, wiederholtes Herumprobieren sperrt die Domain für Tage.

---

## ADR-019: Das Frontend läuft unter der eigenen Domain, nicht unter `*.vercel.app`

**Status:** Angenommen (22.08.2026)

### Kontext
Scheibe 6.6 stellt das Next.js-Frontend auf Vercel. Vercel vergibt dafür kostenlos eine Adresse der
Form `devboard.vercel.app`. Naheliegend wäre, sie einfach zu benutzen – eine Domain ist ja schon
vergeben, und `devboard.info` zeigt bisher auf die Parkseite des Registrars.

Beim Nachsehen im Code stellte sich heraus, dass das die Anmeldung zerstören würde.

DevBoard legt das Refresh-Token in ein Cookie:

```
httpOnly: true, secure: true, sameSite: 'lax', path: '/auth'
```

Und das Frontend ruft das Backend mit `credentials: 'include'` auf.

**`SameSite=Lax` bezieht sich auf die Site, nicht auf die Herkunft.** „Site" meint die registrierbare
Domain – bei uns `devboard.info`. Daraus folgt:

| Frontend | Backend | Verhältnis | Cookie |
|---|---|---|---|
| `devboard.vercel.app` | `api.devboard.info` | **cross-site** | wird weder gesetzt noch gesendet |
| `devboard.info` | `api.devboard.info` | cross-origin, aber **same-site** | funktioniert |

Der zweite Fall ist der interessante: Die beiden Adressen sind *verschiedene Herkünfte* – deshalb
braucht es weiterhin CORS – aber *dieselbe Site*, und genau darauf schaut `SameSite`.

Der Fehler wäre besonders unangenehm gewesen, weil er **halb** aussieht: Der Login-Aufruf antwortet
mit `200` und einem Access-Token, die Anwendung wirkt angemeldet. Erst beim Neuladen oder nach 15
Minuten fällt auf, dass es kein Refresh-Token gibt und die Sitzung weg ist.

### Entscheidung
Das Frontend wird von Beginn an unter **`devboard.info`** ausgeliefert, das Backend bleibt unter
`api.devboard.info`. Die `vercel.app`-Adresse bleibt bestehen, ist aber nicht die genannte Adresse
der Anwendung.

Damit bleibt `SameSite=Lax`, und die Entscheidung aus Sprint 1 muss nicht angefasst werden.

### Alternativen
**`SameSite=None; Secure` setzen.** Der technisch mögliche Weg, um die `vercel.app`-Adresse zu
benutzen. Verworfen, und zwar nicht knapp: Safari blockiert solche Cookies durch ITP von sich aus,
Firefox ebenfalls in der Standardeinstellung, und Chrome baut Drittanbieter-Cookies ab. Man würde
eine heute funktionierende Entscheidung gegen eine auslaufende tauschen – und das für eine Adresse,
die man ohnehin nicht in den Lebenslauf schreibt.

**Das Refresh-Token im Browserspeicher halten** statt im Cookie. Verworfen. Damit wäre es für
JavaScript lesbar, und der ganze Sinn von `httpOnly` – dass ein XSS-Fund nicht gleich die Sitzung
kostet – wäre dahin. Das war in Sprint 1 eine bewusste Entscheidung und bleibt es.

**Das Frontend hinter denselben Reverse Proxy hängen**, also selbst ausliefern statt Vercel. Dann
wäre alles gleiche Herkunft und CORS entfiele sogar. Verworfen wegen ADR-016: Statische Auslieferung
ist der Teil, den Vercel besser und kostenlos macht, und er lehrt nichts, was der Server nicht schon
zeigt.

### Konsequenzen
- **Positiv:** `SameSite=Lax` bleibt. Kein Drittanbieter-Cookie, keine Abhängigkeit von einer
  Browsereinstellung, die gerade abgebaut wird.
- **Positiv:** Die genannte Adresse der Anwendung ist die eigene Domain – für ein Portfolio der
  Unterschied zwischen „ein Projekt" und „ein Produkt".
- **Negativ, und das ist echt:** Die **Vorschau-Bereitstellungen** von Vercel pro Pull Request laufen
  unter wechselnden `*.vercel.app`-Adressen. Dort ist die Anmeldung aus demselben Grund nicht
  benutzbar. Vorschauen taugen also für Layout und öffentliche Seiten, nicht für angemeldete
  Ansichten. Wer das ändern will, braucht Vorschau-Adressen unterhalb der eigenen Domain – ein
  bezahltes Merkmal.
- **Negativ:** `CORS_ORIGIN` muss gepflegt werden. Kommt später `www.devboard.info` dazu, gehört sie
  in die Liste, sonst blockiert der Browser die Antworten.
- **Zu beachten:** Der DNS-Eintrag für `@` zeigt bisher auf die Parkseite des Registrars und muss auf
  Vercel umgestellt werden. `api` bleibt unberührt – zwei Namen, zwei Ziele.
