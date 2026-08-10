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
