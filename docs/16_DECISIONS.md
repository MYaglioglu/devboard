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
