# DevBoard

[![CI](https://github.com/MYaglioglu/devboard/actions/workflows/ci.yml/badge.svg)](https://github.com/MYaglioglu/devboard/actions/workflows/ci.yml)

Eine SaaS-Plattform für Entwicklerteams – Projekte, Aufgaben, Kanban-Board und Aktivitäts-Feed,
mit Organisationen und rollenbasiertem Zugriff.

> **Status (14.08.2026):** Sprint 0 bis 4 abgeschlossen – **494 Tests**, CI grün, `main` geschützt.
> Auth, Mandantentrennung, Projekte, Kanban-Board, Dashboard und Aktivitäts-Feed laufen.
> Als Nächstes folgt Sprint 5 (GitHub-Integration über Webhooks).
> Details in [`docs/01_ROADMAP.md`](docs/01_ROADMAP.md) und
> [`docs/15_CHANGELOG.md`](docs/15_CHANGELOG.md).

| | Umgesetzt |
|---|---|
| **Auth** | Registrierung mit argon2id, JWT mit Refresh-Rotation und Wiederverwendungs-Erkennung, globaler Guard, Rate Limiting |
| **Mandanten** | Organisationen, Rollen (`OWNER`/`ADMIN`/`MEMBER`), Einladungen per gehashtem Token. Autorisierung auf **Datenebene** – der Mandant steht in der `WHERE`-Bedingung |
| **Board** | Projekte und Aufgaben, Sortierung per fractional indexing auf `numeric(65,30)`, optimistisches Sperren mit `409`, Drag & Drop mit Tastaturbedienung |
| **Dashboard** | Kennzahlen per `groupBy` unter `REPEATABLE READ`, Aktivitäts-Feed mit Cursor-Paginierung |

**Was dieses Projekt von einem Tutorial-Klon unterscheidet** – die Stellen, an denen nachgemessen
statt behauptet wird:

- **Keine N+1-Queries, belegt:** `npm run messung:dashboard` lässt die naive und die optimierte
  Fassung nebeneinander laufen und zählt mit – 202 gegen 4 Abfragen bei 100 Projekten.
- **Indizes, belegt:** `npm run erklaere:feed` liest die Ausführungspläne auf 40.000 Zeilen,
  inklusive Gegenprobe ohne Index (`Rows Removed by Filter: 931`).
- **Tests, die nachweislich etwas bewachen:** Zu jedem sicherheitsrelevanten Schutz gibt es eine
  **Mutationsprobe** – Schutz entfernen, Tests laufen lassen, zurückbauen. Die Tabelle steht in
  [`docs/12_TESTING.md`](docs/12_TESTING.md), samt der Probe, die *nichts* rot machte und damit
  einen eigenen Test überführte.
- **Zwölf ADRs** mit Alternativen und Preis in [`docs/16_DECISIONS.md`](docs/16_DECISIONS.md), und
  ein [Fehlerprotokoll](docs/17_MISTAKES_AND_LESSONS.md) mit den eigenen Fehlern – inklusive der
  zwei Commits, die an einem verketteten `push && merge` verlorengingen.

---

## Warum es dieses Projekt gibt

DevBoard ist ein Lern- und Referenzprojekt auf dem Weg vom Frontend- zum Fullstack-Entwickler. Es
soll sich wie ein Produkt anfühlen, nicht wie ein Tutorial: mit Tests, Docker, CI-Pipeline,
Staging-Umgebung und dokumentierten Architekturentscheidungen.

Parallel zum Code entsteht unter [`docs/`](docs/) ein Entwicklerhandbuch – Architektur,
Datenbankdesign, API, Security, DevOps, Glossar und ein Fehlerprotokoll.

---

## Stack

| Bereich | Technologien |
|---|---|
| **Frontend** | Next.js, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form, Zod |
| **Backend** | NestJS, Prisma, PostgreSQL 18 |
| **Infrastruktur** | Docker, Docker Compose, GitHub Actions, nginx |

Warum TypeScript statt Java und warum NestJS statt Express: siehe ADR-001 und ADR-002 in
[`docs/16_DECISIONS.md`](docs/16_DECISIONS.md).

---

## Umfang – bewusst zugeschnitten

Gebaut werden **vier Kern-Features** plus **eine echte Integration**:

1. Authentifizierung und rollenbasierter Zugriff
2. Organisationen, Mitgliedschaften und Mandantentrennung
3. Projekte, Aufgaben und Kanban-Board
4. Dashboard und Aktivitäts-Feed
5. GitHub-Integration über Webhooks

Monitoring, Datei-Uploads, Volltextsuche, Benachrichtigungen und ein Administrationsbereich sind
**bewusst nicht** Teil des Umfangs. Die Begründung steht in
[`docs/06_BACKLOG.md`](docs/06_BACKLOG.md) und ADR-003.

Der Grund für den Schnitt: Vier fertige Features belegen mehr als zwölf angefangene.

---

## Lokal starten

**Voraussetzungen:** Node 24+, Docker Desktop (mit aktivierter Hardware-Virtualisierung), Git

```bash
git clone https://github.com/MYaglioglu/devboard.git
cd devboard
```

```bash
cp .env.example .env    # PowerShell: Copy-Item .env.example .env
```

Danach in der `.env` die Platzhalter durch eigene Werte ersetzen.

```bash
docker compose up -d
```

```bash
cd backend
npm install
npm run db:migrate
npm run start:dev
```

Prüfen:

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok", "uptimeSeconds": 12, "timestamp": "...", "checks": { "database": "up" } }
```

Liefert der Endpoint `503` mit `"database": "down"`, läuft der Datenbank-Container nicht.

---

Das Frontend startet separat:

```bash
cd frontend
npm install
npm run dev
```

Danach läuft die Oberfläche auf `http://localhost:3001`. Nach der Anmeldung zeigt das
Dashboard die Kennzahlen der aktiven Organisation und ihren Aktivitäts-Feed.

---

## Tests und Qualitätssicherung

```bash
cd backend
npm test          # Unit-Tests
npm run test:e2e  # E2E-Tests
npm run lint
```

Bei jedem Pull Request laufen Lint, Tests und Build für Backend und Frontend automatisch in
GitHub Actions – inklusive eines echten PostgreSQL-Service-Containers für die E2E-Tests. `main` ist
geschützt: kein Merge ohne grüne Pipeline. Details in
[`docs/11_DEVOPS.md`](docs/11_DEVOPS.md).

---

## Dokumentation

Die gesamte Dokumentation lässt sich als PDF-Handbuch erzeugen (Titelseite,
Inhaltsverzeichnis, alle Kapitel):

```bash
python -m pip install reportlab
python scripts/build_handbuch.py --sprint 4
```

Ergebnis: `DevBoard-Handbuch-Sprint-4.pdf` (rund 660 KB). Die Datei ist bewusst **nicht** im
Repository – sie lässt sich jederzeit aus den Markdown-Quellen neu erzeugen.

| Datei | Inhalt |
|---|---|
| [01_ROADMAP.md](docs/01_ROADMAP.md) | Sprints mit Definition of Done |
| [02_ARCHITECTURE.md](docs/02_ARCHITECTURE.md) | Schichten, Dependency Injection, Modulstruktur |
| [03_CODING_STANDARDS.md](docs/03_CODING_STANDARDS.md) | Konventionen und Regeln |
| [04_LEARNING_JOURNAL.md](docs/04_LEARNING_JOURNAL.md) | Lerntagebuch pro Session |
| [05_FEATURES.md](docs/05_FEATURES.md) | verbindlicher Umfang mit Abnahmekriterien |
| [06_BACKLOG.md](docs/06_BACKLOG.md) | begründet zurückgestellte Features |
| [07_INTERVIEW_NOTES.md](docs/07_INTERVIEW_NOTES.md) | Fachfragen mit Antworten |
| [08_DATABASE.md](docs/08_DATABASE.md) | Schema, Migrationen, Indizes |
| [09_API.md](docs/09_API.md) | Endpoints |
| [10_SECURITY.md](docs/10_SECURITY.md) | Maßnahmen und offene Punkte |
| [11_DEVOPS.md](docs/11_DEVOPS.md) | Docker, Compose, CI |
| [12_TESTING.md](docs/12_TESTING.md) | Teststrategie |
| [16_DECISIONS.md](docs/16_DECISIONS.md) | Architekturentscheidungen (ADRs) |
| [17_MISTAKES_AND_LESSONS.md](docs/17_MISTAKES_AND_LESSONS.md) | Fehlerprotokoll mit Learnings |

---

## Projektstruktur

```
backend/        NestJS-Anwendung
  prisma/       Datenmodell und Migrationen
  src/          Feature-Module
  scripts/      Messskripte (N+1, EXPLAIN ANALYZE)
  test/         E2E-Tests
frontend/       Next.js-Anwendung
scripts/        Handbuch-Erzeugung
docker/         Dockerfiles und nginx-Konfiguration (Sprint 6)
docs/           Entwicklerhandbuch
.github/        CI-Workflows
```
