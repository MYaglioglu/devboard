# Features

Der verbindliche Umfang laut ADR-003. Was hier nicht steht, wird nicht gebaut – siehe `06_BACKLOG.md`.

Ein Feature gilt erst als fertig, wenn **alle** Kriterien erfüllt sind, einschließlich Tests.
„Läuft bei mir lokal" ist nicht fertig.

---

## F1 – Authentifizierung & Rollen *(Sprint 1)*

- [ ] Registrierung mit E-Mail und Passwort, Eingabevalidierung per Zod
- [ ] Passwörter mit argon2 gehasht, niemals im Klartext gespeichert oder geloggt
- [ ] Login gibt Access-Token (kurzlebig) und Refresh-Token (langlebig) zurück
- [ ] Refresh-Token-Rotation mit Erkennung wiederverwendeter Token
- [ ] Logout invalidiert den Refresh-Token serverseitig
- [ ] Geschützte Endpoints per Guard, geschützte Seiten im Frontend
- [ ] Unit-Tests für den Auth-Service, Integrationstests für die Endpoints

## F2 – Organisationen, Mitgliedschaften & Multi-Tenancy *(Sprint 2)*

- [ ] Nutzer kann Organisationen anlegen und gehört zu mehreren
- [ ] Rollen pro Organisation: Owner, Admin, Member
- [ ] Einladungs-Flow per Token
- [ ] Aktive Organisation im Frontend umschaltbar
- [ ] **Jede** Datenabfrage ist auf die Organisation des Nutzers eingeschränkt
- [ ] Tests, die *fehlgeschlagene* Zugriffe absichern: fremde Organisation ⇒ 403/404

## F3 – Projekte, Tasks & Kanban-Board *(Sprint 3)*

- [ ] CRUD für Projekte innerhalb einer Organisation
- [ ] CRUD für Tasks mit Status, Beschreibung, Zuweisung, Fälligkeitsdatum
- [ ] Kanban-Board mit Spalten und Drag & Drop
- [ ] Reihenfolge und Spaltenwechsel werden persistiert
- [ ] Gleichzeitiges Verschieben durch zwei Nutzer führt nicht zu Datenverlust
- [ ] Optimistisches Update im Frontend mit Rollback bei Serverfehler
- [ ] Tests für die Sortierlogik inklusive Grenzfällen

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
