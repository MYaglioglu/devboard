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

---

## Architektur & NestJS

### 11. Was ist Dependency Injection und warum benutzt man sie?

Eine Klasse erzeugt ihre Abhängigkeiten nicht selbst, sondern bekommt sie hineingereicht – meist
über den Konstruktor. Ein Container übernimmt das Erzeugen und Verdrahten. Das Prinzip dahinter
heißt **Inversion of Control**: nicht die Klasse holt sich, was sie braucht, sondern es wird ihr
gegeben.

Der praktische Nutzen ist **Testbarkeit**. Eine Klasse mit `new PrismaService()` im Rumpf ist an eine
echte Datenbank gekettet: kein Unit-Test ohne laufende Datenbank, keine Möglichkeit,
Ausfallszenarien zu simulieren. Wird die Abhängigkeit injiziert, reicht man im Test eine Attrappe
hinein und in Produktion die echte Implementierung – ohne die Klasse zu ändern.

Zweitrangig, aber ebenfalls relevant: austauschbare Implementierungen und ein zentraler Ort für die
Lebenszyklus-Verwaltung der Objekte.

### 12. Wie weiß NestJS, welche Klasse es injizieren muss?

Aus dem **Typ des Konstruktor-Parameters**. TypeScript-Typen existieren zur Laufzeit normalerweise
nicht; die Compiler-Option `emitDecoratorMetadata` schreibt sie als Metadaten mit ins JavaScript
(`reflect-metadata`). Nest liest sie beim Start aus und sucht in den registrierten `providers` nach
einer passenden Klasse.

Deshalb der häufigste Anfängerfehler: `Nest can't resolve dependencies of X` bedeutet fast immer,
dass die benötigte Klasse nicht in den `providers` des Moduls steht oder das Modul sie nicht
exportiert.

### 13. Was gehört in einen Controller, was in einen Service?

**Controller:** HTTP entgegennehmen, Eingaben validieren, Antwort und Statuscode zurückgeben. Dünn.
**Service:** die Fachlogik. Kennt kein HTTP – keinen Request, kein Response.

Der Grund ist nicht Ästhetik: Ein Service ohne HTTP-Bezug ist aus einem Cronjob, einem
Queue-Worker oder einem Unit-Test genauso aufrufbar. Wandert die Logik in den Controller, ist sie an
den HTTP-Aufruf gebunden und nur noch über einen HTTP-Test erreichbar.

### 14. Welchen Scope haben Provider in NestJS?

Standardmäßig **Singleton** – eine Instanz für die gesamte Anwendung, geteilt von allen, die sie
injizieren. Alternativen sind `REQUEST` (eine Instanz pro Anfrage, nützlich für anfragebezogenen
Kontext, aber teurer) und `TRANSIENT` (jede Injektion bekommt eine eigene Instanz). In Spring ist
Singleton ebenfalls der Standard-Scope.

Wichtige Folge: Ein Singleton darf keinen veränderlichen Zustand pro Nutzer halten – der wäre
zwischen allen Anfragen geteilt.

### 15. Warum validierst du Umgebungsvariablen beim Start?

Weil `process.env.FOO` bei fehlender Variable `undefined` liefert, ohne Fehler. Die Anwendung startet
scheinbar normal und fällt Stunden später an unerwarteter Stelle um – mit einem Fehlerbild, das
nichts mit der Ursache zu tun hat.

Wird die Konfiguration beim Start gegen ein Schema validiert (hier Zod), bricht die Anwendung sofort
und mit klarer Meldung ab. Das Prinzip heißt **fail fast**: Fehler sollen so früh und so nah an
ihrer Ursache wie möglich auftreten. Ein Container, der wegen fehlender Konfiguration nicht
hochkommt, ist besser als einer, der halb funktioniert – und in einer Deployment-Pipeline führt er
zum sauberen Abbruch statt zu einem stillen Ausfall in Produktion.

### 16. Warum ein eigenes Backend statt der API-Routes von Next.js?

Technisch geht beides. Gegen die API-Routes spricht hier: keine erzwungene Schichtentrennung, kein
DI-Container, keine Guards und Interceptors – also genau die Struktur, die ein wachsendes Backend
trägt. Zudem lässt sich das Backend unabhängig skalieren, deployen und von anderen Clients (mobile
App, Cronjob, Webhook) nutzen.

Gegen ein eigenes Backend spricht der Mehraufwand: zwei Deployments, CORS, doppelte
Typdefinitionen. Bei einem kleinen Produkt mit einem einzigen Web-Client sind API-Routes die
pragmatischere Wahl.

### 17. Warum gliederst du nach Features und nicht nach technischen Schichten?

Bei einer Gliederung in `controllers/`, `services/`, `repositories/` sind für eine Änderung an einem
Thema drei entfernte Ordner zu öffnen, und Zusammengehörigkeit ist nirgends sichtbar. Bei
feature-basierter Gliederung (`auth/`, `projects/`, `tasks/`) liegt alles zu einem Thema beieinander:
Module lassen sich als Ganzes verstehen, verschieben oder entfernen, und jedes Modul kontrolliert
über `exports`, was es nach außen sichtbar macht.

Schichten gibt es weiterhin – nur **innerhalb** des Feature-Moduls statt als oberste Gliederungsebene.

---

## Datenbank, ORM & Betrieb

### 18. Was ist ein ORM, und wann würdest du keins nehmen?

Ein ORM übersetzt zwischen Datenbanktabellen und Objekten im Code und übernimmt Schemaverwaltung,
Migrationen und Typgenerierung.

**Kein ORM** bei sehr komplexen Abfragen (mehrere Joins, Fensterfunktionen, rekursive CTEs), bei
Datenanalyse-Lasten oder wenn das Team SQL sicher beherrscht und volle Kontrolle über den
Ausführungsplan braucht. Auch mit ORM greift man dafür punktuell auf rohes SQL zurück – bei Prisma
über `$queryRaw`.

Was man dabei nennen sollte: ORMs machen SQL bequem, aber nicht überflüssig. Wer nie sieht, welches
SQL erzeugt wird, findet keine N+1-Probleme.

### 19. Warum sind Migrationen versionierte Dateien im Repository?

Weil der Zustand der Datenbank sonst nicht reproduzierbar ist. Mit Migrationen lässt sich jede
Umgebung – lokal, CI, Staging, Produktion – aus demselben Repository in denselben Zustand bringen.
Dasselbe Prinzip wie bei `docker-compose.yml`: Infrastruktur als Code.

**Wichtige Regel:** Eine bereits angewendete Migration wird nie bearbeitet. Korrekturen kommen als
neue Migration obendrauf – sonst laufen die Umgebungen auseinander. Analog zu Git-Commits nach dem
Push.

Und: `prisma migrate dev` erzeugt Migrationen und kann die Datenbank zurücksetzen – nur lokal.
Auf einem Server läuft ausschließlich `prisma migrate deploy`, das nur anwendet.

### 20. Warum erzwingst du Eindeutigkeit in der Datenbank statt im Code?

Weil eine Prüfung im Code eine **Race Condition** enthält: Zwischen „gibt es die E-Mail schon?" und
dem Schreiben liegt ein Zeitfenster. Zwei gleichzeitige Registrierungen können beide die Prüfung
bestehen und beide schreiben.

Ein `UNIQUE`-Constraint wird von der Datenbank atomar durchgesetzt und kann nicht umgangen werden –
auch nicht von einem zweiten Dienst oder einem manuellen `INSERT`. Die Prüfung im Code bleibt
sinnvoll, aber für die **Fehlermeldung**, nicht für die Garantie.

### 21. Was ist der Unterschied zwischen Liveness und Readiness?

**Liveness:** Läuft der Prozess? Bei rot hilft ein Neustart.
**Readiness:** Kann er Anfragen bedienen? Bei rot – etwa weil die Datenbank weg ist – hilft ein
Neustart **nicht**; die Instanz gehört nur aus dem Verkehr genommen, bis die Abhängigkeit zurück ist.

Werden beide vermischt, startet ein Orchestrator bei einem Datenbankausfall alle Instanzen im Kreis
neu und verschlimmert die Lage.

### 22. Warum liefert dein Health-Endpoint 503 statt 200 mit einem Fehlerfeld?

Weil ein Health-Check von Maschinen ausgewertet wird – Loadbalancer, Docker, Kubernetes lesen den
**Statuscode**. Liefert der Endpoint immer 200, bekommt eine defekte Instanz weiter Anfragen und der
Check ist wirkungslos.

### 23. Wie testest du Verhalten bei einem Datenbankausfall?

Mit einer Attrappe statt der echten Datenbank. Der Service bekommt sie per Dependency Injection
hineingereicht, im Test wird sie durch ein Objekt ersetzt, dessen `isReachable()` `false` liefert.
Der Test braucht keinen Container, läuft in Millisekunden und prüft genau den Fall, der real kaum
herstellbar ist.

Zusätzlich habe ich es manuell verifiziert: Datenbankcontainer gestoppt → `/health` liefert 503,
Container zurück → 200. Attrappe prüft die Logik, der manuelle Versuch die Verdrahtung.
