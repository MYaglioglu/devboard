# Changelog

Alle nennenswerten Änderungen am Projekt. Neueste zuerst.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

---

## [Unreleased]

### Hinzugefügt
- **Sprint 1 abgeschlossen** – Authentifizierung von der Datenbank bis zur UI, 155 Tests
- **Sprint 1, Scheibe 6:** Rate Limiting (5/min für Anmelden), Helmet-Security-Header,
  globaler Exception-Filter ohne Stacktraces nach außen
- **Sprint 1, Scheibe 5b:** Vitest-Suite fürs Frontend (26 Tests) – fand sofort zwei echte Fehler
- **Sprint 1, Scheibe 5:** Anmelde- und Registrierungsformular (React Hook Form + Zod),
  Access-Token im Arbeitsspeicher, stilles Erneuern über das httpOnly-Cookie, geschütztes Dashboard
  mit TanStack Query
- **Sprint 1, Scheibe 4:** Globaler Access-Token-Guard (secure by default), `GET /auth/me`
- **Sprint 1, Scheibe 3:** Refresh-Token mit Rotation und Wiederverwendungs-Erkennung,
  `POST /auth/refresh` und `POST /auth/logout`
- **Sprint 1, Scheibe 2:** `POST /auth/login` mit JWT, Schutz gegen Timing-Angriffe
- **Sprint 1, Scheibe 1:** `POST /auth/register` mit argon2id
- ADR-007: Access-Token im Speicher, Refresh-Token im httpOnly-Cookie
- Interviewfragen 36–57 zu Passwörtern, JWT, Sitzungen und Guards
- **Sprint 0 abgeschlossen**
- GitHub-Actions-Pipeline: Lint, Unit-Tests, E2E-Tests und Build für Backend und Frontend,
  mit PostgreSQL-18-Service-Container
- Husky + lint-staged: Formatierung der geänderten Dateien vor jedem Commit
- Branch-Schutz auf `main`: Pflicht-Checks `Backend` und `Frontend`, kein Force-Push
- Interviewfragen 29–35 zu CI/CD, Glossarteil CI/CD
- Next.js-Frontend auf Port 3001 mit Statusseite, die `/health` abfragt
- CORS im Backend über `CORS_ORIGIN` konfigurierbar, restriktiv statt `*`
- Walking Skeleton geschlossen: Browser → Next.js → NestJS → Prisma → PostgreSQL
- Fehlerprotokoll: Push und Merge nie verketten (Wiederherstellung über reflog und cherry-pick)
- Interviewfragen 24–28 zu CORS, Server/Client Components und `NEXT_PUBLIC_`
- Prisma 7 mit PostgreSQL-Driver-Adapter, erste Migration (`users`)
- `GET /health` prüft die echte Datenbankverbindung, liefert 503 bei Ausfall
- Umgebungsvariablen werden beim Start mit Zod validiert (fail fast)
- ADR-006: Prisma als ORM
- Datenbank-, API- und Testing-Dokumentation; Interviewfragen 18–23
- NestJS-Grundgerüst in `backend/` (verifiziert: HTTP 200 auf Port 3000)
- ADR-005: Ein Repository, zwei getrennte npm-Projekte, npm als Paketmanager
- Architekturdokument: Schichten, Dependency Injection, feature-basierte Modulstruktur
- Lerntagebuch Session 2, Interviewfragen 11–17, Glossarteil NestJS
- Lerntagebuch, Interviewfragen mit Antworten, DevOps-Referenz und Glossar (Sprint 0, Session 1)
- PostgreSQL 18 als Docker-Compose-Service mit Healthcheck und persistentem Volume
- `.env` / `.env.example`-Paar für Konfigurationswerte
- ADR-004: PostgreSQL im Container statt lokaler Installation
- Fehlerprotokoll zum Volume-Mount-Wechsel ab PostgreSQL 18
- Roadmap mit 8 Sprints, verbindlicher Feature-Umfang, Backlog mit begründeten Streichungen
- ADR-001 bis ADR-003: TypeScript statt Java, NestJS als Framework, Scope-Schnitt
- Git-Konfiguration: `.gitignore`, `.gitattributes` (Zeilenenden-Normalisierung)

### Geändert
- Dokumentation von Java/Spring Boot auf TypeScript/NestJS umgestellt

---

## Sprint-Fortschritt

| Sprint | Inhalt | Status |
|---|---|---|
| 0 | Fundament (Walking Skeleton) | in Arbeit – Schritte 1–2 von 5 fertig |
| 1 | Authentifizierung & RBAC | offen |
| 2 | Organisationen & Multi-Tenancy | offen |
| 3 | Projekte, Tasks & Kanban | offen |
| 4 | Dashboard & Aktivitäts-Feed | offen |
| 5 | GitHub-Integration | offen |
| 6 | Deployment & Staging | offen |
| 7 | Politur & Portfolio | offen |
