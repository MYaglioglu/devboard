# Features

Der verbindliche Umfang laut ADR-003. Was hier nicht steht, wird nicht gebaut – siehe `06_BACKLOG.md`.

Ein Feature gilt erst als fertig, wenn **alle** Kriterien erfüllt sind, einschließlich Tests.
„Läuft bei mir lokal" ist nicht fertig.

---

## F1 – Authentifizierung & Rollen *(Sprint 1 – abgeschlossen am 11.08.2026)*

- [x] Registrierung mit E-Mail und Passwort, Eingabevalidierung per Zod
- [x] Passwörter mit argon2 gehasht, niemals im Klartext gespeichert oder geloggt
- [x] Login gibt Access-Token (kurzlebig) und Refresh-Token (langlebig) zurück
- [x] Refresh-Token-Rotation mit Erkennung wiederverwendeter Token
- [x] Logout invalidiert den Refresh-Token serverseitig
- [x] Geschützte Endpoints per Guard, geschützte Seiten im Frontend
- [x] Unit-Tests für den Auth-Service, Integrationstests für die Endpoints
- [x] Rate Limiting, Security-Header, einheitliche Fehlerantworten

**Rollen** (`Owner`/`Admin`/`Member`) folgen in Sprint 2 zusammen mit den Organisationen – ohne
Mandanten gäbe es noch nichts, worauf sich eine Rolle beziehen könnte.

## F2 – Organisationen, Mitgliedschaften & Multi-Tenancy *(Sprint 2 – abgeschlossen am 11.08.2026)*

- [x] Nutzer kann Organisationen anlegen und gehört zu mehreren
- [x] Rollen pro Organisation: Owner, Admin, Member
- [x] Einladungs-Flow per Token
- [x] Aktive Organisation im Frontend umschaltbar
- [x] **Jede** Datenabfrage ist auf die Organisation des Nutzers eingeschränkt
- [x] Tests, die *fehlgeschlagene* Zugriffe absichern: fremde Organisation ⇒ 403/404

**Über den Umfang hinaus umgesetzt**, weil ohne diese Punkte die Regeln lückenhaft geblieben wären:

- Schutz der letzten `OWNER`-Mitgliedschaft, abgesichert gegen gleichzeitige Zugriffe
  (`SELECT … FOR UPDATE`)
- Keine Rechteausweitung: `ADMIN` darf weder Rollen vergeben noch `OWNER` entfernen noch `ADMIN`
  einladen
- Einladungs-Token nur als SHA-256-Hash gespeichert, an eine E-Mail-Adresse gebunden
- Open-Redirect-Schutz beim Rückweg nach der Anmeldung

## F3 – Projekte, Tasks & Kanban-Board *(Sprint 3 – abgeschlossen am 13.08.2026)*

- [x] CRUD für Projekte innerhalb einer Organisation
- [x] CRUD für Tasks mit Status, Beschreibung, Zuweisung, Fälligkeitsdatum
- [x] Kanban-Board mit Spalten und Drag & Drop
- [x] Reihenfolge und Spaltenwechsel werden persistiert
- [x] Gleichzeitiges Verschieben durch zwei Nutzer führt nicht zu Datenverlust
- [x] Optimistisches Update im Frontend mit Rollback bei Serverfehler
- [x] Tests für die Sortierlogik inklusive Grenzfällen

**Über den Umfang hinaus umgesetzt**, weil ohne diese Punkte die Regeln lückenhaft geblieben wären:

- Zuweisung nur an Mitglieder **derselben** Organisation – erzwungen durch den Nachschlag der
  Mitgliedschaft, nicht durch eine zusätzliche Prüfung
- Archivierte Projekte bleiben lesbar, nehmen aber keine neuen Aufgaben mehr auf
- Neuverteilung der Sortierpositionen, wenn die Genauigkeit von `numeric(65,30)` erschöpft ist
- Das Board ist mit der Tastatur bedienbar, nicht nur mit der Maus

## F4 – Dashboard & Aktivitäts-Feed *(Sprint 4)*

- [ ] Kennzahlen pro Organisation: Projekte, offene und erledigte Tasks
- [ ] Chronologischer Aktivitäts-Feed über relevante Ereignisse
- [ ] Feed paginiert (Cursor-basiert)
- [ ] Keine N+1-Queries – nachgewiesen per Query-Log
- [ ] Passende Indizes gesetzt und in `08_DATABASE.md` begründet

## F5 – GitHub-Integration *(Sprint 5)*

- [ ] Webhook-Endpoint empfängt GitHub-Events
- [ ] HMAC-Signatur wird geprüft, ungültige Signaturen werden abgewiesen
- [ ] Doppelt zugestellte Events werden idempotent verarbeitet
- [ ] Events erscheinen im Aktivitäts-Feed der Organisation
- [ ] Secrets liegen ausschließlich in Umgebungsvariablen
- [ ] Tests mit aufgezeichneten Beispiel-Payloads

---

## Querschnitt – gilt für jeden Sprint

- [ ] Docker Compose startet die vollständige lokale Umgebung
- [ ] Tests: Unit, Integration, ein E2E-Pfad
- [ ] GitHub Actions grün vor jedem Merge
- [ ] Staging-Umgebung vor Produktion
- [ ] Dokumentation im selben Sprint aktualisiert, nicht nachträglich
