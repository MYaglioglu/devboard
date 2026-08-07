# Interview Notes

Fragen, die zu den bisher gebauten Themen realistisch gestellt werden – mit Antworten in eigenen
Worten. Ziel ist nicht Auswendiglernen, sondern laut erklären können.

---

## Docker & Container

### 1. Was ist der Unterschied zwischen einem Image und einem Container?

Ein **Image** ist ein unveränderlicher Bauplan – Dateisystem, Programme, Startbefehl. Ein
**Container** ist eine laufende Instanz davon. Aus einem Image lassen sich beliebig viele Container
starten, so wie aus einer Klasse beliebig viele Objekte.

Der praktisch wichtige Teil: Container sind flüchtig. Änderungen im Container gehen beim Löschen
verloren; das Image bleibt unverändert.

### 2. Warum sind Container keine virtuellen Maschinen?

Eine VM bringt ein vollständiges Gastbetriebssystem mit eigenem Kernel mit – Start in Minuten,
Gigabytes an RAM. Container teilen sich den **Kernel des Wirtssystems** und isolieren nur Prozesse,
Dateisystem und Netzwerk (über Namespaces und cgroups). Start in Millisekunden, Overhead im
Megabyte-Bereich.

**Nachfrage, die oft kommt:** *Warum braucht Docker unter Windows dann trotzdem eine VM?*
Weil Windows keinen Linux-Kernel hat. Docker Desktop betreibt über WSL2 eine schlanke Linux-VM, in
der alle Container laufen. Auf einem Linux-Server entfällt diese Zwischenschicht.

### 3. Was passiert mit den Daten eines Containers, wenn er gelöscht wird?

Sie sind weg. Alles, was in das Dateisystem des Containers geschrieben wird, lebt nur so lange wie
der Container.

Lösung: **Volumes** – Speicher außerhalb des Container-Lebenszyklus, der hineingemountet wird. Für
eine Datenbank ist das nicht optional. Zwei Varianten:
- **Named Volume** – von Docker verwaltet, für Datenbanken die richtige Wahl (schnell, keine
  Rechteprobleme).
- **Bind Mount** – zeigt auf ein Verzeichnis des Wirtssystems, gut für Quellcode im
  Entwicklungsbetrieb, schlecht für Datenbanken (Rechte, Performance über Dateisystemgrenzen).

### 4. Warum sollte man `latest` nicht als Image-Tag verwenden?

`latest` heißt nicht „das Neueste", sondern ist nur der Standard-Tag-Name – ein **beweglicher
Zeiger**, vergleichbar mit einem Git-Branch statt einem Commit-Hash.

Konkrete Folge, selbst erlebt: PostgreSQL speichert sein Datenverzeichnis versionsabhängig. Springt
das Image von 18 auf 19, startet der Container nicht mehr (`database files are incompatible with
server`) – ein Major-Upgrade erfordert einen expliziten `pg_upgrade`-Schritt. Dazu: Builds brechen
ohne jede Code-Änderung, und wer das Repository klont, bekommt eine andere Umgebung als ich.

Praxis: Major-Version pinnen (`postgres:18-alpine`), damit Patches noch durchkommen. Wo maximale
Reproduzierbarkeit gefordert ist, pinnt man auf den **Digest** (`@sha256:...`) – Preis: Updates
müssen von Hand gepflegt werden.

### 5. Warum Docker Compose statt eines `docker run`-Befehls?

`docker run` mit einem Dutzend Flags steht nur in der Shell-Historie. Compose beschreibt dasselbe
**deklarativ in einer Datei**, die im Repository liegt: versioniert, überprüfbar, reproduzierbar,
und zugleich Dokumentation der benötigten Dienste. Aus dem Einzeiler wird `docker compose up`.

Üblich in Firmen: Compose für lokale Entwicklung, Kubernetes oder ECS für Produktion. Bei kleinen
Setups läuft Compose auch in Produktion.

### 6. Was leistet ein Healthcheck, das ein laufender Prozess nicht schon beweist?

Docker sieht nur, ob der Prozess gestartet ist – nicht, ob er **bereit** ist, Anfragen anzunehmen.
Postgres braucht nach dem Start einige Sekunden für Recovery und Initialisierung.

Der Healthcheck führt in festen Abständen einen Befehl im Container aus (bei Postgres
`pg_isready`) und setzt den Status auf `healthy` oder `unhealthy`. Andere Services können dann per
`depends_on: condition: service_healthy` warten, statt gegen eine noch geschlossene Datenbank zu
laufen und abzustürzen. Das ist die Standardlösung für Startreihenfolge-Probleme in verteilten
Systemen.

### 7. Warum erreicht ein Backend-Container die Datenbank nicht unter `localhost:5432`?

Weil `localhost` **innerhalb** eines Containers der Container selbst ist – jeder Container hat einen
eigenen Netzwerk-Namespace. Das Backend würde in sich selbst nach Postgres suchen.

Compose legt ein privates Netzwerk an, in dem jeder Service unter seinem **Service-Namen** per DNS
erreichbar ist. Die richtige Adresse lautet `db:5432`. Nur vom Wirtssystem aus gilt
`localhost:5432` – und auch das nur, weil der Port per `ports:` veröffentlicht wurde.

---

## Sicherheit & Konfiguration

### 8. Wie verhinderst du, dass Zugangsdaten im Repository landen – und was tust du, wenn es doch passiert ist?

**Verhindern:** Werte kommen aus einer `.env`, die in der `.gitignore` steht. Im Repository liegt
nur `.env.example` mit denselben Schlüsseln und Platzhalter-Werten – als Bauanleitung für jeden, der
klont. Vor jedem Commit die Dateiliste prüfen. In Produktion kommen Secrets aus dem Secret-Store der
Umgebung (GitHub Actions Secrets, Docker Secrets), nicht aus einer Datei.

**Wenn es passiert ist:** Das Secret ist kompromittiert, auch wenn der nächste Commit es löscht –
es bleibt in der Historie und in jedem Klon. Reihenfolge:
1. **Secret sofort rotieren** (Passwort/Token ungültig machen). Das ist der einzige Schritt, der
   wirklich schützt.
2. Erst danach die Historie bereinigen (`git filter-repo` oder BFG) und Force-Push – aufwendig und
   für alle Mitarbeitenden störend.

Die Reihenfolge ist die eigentliche Antwort: **rotieren zuerst, aufräumen danach.** Wer nur die
Historie säubert, hat nichts gesichert.

---

## Git & Zusammenarbeit

### 9. Warum arbeitet man mit Feature-Branches statt direkt auf `main`?

`main` bleibt jederzeit deploybar. Arbeit findet auf kurzlebigen Branches statt und wird per Pull
Request zurückgeführt – dort greifen Review und CI-Pipeline, bevor etwas in `main` landet. Bricht
ein Branch, ist `main` unversehrt.

Gängige Modelle: **GitHub Flow / Trunk-Based** (nur `main` plus kurze Feature-Branches) für moderne
Web-Teams, **Git Flow** (mit `develop`, `release`, `hotfix`) bei festen Release-Zyklen. Für
Continuous Deployment ist GitHub Flow der Standard.

### 10. Wann darf man Git-Historie umschreiben?

Solange sie **nur lokal** existiert. Rebase, Amend und Squash ändern Commit-Hashes; hat jemand die
alten Commits bereits geholt, divergieren die Historien und ein Force-Push zieht anderen den Boden
weg. Regel: **vor dem Push frei, nach dem Push tabu** – außer auf einem Branch, an dem nachweislich
niemand sonst arbeitet, und dann mit `--force-with-lease` statt `--force`.
