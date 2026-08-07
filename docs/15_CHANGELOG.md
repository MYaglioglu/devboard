# Changelog

Alle nennenswerten Änderungen am Projekt. Neueste zuerst.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

---

## [Unreleased]

### Hinzugefügt
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
