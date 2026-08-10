# Roadmap

**Stand:** 06.08.2026 · **Zeitbudget:** Vollzeit (30–40 h/Woche) · **Arbeitsweise:** vertikale Slices

Jeder Sprint liefert ein Feature komplett durch alle Schichten – Datenbank, Backend, API, Frontend, Tests –
statt eine Schicht nach der anderen. Ein Sprint gilt erst als fertig, wenn seine Definition of Done
vollständig erfüllt ist. Kein „mache ich später fertig".

---

## Sprint 0 – Fundament (Walking Skeleton)
**06.08. – 12.08.2026**

Eine hauchdünne Scheibe durch alle Schichten, die von Tag 1 läuft: Next.js → NestJS → Prisma →
Postgres im Container, dazu Tests und eine grüne CI-Pipeline.

**Definition of Done**
- [x] Git-Repository initialisiert, Branch-Strategie und Commit-Konvention dokumentiert
- [x] `docker compose up` startet PostgreSQL mit persistentem Volume
- [x] NestJS läuft, `/health` prüft die echte DB-Verbindung
- [x] Prisma-Schema angelegt, erste Migration ausgeführt
- [x] Next.js zeigt einen Wert an, der nachweislich aus Postgres kommt
- [x] ESLint, Prettier, Husky + lint-staged aktiv
- [x] GitHub Actions: Lint, Test und Build laufen grün (mit Postgres-Service-Container)
- [x] ADR-001 bis ADR-006 in `16_DECISIONS.md` geschrieben
- [x] Branch-Schutz auf `main`: Pflicht-Checks, kein Force-Push

**Abgeschlossen am 09.08.2026.** Pipeline im ersten Durchlauf grün (1 min 1 s).

---

## Sprint 1 – Authentifizierung & RBAC
**13.08. – 21.08.2026**

Registrierung, Login, Passwort-Hashing mit argon2, JWT mit Access-/Refresh-Token-Rotation,
Guards, geschützte Routen im Frontend.

**Kernthemen:** Warum niemals Klartext-Passwörter · JWT vs. Session-Cookies · warum Refresh-Token
rotieren · wo ein Token im Browser sicher liegt · Guards als NestJS-Pendant zu Spring Security Filtern.

**Parallel (nicht an den Schluss schieben):** GitHub-Profil aufräumen – Bio, Profil-README,
gepinnte Repos. LinkedIn aktualisieren.

**Abgeschlossen am 11.08.2026**, in sechs Scheiben plus einer nachgezogenen für Frontend-Tests:

- [x] Registrierung mit argon2id
- [x] Login mit JWT, Schutz gegen Timing-Angriffe
- [x] Refresh-Token mit Rotation und Wiederverwendungs-Erkennung
- [x] Globaler Guard (secure by default), `GET /auth/me`
- [x] Anmelde- und Registrierungsformular, geschütztes Dashboard
- [x] Frontend-Tests (Vitest), nachgezogen statt aufgeschoben
- [x] Rate Limiting, Security-Header, einheitliche Fehlerantworten

**155 Tests** (83 Backend-Unit, 48 Backend-E2E, 26 Frontend), alle in der CI.

---

## Sprint 2 – Organisationen, Teams & Multi-Tenancy
**24.08. – 01.09.2026**

Nutzer gehören zu Organisationen, Rollen pro Organisation (Owner / Admin / Member),
Einladungs-Flow. Jede Datenabfrage wird auf die aktive Organisation eingeschränkt.

**Kernthemen:** Mandantentrennung · Autorisierung auf Datenebene statt nur auf Endpoint-Ebene ·
Join-Tabellen mit zusätzlichen Attributen · warum „vergessener Tenant-Filter" die häufigste
kritische Sicherheitslücke in B2B-SaaS ist.

---

## Sprint 3 – Projekte, Tasks & Kanban-Board
**02.09. – 15.09.2026**

Der größte Sprint. Projekte innerhalb einer Organisation, Tasks mit Status und Reihenfolge,
Kanban-Board mit Drag & Drop und persistierter Sortierung.

**Kernthemen:** Sortier-Strategien (Integer-Positionen neu schreiben vs. fractional indexing) ·
Transaktionen · Race Conditions bei gleichzeitigem Verschieben · optimistische Updates im Frontend
mit Rollback bei Fehlern.

---

## Sprint 4 – Dashboard & Aktivitäts-Feed
**16.09. – 22.09.2026**

Aggregierte Kennzahlen pro Organisation, chronologischer Aktivitäts-Feed.

**Kernthemen:** N+1-Queries erkennen und beheben · Indizes · `EXPLAIN ANALYZE` lesen ·
Paginierung (Offset vs. Cursor) · Domain Events.

> **Ab hier ist das Projekt vorzeigbar.** Alles danach steigert die Qualität, ist aber
> keine Voraussetzung mehr für ein Bewerbungsgespräch.

---

## Sprint 5 – GitHub-Integration
**23.09. – 01.10.2026**

Eine echte Integration statt vier angedeuteter: GitHub-Webhooks empfangen, verifizieren und
in den Aktivitäts-Feed einspeisen.

**Kernthemen:** Webhook-Signaturprüfung (HMAC) · Idempotenz bei mehrfach zugestellten Events ·
Retry-Verhalten · asynchrone Verarbeitung · Secrets sicher speichern.

---

## Sprint 6 – Deployment & Staging
**02.10. – 08.10.2026**

Multi-Stage-Dockerfiles, nginx als Reverse Proxy, Staging- und Produktionsumgebung auf dem
eigenen Hetzner-Server, automatisches Deployment aus GitHub Actions.

**Kernthemen:** Warum Staging existiert (siehe `17_MISTAKES_AND_LESSONS.md`) · Build- vs.
Laufzeit-Umgebungsvariablen · Zero-Downtime-Deployment · Rollback-Strategie · Backups.

---

## Sprint 7 – Politur & Portfolio
**09.10. – 14.10.2026**

README mit Screenshots und Architekturdiagramm, Doku-Export als PDF, Aufräumen,
Interviewfragen aus `07_INTERVIEW_NOTES.md` durchgehen.

---

## Nicht in dieser Roadmap

Alles, was im Fernziel stand, aber bewusst nicht gebaut wird, steht mit Begründung in
`06_BACKLOG.md`. Nichts davon ist verworfen – es ist geparkt.
