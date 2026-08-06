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

## ADR-004 bis ADR-006

Folgen im Lauf von Sprint 0: Repository-Layout, PostgreSQL im Container statt lokaler Installation,
Prisma als ORM.
