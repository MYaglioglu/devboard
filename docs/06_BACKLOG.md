# Backlog

Hier stehen Features, die **bewusst nicht** in der aktuellen Roadmap sind. Sie sind nicht verworfen –
sie sind geparkt. Die Begründung steht dabei, damit die Entscheidung später überprüfbar ist und
nicht aus Vergesslichkeit wieder aufgerollt wird.

Regel: Neue Ideen, die während eines Sprints auftauchen, landen hier – **nicht** im laufenden Sprint.

Siehe ADR-003 in `16_DECISIONS.md`.

---

## Geparkt aus dem ursprünglichen Fernziel

### Monitoring / Metriken-Dashboard (Grafana-artig)
Ohne echten Traffic zeigt ein Metriken-Dashboard nur erfundene Kurven. Hoher Bau-Aufwand,
geringe Aussagekraft. *Sinnvoll, sobald DevBoard real genutzt wird.*

### Deployments-Feature im Produkt
DevBoard hat eine **echte** Deployment-Pipeline (Sprint 6). Ein nachgebautes Deployment-Feature
im Produkt wäre deren schwächere Kopie und würde im Gespräch Verwirrung stiften.

### Dateien / Uploads
Objektspeicher (S3 oder MinIO), signierte URLs, Virenscan-Frage, Größenlimits – viel Infrastruktur-
Gefummel für vergleichsweise wenig neuen Erkenntnisgewinn.

### Volltextsuche
Interessantes Thema (PostgreSQL Full-Text-Search, `tsvector`, GIN-Index) und als Ein-Tages-Erweiterung
später attraktiv. Aber erst sinnvoll, wenn genug Daten existieren, über die sich suchen lässt.

### Benachrichtigungen
Wird erst relevant, wenn Teams das Produkt tatsächlich gemeinsam nutzen. Technisch spannend
(SSE oder WebSockets, Zustellgarantien) – als spätere Erweiterung vorgemerkt.

### Administrationsbereich
Internes CRUD über Nutzer und Organisationen. Technisch anspruchslos, sendet kein Signal an
Interviewer.

### API-Keys
Grenzfall: klein und durchaus lehrreich (Key-Hashing, Scopes, Rate Limiting). Wird als erste
Erweiterung nach dem Kern geprüft, falls Zeit bleibt.

---

## Kandidaten für nach der Roadmap

- API-Keys mit Scopes und Rate Limiting
- Volltextsuche über Projekte und Tasks
- Echtzeit-Updates auf dem Kanban-Board (WebSockets)
- Redis als Cache für das Dashboard
- OpenTelemetry-Tracing
- Jira- oder Linear-Integration – aber erst, wenn die GitHub-Integration wirklich rund ist

---

## Während der Sprints aufgekommene Ideen

_(hier eintragen, statt den laufenden Sprint aufzublähen)_

### Sprechender `slug` für Organisationen *(Sprint 2, 11.08.2026)*
`/orgs/acme/projects` statt `/organizations/<uuid>/projects`. Laut ADR-008 adressieren wir über
UUIDs; ein Slug wäre ein zweiter Adressierungsweg auf dieselbe Ressource und brächte eigene Fragen
mit (Eindeutigkeit, reservierte Wörter wie `new` oder `settings`, Umbenennen bei bestehenden Links).
Kein Erkenntnisgewinn, der den Aufwand rechtfertigt – aber ein hübsches Detail, falls Zeit bleibt.

### Datenbank-Trigger für „mindestens ein OWNER" *(Sprint 2, 11.08.2026)*
Die Regel wird derzeit in der Anwendung durchgesetzt, abgesichert über eine Zeilensperre. Das
Robusteste wäre ein Constraint in der Datenbank – dort kann ihn kein Codepfad umgehen, auch kein
Migrationsskript und kein manueller Eingriff in `psql`. In PostgreSQL ist „mindestens eine Zeile
mit `role = OWNER` je `organizationId`" aber nicht als `CHECK` ausdrückbar; es bräuchte einen
`AFTER`-Trigger oder eine materialisierte Zählspalte. Beides ist Aufwand und eine Fehlerquelle für
sich. Lohnt sich, sobald es mehr als einen Dienst gibt, der auf diese Tabellen schreibt.

### Partieller Unique-Index für offene Einladungen *(Sprint 2, 11.08.2026)*
Sauber wäre `UNIQUE (organizationId, email) WHERE acceptedAt IS NULL AND revokedAt IS NULL` –
„höchstens eine offene Einladung je Adresse", von der Datenbank erzwungen. Prisma kann partielle
Indizes nicht deklarieren; von Hand in die Migration geschrieben meldet `migrate dev` bei jedem
Lauf Drift. Ein voller Unique-Index wäre falsch, weil er eine zweite Einladung nach Ablauf der
ersten verhindern würde. Die Regel liegt deshalb im Service, abgesichert durch eine Transaktion.

### E-Mail-Versand für Einladungen *(Sprint 2, 11.08.2026)*
Derzeit gibt die API den Einladungs-Token in der Antwort zurück, damit der Flow ohne Mailversand
benutzbar ist. Korrekt wäre: Token ausschließlich per E-Mail, der Einladende sieht ihn nie und
kann die Einladung nicht selbst einlösen. Braucht einen Mailversanddienst und eine Vorlage –
Infrastruktur, die für den Erkenntnisgewinn dieses Projekts wenig beiträgt. Vermerkt in
`10_SECURITY.md` als bewusste Abweichung.
