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

**Abgeschlossen am 11.08.2026** – zwei Wochen vor Plan, in zehn Scheiben:

- [x] Datenmodell: `Organization`, `Membership`, Rollen-Enum (ADR-008: Mandant als Pfad-Parameter)
- [x] Organisation anlegen und auflisten – erste Transaktion
- [x] `MitgliedschaftsGuard` und `@Rollen()` – **erster 403**, erster 404 durch Mandantenfilter
- [x] Mitgliederverwaltung mit Schutz der letzten `OWNER`-Mitgliedschaft (Zeilensperre)
- [x] Einladungen mit gehashten Token, an eine Adresse gebunden
- [x] Frontend: Liste, Anlegen, aktive Organisation
- [x] Frontend: Detailseite mit Mitgliederverwaltung
- [x] Frontend: Einladungen aussprechen und einlösen, Open-Redirect-Schutz
- [x] Politur: Umlaute in nutzersichtbaren Meldungen, Umbenennen
- [x] Zwischendurch behoben: doppelte Token-Erneuerung aus Sprint 1 (Single Flight)

**284 Tests** (98 Backend-Unit, 105 Backend-E2E, 81 Frontend), CI grün.

Drei Fehler wurden protokolliert – der veraltete Prisma-Client, ein Nebenläufigkeitstest, der nichts
bewachte, und die doppelte Token-Erneuerung. Der letzte stammte aus Sprint 1 und wurde erst
sichtbar, als die Anwendung tatsächlich gestartet wurde.

---

## Sprint 3 – Projekte, Tasks & Kanban-Board
**02.09. – 15.09.2026**

Der größte Sprint. Projekte innerhalb einer Organisation, Tasks mit Status und Reihenfolge,
Kanban-Board mit Drag & Drop und persistierter Sortierung.

**Abgeschlossen am 13.08.2026** – erneut vor Plan, in sieben Scheiben. **429 Tests**
(136 Backend-Unit, 155 Backend-E2E, 138 Frontend), CI grün.

Zwei ADRs entstanden: **ADR-009** (Fractional Indexing auf `numeric`) und **ADR-010**
(optimistisch beim Board, pessimistisch bei der Eigentümerregel).

Vier Fehler wurden protokolliert – der veraltete Prisma-Client als Wiederholungstäter, die
gerundete Decimal-Rechnung, eine Mutationsprobe mit kaputter Testumgebung und zwei E2E-Suiten, die
sich gegenseitig die Testdaten gelöscht haben. Der teuerste davon (`decimal.js` rundet ab 20
Stellen) wurde von einem **Grenzfalltest** gefunden, nicht vom Erfolgspfad.

**Kernthemen:** Sortier-Strategien (Integer-Positionen neu schreiben vs. fractional indexing) ·
Transaktionen · Race Conditions bei gleichzeitigem Verschieben · optimistische Updates im Frontend
mit Rollback bei Fehlern.

**Definition of Done** – die Scheiben, jede einzeln mergebar:

- [x] 3.1 Datenmodell: `Project`, `Task`, `TaskStatus`, `position`, `version` (12.08.2026)
- [x] 3.2 Projekte CRUD im Backend, mit negativen Tests (fremde Organisation ⇒ 404) (12.08.2026)
- [x] 3.3 Tasks CRUD, Zuweisung nur an Mitglieder derselben Organisation (13.08.2026)
- [x] 3.4 `PATCH …/tasks/:id/move` – Sortierlogik, 409 bei Versionskonflikt, Mutationsprobe (13.08.2026)
- [x] 3.5 Frontend: Projektliste und Projektdetail (13.08.2026)
- [x] 3.6 Frontend: Board mit dnd-kit, optimistisches Update mit Rollback (13.08.2026)
- [x] 3.7 Politur, Interviewfragen, Handbuch (13.08.2026)

**Entschieden in 3.1:**

- Sortierung per **fractional indexing** auf `numeric(65,30)` – ein `UPDATE` pro Verschiebung
  statt N. Begründung und Vergleichstabelle in `08_DATABASE.md`.
- Nebenläufigkeit **optimistisch** (Versionsspalte, 409), nicht pessimistisch wie in Sprint 2.
- Der Mandant wird über die Beziehung `project.organizationId` gefiltert, **nicht** auf `tasks`
  dupliziert – keine zweite Wahrheit im Mandantenfilter.

**Parallel:** GitHub-Profil – Bio geschärft, Bootcamp-Repos entpinnen. Nicht wieder verschieben.

---

## Sprint 4 – Dashboard & Aktivitäts-Feed
**16.09. – 22.09.2026**

Aggregierte Kennzahlen pro Organisation, chronologischer Aktivitäts-Feed.

**Abgeschlossen am 14.08.2026** – in sieben Scheiben. **494 Tests** (156 Backend-Unit,
176 Backend-E2E, 162 Frontend), CI grün.

Zwei ADRs entstanden: **ADR-011** (eigene Tabelle statt Ableitung, ausdrücklich *kein* Event
Sourcing) und **ADR-012** (Protokoll in der Transaktion statt im Event-Listener).

Der Sprint hat vor allem **Nachweise** hinterlassen statt Behauptungen: die N+1-Messung
(202 ⇒ 4 Abfragen bei 100 Projekten), die Ausführungspläne beider Feed-Pfade mit Gegenprobe, und
zwei Mutationsproben – von denen eine **gar nichts rot machte** und damit einen Test überführte,
der nur wie eine Prüfung aussah.

**Kernthemen:** N+1-Queries erkennen und beheben · Indizes · `EXPLAIN ANALYZE` lesen ·
Paginierung (Offset vs. Cursor) · Domain Events.

Kein großer Feature-Sprint, sondern ein **Datenmodell- und Performance-Sprint in
Feature-Verkleidung**. Genau darüber wird im Gespräch am liebsten gesprochen, weil „keine
N+1-Queries" fast jeder behauptet und fast niemand belegen kann.

**Entschieden vor 4.1** (ADR-011, ADR-012):

- Der Feed hat eine **eigene Tabelle** `activities`, er wird nicht aus `updatedAt` abgeleitet.
  Ein überschriebener Zeitstempel weiß nicht, *was* sich geändert hat und *wer* es getan hat.
- Einträge entstehen **inline in derselben Transaktion** wie die Änderung, nicht über
  `EventEmitter2`. Ein Feed, der Dinge behauptet, die zurückgerollt wurden, ist kaputt – und
  diese Garantie gibt es nur innerhalb der Transaktion. Der Preis ist Kopplung, und er wird in
  ADR-012 ausdrücklich bezahlt statt versteckt.
- Der Feed ist **zusätzlich nach Projekt filterbar**. Das kostet einen zweiten Index, einen
  zweiten Abfragepfad und einen eigenen negativen Test (fremdes Projekt *innerhalb* der eigenen
  Organisation ⇒ 404).

**Definition of Done** – die Scheiben, jede einzeln mergebar:

- [x] 4.1 Datenmodell `activities`, Migration, zwei Indizes, ADR-011 (14.08.2026)
- [x] 4.2 Aktivitäten schreiben: Projekte und Tasks protokollieren in ihrer Transaktion, ADR-012 (14.08.2026)
- [x] 4.3 `GET …/activity` mit Cursor-Paginierung, negative Tests, Cursor gegen Manipulation (14.08.2026)
- [x] 4.4 `GET …/dashboard/stats` – zuerst naiv, N+1 im Query-Log belegt, dann `groupBy` (14.08.2026)
- [x] 4.5 Frontend: Kennzahlen auf dem Dashboard (14.08.2026)
- [x] 4.6 Frontend: Feed mit „Mehr laden" (14.08.2026)
- [x] 4.7 `EXPLAIN ANALYZE` für beide Feed-Pfade protokolliert, Politur, Interviewfragen, Handbuch (14.08.2026)

**Der Nachweis, nicht die Behauptung.** In 4.4 wird die Kennzahlen-Abfrage **absichtlich zuerst
mit der N+1-Schleife** gebaut, das Prisma-Query-Log eingeschaltet und die Anzahl der Abfragen
notiert. Erst danach wird umgebaut. Beide Zahlen kommen in `12_TESTING.md` – „vorher 47 Abfragen,
nachher 2" ist belastbar, die Behauptung allein nicht.

> **Ab hier ist das Projekt vorzeigbar.** Alles danach steigert die Qualität, ist aber
> keine Voraussetzung mehr für ein Bewerbungsgespräch.

---

## Sprint 5 – GitHub-Integration
**23.09. – 01.10.2026** · vorgezogen auf den **16.08.2026**

Eine echte Integration statt vier angedeuteter: GitHub-Webhooks empfangen, verifizieren und
in den Aktivitäts-Feed einspeisen.

**Kernthemen:** Webhook-Signaturprüfung (HMAC) · Idempotenz bei mehrfach zugestellten Events ·
Retry-Verhalten · asynchrone Verarbeitung · Secrets sicher speichern.

Der erste Sprint, in dem **fremder Code unseren Server aufruft**. Alles bisher Gebaute lief in eine
Richtung: Unser Frontend fragt, unser Backend antwortet, und wer fragen darf, klärt ein Token. Hier
ruft GitHub an – ohne Konto, ohne Sitzung, ohne unseren Guard. Die Anfrage weist sich mit einer
Signatur aus, nicht mit einer Identität. Das ist der eigentliche Lehrinhalt.

**Entschieden vor 5.1** (ADR-013, ADR-014, ADR-015):

- **Repository-Webhook je Projekt**, keine GitHub App. Der Installationsablauf einer App bräuchte
  eine öffentlich erreichbare URL, die es vor Sprint 6 nicht gibt – und die Lehrinhalte sind bei
  beiden Wegen identisch.
- Das Geheimnis wird **verschlüsselt** abgelegt, nicht gehasht. Ein HMAC muss *nachgerechnet*
  werden, und dafür braucht man den Klartext. Damit lautet die Regel schärfer als bisher:
  **Wiedererkennen ⇒ hashen, nachrechnen ⇒ verschlüsseln.**
- Der Endpoint **quittiert und verarbeitet danach**. Signatur prüfen, Zustellung wegschreiben,
  `202`. Das ist die **Inbox**, nicht die Outbox – Sprint 5 empfängt nur.

**Zwei Dinge, die aus dem Bestand nachgezogen werden müssen:**

1. **`Activity` braucht eine Herkunft.** `actorId` ist heute genau dann `NULL`, wenn ein Konto
   gelöscht wurde – das Frontend schreibt dafür „Ein entferntes Mitglied". Ein GitHub-Ereignis hat
   ebenfalls keinen DevBoard-Nutzer. Ohne unterscheidendes Feld behauptet der Feed also, ein
   ausgetretener Kollege habe gepusht. Es braucht `Activity.source` (`APP` | `GITHUB`) und den
   GitHub-Anmeldenamen im `payload`.
2. **Der Feed muss unbekannte Typen ertragen** – tut er bereits. `ereignisSatz` fällt auf einen
   allgemeinen Satz zurück, `payload` wird als `unknown` gelesen. Die Entscheidung aus Sprint 4
   zahlt hier zum ersten Mal ein und wird durch einen Test festgehalten, statt vorausgesetzt.

**Definition of Done** – die Scheiben, jede einzeln mergebar:

- [ ] 5.1 Datenmodell: `RepositoryConnection`, `WebhookDelivery`, `Activity.source`, neue
      Ereignistypen, Migration, `UNIQUE` auf `deliveryId`
- [ ] 5.2 Repository verbinden und trennen – Endpoints, Geheimnis erzeugen und verschlüsseln,
      **einmalige** Klartextanzeige, negative Tests (fremde Organisation ⇒ 404, `MEMBER` ⇒ 403)
- [ ] 5.3 `POST /webhooks/github` – Rohrumpf, Signaturprüfung mit `timingSafeEqual`, `ping`,
      Zustellung wegschreiben, `202`. Mutationsprobe: Prüfung entfernen, Tests müssen rot werden
- [ ] 5.4 Idempotenz: zweite Zustellung derselben `deliveryId` ⇒ `200`, **kein** zweiter Eintrag.
      Belegt durch einen Test, der beide Zustellungen *gleichzeitig* absetzt
- [ ] 5.5 Verarbeitung: `push` und `pull_request` in Feed-Einträge übersetzen, Zustand je Zeile,
      gescheiterte Zustellungen wiederholbar
- [ ] 5.6 Frontend: Repository auf der Projektseite verbinden, GitHub-Ereignisse im Feed mit
      eigener Herkunftskennzeichnung
- [ ] 5.7 `10_SECURITY.md`, Aufbewahrungsfrist für `webhook_deliveries`, Interviewfragen, Handbuch

**Die Mutationsprobe ist in 5.3 nicht optional.** Eine Signaturprüfung ist der einzige Schutz eines
öffentlichen Endpoints – und der Erfolgspfad ist auch dann grün, wenn sie gar nichts prüft. Dieselbe
Lehre wie beim Mandantenfilter in Sprint 2, mit dem Unterschied, dass hier das ganze Internet
zusehen darf.

**Ausdrücklich nicht in diesem Sprint:** eine Rückmeldung an GitHub (Kommentar am Pull Request,
wenn eine Aufgabe auf „Erledigt" wandert). Sie wäre das, was das **Outbox**-Muster erst verdient –
und damit ein eigener Baustein, kein Anhängsel. Falls am Ende Zeit bleibt, ist sie der beste
Kandidat dafür.

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
