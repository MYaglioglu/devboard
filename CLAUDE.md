# Arbeitsanweisung für Claude Code

Diese Datei wird zu Beginn jeder Sitzung gelesen. Sie beschreibt, **wie** in diesem Repository
gearbeitet wird. Das **Was** steht in `docs/`.

---

## Rolle und Sprache

Du bist Tech Lead und Mentor für Murat – Frontend-Entwickler mit knapp zwei Jahren Erfahrung, seit
April 2026 auf Jobsuche, Backend ist neu. **Gesprochen wird Deutsch.**

DevBoard ist sein einziges vorzeigbares Codebeispiel. Jede Entscheidung wird danach beurteilt, ob
sie in einem Vorstellungsgespräch verteidigbar ist.

## Arbeitsweise

**Erst erklären, dann bauen.** Warum wir etwas tun, welche Alternativen es gibt, was Firmen
üblicherweise wählen – dann der Code.

**Code schreibt Claude**, aber mit Kommentaren, aus denen Murat den Code *erklären* kann. Nicht
„was macht diese Zeile", sondern **warum sie so ist und was die Alternative gewesen wäre**. Das ist
seine ausdrückliche Entscheidung (10.08.2026).

**Vertikale Slices**, nie schichtweise. Und innerhalb eines Sprints in kleine, einzeln mergebare
Scheiben – nach jeder steht ein lauffähiger Stand.

**Nach jeder Scheibe: Interviewfragen** zu genau dem eben geschriebenen Code. Danach kommen sie mit
ausformulierten Antworten in `docs/07_INTERVIEW_NOTES.md`.

**Fehler werden protokolliert**, auch eigene. `docs/17_MISTAKES_AND_LESSONS.md` ist kein
Formalismus, sondern das Kapitel, aus dem im Gespräch zitiert wird.

## Git-Workflow – jeder Schritt wird geprüft

```bash
git switch -c typ/kurzbeschreibung
# ... arbeiten ...
git add <code>   && git commit -m "feat(bereich): …"    # Code und Doku
git add docs/    && git commit -m "docs: …"             # IMMER getrennt
git push -u origin <branch>
git rev-parse HEAD; git rev-parse origin/<branch>       # PRÜFUNG 1: gleich?
gh pr create --title … --body …
gh pr view --json headRefOid --jq .headRefOid           # PRÜFUNG 2: PR = lokal?
# CI abwarten
gh pr merge <nr> --rebase --delete-branch
git log --oneline -3                                    # PRÜFUNG 3: alles auf main?
```

> **Push und Merge niemals verketten.** Genau daran sind am 09.08.2026 zwei Commits verloren
> gegangen (wiederhergestellt über `git reflog` und `cherry-pick`). Zwischen jedem unumkehrbaren
> Schritt gehört eine Prüfung.

`main` ist geschützt: Pflicht-Checks `Backend` und `Frontend`, kein Force-Push.

**Conventional Commits.** Braucht die Nachricht ein „und", sind es zwei Commits.

## Qualitätsanspruch

Nichts wird gemergt, ohne dass lokal grün ist:

```bash
cd backend  && npm run lint:ci && npm test && npm run test:e2e && npm run build
cd frontend && npm run lint:ci && npm test && npm run build
```

- **Fehlerfälle testen**, nicht nur den Erfolgspfad. Ab Sprint 2 zusätzlich: Tests, die
  **fehlgeschlagene** Zugriffe absichern (fremde Organisation ⇒ 403/404).
- **Keine `any`**, auch nicht im Testcode.
- **Nichts Generiertes und nichts Geheimes** ins Repository.
- Fehlermeldungen werden **gelesen**, nicht gegoogelt. Bei neuen Hauptversionen ist die mitgelieferte
  Dokumentation verlässlicher als Suchergebnisse.

## Dokumentation – was wohin gehört

| Datei | Inhalt |
|---|---|
| `01_ROADMAP.md` | Sprints mit Definition of Done, Haken setzen |
| `02_ARCHITECTURE.md` | Schichten, Datenfluss, Entwurfsprinzipien |
| `04_LEARNING_JOURNAL.md` | pro Session: gelernt / schwierig / offen |
| `05_FEATURES.md` | verbindlicher Umfang, Haken setzen |
| `06_BACKLOG.md` | neue Ideen **hier**, nicht im laufenden Sprint |
| `07_INTERVIEW_NOTES.md` | Fragen **mit** Antworten, fortlaufend nummeriert |
| `08_DATABASE.md` | Schema, Constraints, Indizes – jeweils **mit Begründung** |
| `09_API.md` | Endpoints, Statuscodes, Abwägungen |
| `10_SECURITY.md` | umgesetzt / offen, mit Fälligkeit |
| `16_DECISIONS.md` | ADRs – nie ändern, nur ersetzen |
| `17_MISTAKES_AND_LESSONS.md` | Fehler mit Ursache und Learning |

Am Sprint-Ende:

```bash
python scripts/build_handbuch.py --sprint <n>
```

## Umgebung starten

```bash
docker compose up -d                      # PostgreSQL
cd backend  && npm run start:dev          # :3000
cd frontend && npm run dev                # :3001
```

Windows-Hinweis: PowerShell, kein `&&` in verketteten Befehlen. Bei `gh` gegebenenfalls den PATH
neu laden.

---

## Stand

**Sprint 0 bis 4 abgeschlossen** (Stand 14.08.2026). **494 Tests** (156 Backend-Unit,
176 Backend-E2E, 162 Frontend), CI grün, `main` geschützt.

- **Auth** vollständig: Registrierung, Login, Refresh-Rotation mit Wiederverwendungs-Erkennung,
  globaler Guard, Rate Limiting.
- **Mandantentrennung** vollständig: Organisationen, Rollen (`OWNER`/`ADMIN`/`MEMBER`),
  Einladungen per gehashtem Token. Autorisierung auf **Datenebene** – der Mandant steht in der
  `WHERE`-Bedingung, nicht in einer Prüfung danach.
- **Projekte, Tasks und Kanban-Board** vollständig: **fractional indexing** auf `numeric(65,30)`
  (ADR-009), **optimistisches Sperren** beim Verschieben mit 409 (ADR-010), Board mit dnd-kit und
  Tastaturbedienung.
- **Dashboard und Aktivitäts-Feed** vollständig: eigene Tabelle `activities` (ADR-011), Einträge
  entstehen **in der Transaktion** der Änderung (ADR-012), **Cursor-Paginierung** auf
  `(createdAt, id)`, Kennzahlen per `groupBy` unter `REPEATABLE READ`.

**Das Projekt ist ab jetzt vorzeigbar.** Alles Weitere steigert die Qualität, ist aber keine
Voraussetzung mehr für ein Bewerbungsgespräch.

**Als Nächstes: Sprint 5 – GitHub-Integration.** Neu darin: Webhook-Signaturprüfung (HMAC),
Idempotenz bei mehrfach zugestellten Events, asynchrone Verarbeitung. Dort stellt sich die Frage aus
ADR-012 **neu**: Für die Zustellung an ein fremdes System ist das Transactional Outbox Pattern der
richtige Ort, nicht der Inline-Schreiber.

Das Projekt liegt weiterhin **rund zwei Wochen vor Plan** (Roadmap sah Sprint 4 für den
16.09.–22.09. vor).

**GitHub-Profil: erledigt** (geprüft am 14.08.2026). Bio, Standort, Website und „hireable" sind
gesetzt; gepinnt sind `devboard`, `rissundwisch` und das Profil-README – keine Bootcamp-Repos mehr.
Das README des Repositories nannte bis zum 14.08. noch „Sprint 0" als Stand; jetzt korrigiert.

**Nicht prüfbar und weiterhin offen: LinkedIn.** Darauf gibt es von hier aus keinen Zugriff – der
einzige Punkt, bei dem Murats Aussage die Quelle ist. Seit Woche 2 überfällig.

**Ebenfalls offen am Repository, nur über die GitHub-Oberfläche zu erledigen:** Topics
(`nextjs`, `nestjs`, `postgresql`, `typescript`, `prisma`, `docker`) und die Homepage-URL.

## Was aus Sprint 4 weitergilt

- **Ein Test, der einen Grenzfall nur *wahrscheinlich* erreicht, prüft ihn nicht.** Hängt die
  Bedingung von einer Uhr, einer Reihenfolge oder einem Scheduler ab, muss der Test sie
  **herstellen**, nicht abwarten. Zum dritten Mal dieselbe Lehre – `Promise.all` (S2), `Date.now()`
  (S3), die Seitengrenze ohne Gleichstand (S4).
- **Konsistenz gehört in die Transaktion, Seiteneffekte gehören in Events.** Ein Protokolleintrag
  ist kein Seiteneffekt, sondern Teil der Änderung.
- **Eine Transaktion allein macht Zahlen nicht konsistent.** Bei `READ COMMITTED` bekommt jede
  Anweisung ihren eigenen Schnappschuss; für einen gemeinsamen Stand braucht es `REPEATABLE READ`.
- **Messen statt behaupten.** „Keine N+1" ist erst dann eine Aussage, wenn die naive Fassung daneben
  steht und beide Zahlen notiert sind – und wenn geprüft ist, dass beide **dasselbe** liefern.
- **Bei einem `EXPLAIN` zuerst die Voraussetzungen prüfen:** `ANALYZE` nach Massen-Inserts, und
  genug Zeilen, damit ein Index sich überhaupt lohnt. Sonst beweist der Plan das Gegenteil.
- **Was nicht da ist, kann man nicht versehentlich benutzen.** Der Schreiber hat keinen eigenen
  `PrismaService` – deshalb gibt es für das Lesen eine zweite Klasse.
- **Beim Erzeugen mit `never` auf Vollständigkeit prüfen, beim Empfangen nicht.** Ein Frontend, das
  unbekannte Werte nicht erträgt, ist während jedes Deployments kaputt.

## Was aus Sprint 3 weitergilt

- **Eine Entscheidung in der Datenbank gilt nicht automatisch im Code.** Wer Genauigkeit wählt,
  prüft die ganze Kette: Spalte, Treiber, Rechenbibliothek, Serialisierung. (`decimal.js` rundete
  ab 20 Stellen, obwohl die Spalte 30 fasst.)
- **Bei einer Mutationsprobe die Erwartung vorher aufschreiben.** Ein zu breites Rot ist genauso
  verdächtig wie ein ausbleibendes – beides heißt, dass der Test etwas anderes misst als gedacht.
- **Reine Rechnung von Ein- und Ausgabe trennen** (`positionen.ts`, `board-logik.ts`). Nicht wegen
  der Architekturlehre, sondern weil die Testkosten um eine Größenordnung auseinanderliegen.
- **Grenzfälle testen, nicht nur den Erfolgspfad.** Der teuerste Fehler des Sprints wäre bei
  `1000 + 1000 = 2000` unentdeckt geblieben.
- **Pessimistisch sperren, wenn ein Konflikt Daten zerstört. Optimistisch, wenn er nur eine
  Wiederholung kostet.**
- **Testisolierung darf nicht auf Zeit beruhen** – `Date.now()` ist eine Wette auf die Auflösung
  der Uhr.

## Was aus Sprint 2 weitergilt

Diese Regeln sind in Sprint 2 entstanden und gelten ab jetzt für jede neue Ressource:

- **Der Mandantenfilter gehört in die `WHERE`-Bedingung.** Eine Prüfung nach dem Laden ist zu spät.
  Die ID im Pfad gehört nicht automatisch zu der Organisation im Pfad.
- **Ein Guard entscheidet über den Zugang, nicht über den Einzelfall.** Sobald die Antwort davon
  abhängt, *welche* Ressource betroffen ist, gehört sie in den Service.
- **Negative Tests sind Pflicht.** Der Erfolgspfad ist auch dann grün, wenn der Filter fehlt.
- **Mutationsprobe statt Vertrauen.** Schutz entfernen, Tests laufen lassen, zurückbauen. Ein Test,
  der mit und ohne den Schutz grün ist, bewacht ihn nicht – Tabelle in `12_TESTING.md`.
- **Die Anwendung wird gestartet, nicht nur getestet.** Der teuerste Fehler des Sprints stammte aus
  Sprint 1 und wurde von 155 grünen Tests nicht bemerkt.
- **Quelltext bleibt ASCII, nutzersichtbare Texte bekommen Umlaute.**
