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

### Umlaute in nutzersichtbaren Fehlermeldungen *(Sprint 2, 11.08.2026 – für 2.9 vorgemerkt)*
Der Backend-Quelltext verzichtet durchgängig auf Umlaute. Für Kommentare ist das unproblematisch,
aber dieselben Zeichenketten landen als Fehlermeldung beim Nutzer: „Ernennen Sie zuerst einen
anderen Eigentuemer", „Sitzung ungueltig", „Einladung ungueltig", „Ungueltige Nutzer-ID". In der
Oberfläche sichtbar geworden, als die Detailseite eine 409-Antwort angezeigt hat.

Zu trennen sind zwei Dinge: **Quelltext** (Kommentare, Bezeichner) darf ASCII bleiben,
**nutzersichtbare Texte** brauchen korrekte Umlaute. Betrifft `auth.service.ts`,
`membership.guard.ts`, `invitations.service.ts`, `organizations.service.ts` und die Zod-Meldungen.
Wird beim Sprint-2-Abschluss gezogen – für ein Portfolio-Projekt ist das kein Detail.

### Frei konfigurierbare Board-Spalten *(Sprint 3, 12.08.2026)*
`TaskStatus` ist ein Enum mit `TODO`/`IN_PROGRESS`/`DONE` – drei feste Spalten für alle Projekte.
Echte Kanban-Werkzeuge lassen Spalten pro Projekt definieren, benennen und umsortieren. Dafür
müsste das Enum einer Tabelle `BoardColumn` weichen (`projectId`, `name`, `position`), und `tasks`
bekäme einen Fremdschlüssel darauf statt eines Enum-Werts.

Bewusst nicht in Sprint 3: Das Lernziel des Sprints ist die **Sortierung**, nicht die
Konfigurierbarkeit. Zudem sagt der Kommentar bei `role` in `08_DATABASE.md`, dass ein Enum nur
taugt, solange die Werteliste fest ist – genau deshalb ist sie hier für Sprint 3 fest definiert und
nicht halb konfigurierbar.

### `db:migrate` und `db:generate` zu einem Schritt verbinden *(Sprint 3, 12.08.2026)*
Der veraltete Prisma-Client hat zweimal Zeit gekostet (11.08. und 12.08., beide in
`17_MISTAKES_AND_LESSONS.md`). Migration und Client-Erzeugung sind fachlich **ein** Vorgang; dass
sie es technisch nicht immer sind, gehört nicht ins Gedächtnis, sondern ins Skript. Denkbar: ein
`db:migrate`, das anschließend immer generiert, oder ein Husky-Hook, der einen Client warnend
meldet, der älter ist als die jüngste Migration. Nicht sofort gezogen, weil es Werkzeugarbeit
mitten in einer Feature-Scheibe wäre.

### Neuverteilung der Sortierpositionen als Hintergrundarbeit *(Sprint 3, 12.08.2026)*
`tasks.position` ist `numeric(65,30)`. Wer 30-mal hintereinander an dieselbe Stelle einfügt,
verbraucht die Nachkommastellen; danach muss die Spalte neu verteilt werden. In Sprint 3 geschieht
das **synchron** in der Anfrage, die die Grenze erreicht – ein seltener, dafür langsamer Aufruf.
Sauberer wäre eine Hintergrundaufgabe, die betroffene Spalten außerhalb des Anfragepfades
neu verteilt. Braucht einen Job-Runner, den das Projekt bislang nicht hat.

### Aufbewahrungsfrist oder Partitionierung für `activities` *(Sprint 4, 14.08.2026)*
`activities` ist die erste Tabelle im Schema, die **unbegrenzt** wächst – alle anderen sind durch
die Zahl der Nutzer, Projekte oder Aufgaben begrenzt. Die Antwort darauf ist eine Aufbewahrungsfrist
(„älter als 12 Monate löschen") oder Partitionierung nach Monat, sodass alte Partitionen abgetrennt
werden können, ohne die Feed-Abfrage anzufassen.

Nicht in Sprint 4, weil ohne echten Verkehr niemand die richtige Frist kennt – und eine erfundene
Frist wäre eine Entscheidung, die sich später nur mit Datenverlust korrigieren lässt. Vermerkt in
ADR-011 als bekannte Konsequenz.

### Namen des Akteurs im Feed als Kopie mitschreiben *(Sprint 4, 14.08.2026)*
`activities.actorId` zeigt mit `ON DELETE SET NULL` auf `users`. Nach einer Kontolöschung steht im
Feed „Ein entferntes Mitglied" statt eines Namens. Echte Audit-Systeme schreiben deshalb den
Anzeigenamen als **Kopie** in den Eintrag – dann bleibt er lesbar, der Feed braucht keine Verbindung
zu `users`, und eine Namensänderung gilt nicht rückwirkend (was für ein Protokoll sogar richtig ist).

Nicht in Sprint 4, weil DevBoard keine nachweispflichtige Historie zeigt, sondern einen Feed. Der
zweite Grund ist didaktisch: Ohne die Verbindung zu `users` gäbe es in Scheibe 4.3 keinen Anlass,
über Prismas `include` und die Zahl der abgesetzten Abfragen zu sprechen.

### Typen aus dem Backend erzeugen statt abschreiben *(Sprint 4, 14.08.2026)*
`FeedEintrag`, `Kennzahlen` und `Projekt` stehen im Frontend als handgeschriebene Kopien der
Backend-Typen. Das ist eine zweite Wahrheit der gefährlichsten Sorte: beim Schreiben richtig, still
falsch, sobald das Backend ein Feld umbenennt – der Compiler sieht nur die Kopie.

Die Lösung wäre ein erzeugter Typ (OpenAPI-Schema aus NestJS plus Generator, oder ein geteiltes
Paket im Monorepo). Nicht in Sprint 4, weil beides Aufbau kostet, den ein Projekt dieser Größe
gerade noch ohne trägt – und weil die Entscheidung besser fällt, wenn in Sprint 5 klar ist, wie viel
Schnittstelle die GitHub-Integration mitbringt.

Teilweise entschärft ist es bereits: `payload` im Feed ist bewusst `unknown` und wird in
`feed-satz.ts` an einer Stelle vorsichtig gelesen – ein fehlendes Feld ergibt einen allgemeineren
Satz statt eines Absturzes.

### App-Hülle mit Sidebar *(Sprint 5, 16.08.2026)*
Heute baut jede der acht Seiten ihr eigenes `<main className="mx-auto min-h-screen …">` – in zwei
verschiedenen Breiten (`max-w-2xl` und `max-w-3xl`) und zwei Ausrichtungen. Beim Navigieren springt
der Inhalt seitlich und vertikal, es gibt keine bleibende Navigation, und „Abmelden" existiert nur
auf dem Dashboard. Geplant wäre ein geteiltes `layout.tsx` mit Sidebar (Projekte der aktiven
Organisation), Organisationswechsler und Kopfleiste.

Zwei kleinere Punkte gehören dazu: In `globals.css` steht noch die Arial-Zeile aus dem
Next.js-Starter, die die geladene Geist-Schrift überschreibt – der Browser meldet die Datei als
„preloaded but not used". Und das Board steht mit `md:grid-cols-3` in einem `max-w-2xl`-Container,
also rund 190 px je Spalte.

Nicht jetzt, weil Sprint 5 das inhaltlich stärkere Material liefert. Die Sichtbarkeit der
vorhandenen Arbeit bleibt aber ein echter Mangel – dies ist der erste Kandidat nach Sprint 5.

### Selbstverwaltung des Profils *(Sprint 5, 16.08.2026)*
`User.name` existiert im Schema und wird vom Feed über `akteurName` bereits bevorzugt angezeigt,
lässt sich aber nach der Registrierung **nie wieder ändern** – es gibt kein `users`-Modul, nur
`GET /auth/me` zum Lesen. Geplant wäre `GET`/`PATCH /users/me` plus ein Avatar-Baustein, der aus
dem Namen Initialen und aus der ID eine Farbe ableitet.

Ausdrücklich **nicht** gemeint ist ein Administrationsbereich über fremde Konten – der steht weiter
oben in dieser Datei und bleibt dort.

Der Bild-Upload dazu gehört nach Sprint 6: Auf der Container-Platte wäre er beim ersten
Zero-Downtime-Deployment verloren, das Argument gegen die lokale Ablage ist also ein
Deployment-Argument. Dort liegen Objektspeicher (MinIO) und persistente Volumes ohnehin auf dem
Tisch. Die Initialen sind kein Wegwerf-Zwischenschritt, sondern der Rückfall, den es für Konten
ohne Bild und für `actor: null` ohnehin braucht.

### Aufgabenzahlen in der Navigation *(Sprint 5, 16.08.2026)*
Eine Sidebar, die je Projekt die offenen Aufgaben zeigt. Der Reiz liegt nicht im Feature, sondern
in der Falle: pro Projekt eine Abfrage wäre genau das N+1, das in Sprint 4 gemessen und beseitigt
wurde. Richtig wäre ein zusätzliches `groupBy` nach `projectId` im bestehenden
Dashboard-Endpoint – eine Abfrage für alle Projekte, mit derselben Messung als Beleg.
