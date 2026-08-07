# Glossar

Begriffe, die im Projekt vorkommen – kurz und in eigenen Worten. Wächst mit jedem Sprint.

---

## Git & Zusammenarbeit

**Repository (Repo)** – Ein Projekt samt vollständiger Änderungshistorie. Bei Git liegt diese
Historie komplett lokal im Ordner `.git`.

**Commit** – Ein festgehaltener Stand. Identifiziert durch einen Hash, der aus Inhalt, Autor,
Zeitstempel **und** dem Hash des Vorgängers berechnet wird. Ändert sich etwas davon, ist es ein
anderer Commit – deshalb ändern sich beim Umschreiben auch alle Nachfolger.

**Staging Area (Index)** – Zwischenstufe zwischen Arbeitsverzeichnis und Commit. Erlaubt, gezielt
einzelne Dateien in einen Commit aufzunehmen (`git add <pfad>`) statt pauschal alles.

**Branch** – Abzweigung der Historie. Erlaubt Arbeit, ohne `main` zu gefährden.

**Remote** – Ein anderes Repository, mit dem man sich abgleicht. `origin` ist konventionell der
Name für das eigene Haupt-Remote – nur ein Name, keine Magie.

**Upstream / Tracking-Branch** – Verknüpfung zwischen lokalem Branch und Remote-Branch, gesetzt mit
`git push -u`. Danach genügen `git push` und `git pull` ohne Argumente.

**Pull Request (PR)** – Antrag, einen Branch in einen anderen zu übernehmen. Ort für Review und
automatisierte Prüfungen.

**Merge / Squash / Rebase** – Drei Wege, einen Branch zurückzuführen.
*Merge* behält alle Commits und erzeugt einen Merge-Commit.
*Squash* faltet alles zu einem Commit zusammen.
*Rebase* hängt die Commits linear an – keine Verzweigung in der Historie.

**Conventional Commits** – Konvention `typ(scope): beschreibung` mit den Typen `feat`, `fix`,
`docs`, `chore`, `test`, `refactor`, `ci`. Macht Commits maschinenlesbar (Changelog, Versionierung).

**`.gitignore`** – Liste von Pfaden, die Git ignoriert. Für Generiertes (`node_modules`, `dist`) und
Geheimes (`.env`).

**`.gitattributes`** – Repo-weite Regeln, z. B. für Zeilenenden. Gilt für jeden, der klont – im
Gegensatz zu lokalen Git-Einstellungen.

**CRLF / LF** – Zeilenenden unter Windows (`\r\n`) bzw. Linux (`\n`). Falsche Zeilenenden lassen
Shell-Skripte in Linux-Containern mit `bad interpreter: ...^M` scheitern.

---

## Docker

**Image** – Unveränderlicher Bauplan eines Containers.

**Layer** – Schicht eines Images. Werden zwischen Images geteilt und zwischengespeichert – der
Grund, warum ein gut geschriebenes Dockerfile schnell baut.

**Container** – Laufende Instanz eines Images. Flüchtig.

**Volume** – Speicher außerhalb des Container-Lebenszyklus.
*Named Volume*: von Docker verwaltet, richtig für Datenbanken.
*Bind Mount*: zeigt auf ein Verzeichnis des Wirtssystems, gut für Quellcode im Entwicklungsbetrieb.

**Registry** – Ablage für Images, standardmäßig Docker Hub.

**Tag** – Beweglicher Zeiger auf ein Image (`postgres:18-alpine`). `latest` ist kein Versprechen auf
Aktualität, sondern nur der Standardname.

**Digest** – Unveränderlicher Hash eines exakten Images (`@sha256:...`).

**Docker Compose** – Beschreibt mehrere Services deklarativ in `docker-compose.yml`. Ersetzt lange
`docker run`-Befehle.

**Healthcheck** – Regelmäßiger Befehl im Container, der prüft, ob der Dienst **bereit** ist – nicht
nur, ob der Prozess läuft.

**Detached (`-d`)** – Container laufen im Hintergrund, das Terminal bleibt frei.

**WSL2** – Windows Subsystem for Linux, Version 2. Schlanke Linux-VM, in der unter Windows alle
Container laufen.

**Hardware-Virtualisierung** – CPU-Funktion, die VMs ermöglicht. Bei AMD `SVM Mode`, bei Intel
`VT-x`. Muss im BIOS aktiviert sein, sonst startet Docker Desktop nicht.

---

## Architektur & Praxis

**Infrastructure as Code (IaC)** – Infrastruktur wird in versionierten Textdateien beschrieben statt
in einer GUI angeklickt. Merksatz: *Eine Konfiguration, die nicht im Repository steht, existiert
nicht.*

**Walking Skeleton / Tracer Bullet** – Eine hauchdünne Scheibe durch alle Schichten, die von Tag 1
läuft. Fachlich kann sie fast nichts – ihr Zweck ist, Integrationsprobleme früh sichtbar zu machen.

**Vertikaler Slice** – Ein Feature komplett durch alle Schichten (Datenbank bis UI), statt eine
Schicht nach der anderen zu bauen.

**ADR (Architecture Decision Record)** – Dokument, das *eine* Entscheidung mit Kontext, Alternativen
und Konsequenzen festhält. Wird nie umgeschrieben, sondern bei Bedarf durch eine neue ADR ersetzt.

**Definition of Done** – Verbindliche Kriterien, ab wann etwas fertig ist. „Läuft bei mir lokal" ist
nicht fertig.

**Secret** – Vertraulicher Wert (Passwort, Token, Schlüssel). Gehört nie ins Repository. Ist eines
doch hineingeraten: **erst rotieren, dann Historie bereinigen.**

---

## PostgreSQL

**`psql`** – Kommandozeilen-Client für PostgreSQL.

**`pg_isready`** – Kleines Werkzeug, das prüft, ob der Server Verbindungen annimmt. Grundlage
unseres Healthchecks.

**Data Directory** – Verzeichnis, in dem PostgreSQL seine Daten ablegt. Ab Version 18 im offiziellen
Image versionsbenannt: `/var/lib/postgresql/18/docker`.

**`pg_upgrade`** – Werkzeug für Major-Version-Upgrades. Erfordert beide Versionen und läuft nie
automatisch – der Grund, warum Image-Versionen gepinnt werden.

**Collation** – Sortier- und Vergleichsregeln für Text. Unterscheiden sich zwischen
Betriebssystemen – einer der Gründe, die Datenbank lokal im Linux-Container statt nativ unter
Windows zu betreiben.
