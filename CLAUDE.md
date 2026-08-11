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

**Sprint 0, 1 und 2 abgeschlossen** (Stand 11.08.2026). **284 Tests** (98 Backend-Unit,
105 Backend-E2E, 81 Frontend), CI grün, `main` geschützt.

- **Auth** vollständig: Registrierung, Login, Refresh-Rotation mit Wiederverwendungs-Erkennung,
  globaler Guard, Rate Limiting.
- **Mandantentrennung** vollständig: Organisationen, Rollen (`OWNER`/`ADMIN`/`MEMBER`),
  Einladungen per gehashtem Token, Frontend mit umschaltbarer aktiver Organisation.
  Autorisierung auf **Datenebene** – der Mandant steht in der `WHERE`-Bedingung, nicht in einer
  Prüfung danach. Siehe Kapitel *Mandantentrennung* in `02_ARCHITECTURE.md`.

**Als Nächstes: Sprint 3 – Projekte, Tasks und Kanban-Board.** Der größte Sprint. Neu darin:
Sortier-Strategien (Integer-Positionen vs. fractional indexing), optimistische Updates mit Rollback,
und Race Conditions beim gleichzeitigen Verschieben. Für Letzteres liegt aus Sprint 2 bereits ein
Muster vor – dort allerdings **pessimistisch** gesperrt; beim Board ist optimistisches Sperren die
passendere Wahl (begründet in `09_API.md`).

Das Projekt liegt **zwei Wochen vor Plan** (Roadmap sah Sprint 2 für den 24.08.–01.09. vor).

**Offen daneben:** GitHub-Profil (Bio, Profil-README, gepinnte Repos) und LinkedIn. Seit Woche 2
überfällig – mit 284 Tests, ADRs, Fehlerprotokoll und Handbuch gibt es jetzt etwas zu verlinken.

**Kleinigkeit:** `browser-demo-1@example.com` liegt noch in der lokalen Datenbank.

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
