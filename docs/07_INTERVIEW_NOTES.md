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

---

## Frontend & Browser

### 24. Was ist CORS und warum gibt es das?

**Cross-Origin Resource Sharing.** Eine „Herkunft" (Origin) besteht aus Schema, Host und Port –
weicht eines davon ab, ist es eine fremde Herkunft. `http://localhost:3001` und
`http://localhost:3000` sind verschieden.

Standardmäßig verhindert die Same-Origin-Policy des Browsers, dass ein Skript die Antwort einer
fremden Herkunft **auslesen** kann. CORS ist der Mechanismus, mit dem ein Server das gezielt
erlaubt – über den Header `Access-Control-Allow-Origin`.

**Wozu?** Ohne diese Regel könnte jede beliebige Webseite im Hintergrund Anfragen an eine API
stellen, bei der man angemeldet ist, und die Antworten auslesen.

Wichtig: Die Anfrage wird oft **gesendet** und vom Server verarbeitet – blockiert wird das *Auslesen
der Antwort*. Deshalb schützt CORS nicht vor schreibenden Angriffen; dafür sind CSRF-Schutz und
`SameSite`-Cookies zuständig.

### 25. Wo behebt man einen CORS-Fehler – Frontend oder Backend?

Im **Backend**. Der Server entscheidet, welche Herkunft ihn aufrufen darf. Im Frontend lässt sich
nichts „erlauben" – jeder vermeintliche Frontend-Fix ist entweder ein Proxy (der die Anfrage über
den eigenen Server umleitet) oder das Abschalten einer Sicherheitsfunktion.

`origin: '*'` ist keine Lösung, sondern das Abschalten des Schutzes – und in Verbindung mit
`credentials: true` von der Spezifikation ohnehin verboten.

### 26. Im Browser steht nur „Failed to fetch". Wie gehst du vor?

Erster Griff: **Konsole und Netzwerk-Tab öffnen (F12)**. Das JavaScript bekommt bei einem
CORS-Verstoß bewusst keine Details – würde der Browser sie durchreichen, wäre die Sperre umgehbar.
Der tatsächliche Grund steht nur in der Konsole.

Danach der Reihe nach prüfen: Läuft der Zielserver überhaupt? Stimmt der Port? Steht in der Antwort
ein `Access-Control-Allow-Origin`, und passt es zur Herkunft? Bei Methoden wie `PUT` oder `DELETE`
und eigenen Headern kommt ein **Preflight** mit `OPTIONS` dazu – der muss ebenfalls beantwortet
werden.

### 27. Wann fetchst du in einer Server Component, wann im Client?

**Server Component:** wenn die Daten beim ersten Rendern gebraucht werden, für Suchmaschinen
sichtbar sein sollen oder wenn Geheimnisse im Spiel sind (API-Schlüssel bleiben auf dem Server).
CORS entfällt, weil kein Browser beteiligt ist.

**Client Component:** wenn die Daten sich nach Interaktion ändern, häufig aktualisiert werden oder
optimistische Updates nötig sind – typisch für ein Kanban-Board.

Häufiger Fehler: Einen CORS-Fehler dadurch „lösen", dass man die Anfrage in eine Server Component
verschiebt. Das kann richtig sein, verschiebt aber oft nur das Problem, statt es zu verstehen.

### 28. Was bedeutet das Präfix `NEXT_PUBLIC_`?

Es macht eine Umgebungsvariable im Browser-Bundle verfügbar – der Wert wird beim **Build**
eingebacken. Alles damit Markierte ist öffentlich lesbar. Geheimnisse dürfen dort nie stehen.

Praktische Folge: Ändert sich der Wert, genügt kein Neustart – es braucht einen neuen Build.

---

## CI/CD & Qualitätssicherung

### 29. Was ist Continuous Integration, und was bringt sie konkret?

CI bedeutet, dass jede Änderung automatisch gebaut und geprüft wird, bevor sie in den
Hauptentwicklungszweig gelangt – bei jedem Push und jedem Pull Request.

Der konkrete Nutzen ist nicht „Automatisierung", sondern **schnelles Feedback am richtigen Ort**.
Ein Fehler, der im Pull Request auffällt, kostet Minuten. Derselbe Fehler in Produktion kostet
Stunden, oft unter Zeitdruck und mit Publikum.

In DevBoard laufen bei jedem PR zwei parallele Jobs: Backend (Lint, Unit-Tests, E2E-Tests gegen
einen echten PostgreSQL-Service-Container, Build) und Frontend (Lint, Build). Beide müssen grün
sein, sonst lässt sich der PR nicht mergen.

### 30. Warum `npm ci` und nicht `npm install` in der Pipeline?

`npm ci` löscht `node_modules`, installiert exakt die Versionen aus dem Lockfile und **schlägt
fehl**, wenn `package.json` und Lockfile auseinanderlaufen. `npm install` würde das Lockfile
stillschweigend anpassen.

In einer Pipeline ist das entscheidend: Ohne `ci` könnten zwei Läufe unterschiedliche
Abhängigkeiten installieren, und der Build wäre nicht mehr reproduzierbar. Nebeneffekt: `ci` ist
schneller, weil es keine Auflösung von Versionsbereichen vornimmt.

### 31. Reichen Git-Hooks nicht aus? Wozu dann noch eine Pipeline?

Nein. Ein Hook läuft auf dem Rechner der Entwicklerin, lässt sich mit `--no-verify` überspringen und
ist auf einem neuen Rechner erst nach `npm install` überhaupt vorhanden. **Ein Hook ist
Bequemlichkeit, keine Garantie.**

Die Pipeline läuft auf fremder Infrastruktur, für alle gleich und ohne Umgehungsmöglichkeit. Deshalb
die Arbeitsteilung: Hook macht das Schnelle (Formatierung, Sekunden), Pipeline das Gründliche
(Linting, Tests, Build). Ein Hook, der Minuten braucht, wird abgeschaltet – und dann schützt gar
nichts mehr.

### 32. Warum läuft der Linter in der CI ohne `--fix`?

Weil eine Pipeline Fehler **melden** und nicht heimlich beheben soll. Mit `--fix` würde sie den Code
im Durchlauf reparieren und grün werden, obwohl der committete Stand kaputt ist – die Änderung wäre
nirgends gespeichert.

Zusätzlich `--max-warnings 0`: Auch Warnungen machen den Lauf rot. Sonst sammeln sich Warnungen über
Monate an, bis sie niemand mehr liest – und dann geht auch die eine unter, die wichtig war.

### 33. Warum ein echter Datenbank-Container in der CI statt eines Mocks?

Weil Unit-Tests mit Attrappen bereits die Logik abdecken. Die E2E-Tests sollen genau das prüfen, was
Attrappen **nicht** können: dass Migrationen durchlaufen, das Schema stimmt, der Treiber
funktioniert und die echte Datenbankversion sich wie erwartet verhält.

Wichtiges Detail: Der Service-Container braucht einen **Healthcheck**. Ohne ihn starten die Tests,
bevor Postgres Verbindungen annimmt – dasselbe Startreihenfolge-Problem wie lokal bei Docker
Compose.

### 34. Was bringt Branch-Schutz, wenn es schon eine Pipeline gibt?

Erst der Branch-Schutz macht die Pipeline verbindlich. Ohne ihn kann man eine rote Pipeline
ignorieren und trotzdem mergen oder direkt auf `main` pushen.

Konfiguriert sind: Pflicht-Checks (`Backend`, `Frontend`), der Branch muss aktuell mit `main` sein,
kein Force-Push, kein Löschen.

**Bewusst nicht aktiv:** Pflicht-Reviews – GitHub lässt niemanden den eigenen Pull Request
freigeben, bei einer Einzelperson würde das jeden Merge blockieren. Sobald ein zweiter Mensch
mitarbeitet, wird es eingeschaltet.

### 35. Was wäre der nächste Schritt Richtung Continuous Delivery?

Nach grüner Pipeline automatisch auf **Staging** deployen, dort verifizieren, und Produktion per
manueller Freigabe – Continuous Delivery statt Continuous Deployment.

Dafür nötig: Multi-Stage-Dockerfiles, ein Registry-Push der gebauten Images, getrennte Umgebungen
mit eigener Konfiguration, Secrets aus dem Secret-Store, und eine Rollback-Strategie. Das ist
Sprint 6 in DevBoard.

---

## Passwörter & Registrierung

### 36. Warum ist SHA-256 als Passwort-Hash ungeeignet, obwohl es kryptografisch sicher ist?

Weil „sicher" hier zwei verschiedene Dinge bedeutet. SHA-256 ist als **Prüfsumme** sicher: Es ist
praktisch unmöglich, zwei Eingaben mit demselben Hash zu finden. Aber es wurde auf
**Geschwindigkeit** optimiert – gedacht für Prüfsummen über Dateien.

Genau das macht es als Passwort-Hash untauglich. Eine moderne Grafikkarte rechnet Milliarden
SHA-256-Hashes pro Sekunde. Bei einer geklauten Datenbank probiert ein Angreifer damit ganze
Wörterbücher in Stunden durch.

Ein Passwort-Hash braucht die gegenteiligen Eigenschaften:
- **absichtlich langsam** – bremst das Durchprobieren
- **speicherhungrig** – verhindert massives Parallelisieren auf GPUs. Rechenkerne hat eine
  Grafikkarte viele, Speicher pro Kern dagegen wenig.

Deshalb argon2 (oder bcrypt/scrypt) mit einstellbaren Kostenparametern.

### 37. Wo liegt der Salt bei argon2, und warum musst du ihn nicht selbst speichern?

Im Hash-String selbst:

```
$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
```

argon2 erzeugt für jeden Aufruf einen zufälligen Salt und legt ihn zusammen mit Verfahren, Version
und Parametern im Ergebnis ab. Deshalb liefert zweimaliges Hashen desselben Passworts zwei
**verschiedene** Hashes.

Ein Salt ist kein Geheimnis – er verhindert nur, dass identische Passwörter identische Hashes
ergeben. Ohne ihn sähe ein Angreifer in der geklauten Tabelle sofort, welche Nutzer dasselbe
Passwort haben, und könnte mit vorberechneten Tabellen (Rainbow Tables) arbeiten.

**Warnsignal im Code Review:** Wenn jemand den Salt von Hand erzeugt und in einer eigenen Spalte
speichert, hat er die Bibliothek nicht verstanden.

Dass auch die **Parameter** im Hash stehen, hat einen praktischen Nutzen: Man kann sie später
erhöhen, ohne bestehende Passwörter unbrauchbar zu machen – alte Hashes werden weiterhin mit ihren
eigenen Parametern geprüft.

### 38. Warum prüfst du vor dem Anlegen nicht, ob die E-Mail schon existiert?

Weil das eine **Race Condition** enthält:

```ts
const vorhanden = await prisma.user.findUnique({ where: { email } });
if (vorhanden) throw new ConflictException();
await prisma.user.create({ ... });          // <- Lücke dazwischen
```

Zwischen Prüfung und Schreiben liegt ein Zeitfenster. Zwei gleichzeitige Registrierungen mit
derselben Adresse können beide die Prüfung bestehen. Ohne Datenbank-Constraint entstünden zwei
Konten; mit Constraint fliegt trotzdem ein Fehler, den man dann doch behandeln muss.

Richtig ist: schreiben und den Fehler der **Datenbank** auswerten – Prisma meldet einen Verstoß
gegen den `UNIQUE`-Index mit dem Code `P2002`. Der Constraint ist die einzige Instanz, die diese
Frage atomar beantworten kann.

**Merksatz:** Die Prüfung im Code ist für die *Fehlermeldung* da, der Constraint für die *Garantie*.

Wichtig dabei: Nur der bekannte Fehlercode wird übersetzt. Ein Verbindungsabbruch darf nicht als
„E-Mail bereits vergeben" beim Nutzer ankommen.

### 39. Warum darf `verify()` niemals eine Exception nach oben durchlassen?

Ist ein gespeicherter Hash beschädigt, leer oder in einem fremden Format, wirft die Bibliothek. Für
den Aufrufer bedeutet das aber dasselbe wie „Passwort falsch" – also wird der Fehler abgefangen und
`false` zurückgegeben.

Der Grund ist eine Sicherheitsfrage: Schlüge die Exception durch, antwortete der Server bei solchen
Datensätzen mit **500** statt **401**. Ein Angreifer könnte aus dem abweichenden Statuscode ableiten,
dass dieses Konto existiert und in einem besonderen Zustand ist – **User Enumeration** über einen
Umweg. Dazu kommt: Ein Absturz ist immer auch ein Verfügbarkeitsproblem.

Verwandter Punkt: Der eigentliche Vergleich läuft in der Bibliothek in **konstanter Zeit**. Ein
naiver Vergleich mit `===` wäre angreifbar, weil er bei der ersten abweichenden Stelle abbricht und
damit messbar früher zurückkehrt.

### 40. Warum lädst du den Hash gar nicht erst, statt ihn nachträglich aus der Antwort zu entfernen?

Weil Nachträgliches vergessen wird. `select: { id, email, name, createdAt }` ist eine
**Positivliste**: Was nicht darin steht, verlässt die Datenbank nicht. Ein `delete user.passwordHash`
nach dem Laden ist dagegen eine Negativliste – kommt später ein Feld dazu (etwa ein
Zwei-Faktor-Secret), muss jemand daran denken, es ebenfalls zu entfernen.

Zusätzlich macht ein eigener Rückgabetyp ohne `passwordHash` daraus eine Compiler-Regel statt einer
Absichtserklärung: Wer den Hash herausgeben wollte, müsste den Typ ändern – und fällt damit im
Review auf.

Das Prinzip heißt **Secure by Default**: Der sichere Weg muss der bequemste sein.

### 41. Warum wird die E-Mail kleingeschrieben gespeichert, wo der `UNIQUE`-Index doch schon Dubletten verhindert?

Weil der Index **zeichengenau** vergleicht. `Max@example.com` und `max@example.com` sind für ihn
zwei verschiedene Werte – beide kämen durch, und es entstünden zwei Konten für dieselbe Person.

Der Domain-Teil einer E-Mail-Adresse unterscheidet technisch nicht zwischen Groß- und
Kleinschreibung; beim lokalen Teil erlaubt der Standard es theoretisch, praktisch behandelt ihn
kein relevanter Anbieter unterschiedlich.

Normalisiert wird **am Rand** der Anwendung, im Zod-Schema – zusammen mit der Validierung, bevor der
Wert irgendeine Schicht tiefer erreicht.

Alternative wäre der PostgreSQL-Typ `citext` oder ein funktionaler Index auf `lower(email)`. Beides
verlagert die Regel in die Datenbank; die Normalisierung im Schema ist sichtbarer und im Code
nachvollziehbar.

### 42. Warum hat das Passwort eine Obergrenze von 128 Zeichen?

Nicht aus Bequemlichkeit, sondern gegen **Denial-of-Service**. argon2 ist absichtlich rechen- und
speicherintensiv. Ohne Obergrenze könnte jemand Passwörter mit mehreren Megabyte schicken und den
Server mit wenigen Anfragen lahmlegen – der Schutzmechanismus würde zur Waffe.

Nach oben begrenzen ja, nach unten aber großzügig sein: mindestens 10 Zeichen, **keine**
Zeichenklassen-Pflicht. Das NIST empfiehlt seit 2017 (SP 800-63B) ausdrücklich Länge statt
Zeichenvielfalt – erzwungene Sonderzeichen führen zu vorhersagbaren Mustern wie `Passwort1!` und zu
aufgeschriebenen Passwörtern.

### 43. Der 409 bei einer vergebenen Adresse verrät etwas. Was – und warum machst du es trotzdem?

Er verrät, dass diese Adresse registriert ist: **User Enumeration**. Ein Angreifer kann damit
prüfen, wer bei einem Dienst Kunde ist – bei manchen Diensten allein schon eine heikle Information.

Vollständig vermeiden ließe sich das nur, indem die Registrierung **immer** 201 zurückgibt und der
eigentliche Hinweis per E-Mail zugestellt wird („Sie haben bereits ein Konto"). Das setzt einen
funktionierenden E-Mail-Versand voraus.

Ohne den wäre die Alternative für Nutzer unbrauchbar: Sie bekämen scheinbar ein Konto, könnten sich
aber nicht anmelden. Deshalb die bewusste Entscheidung für 409 – dokumentiert, nicht übersehen.

Der entscheidende Zusatz: **Beim Login bleibt die Meldung generisch.** Dort gibt es keinen
Usability-Grund, etwas preiszugeben – „E-Mail oder Passwort ist falsch", unabhängig davon, welches
von beidem nicht stimmte.

Genau diese Unterscheidung – wo eine Abwägung nötig ist und wo nicht – ist die eigentliche Antwort.

---

## JWT & Login

### 44. Ein JWT ist „lesbar, aber nicht fälschbar". Erklär beide Hälften.

**Lesbar:** Header und Payload sind lediglich **base64url-kodiert**, nicht verschlüsselt. Jeder mit
dem Token kann den Inhalt im Klartext anzeigen – `jwt.io` tut genau das, und zwei Zeilen Code
genügen dafür auch ohne Werkzeug.

**Nicht fälschbar:** Der dritte Teil ist eine Signatur über Header und Payload, berechnet mit einem
geheimen Schlüssel. Ändert jemand ein Zeichen im Payload, passt die Signatur nicht mehr – und ohne
das Geheimnis kann er keine neue berechnen.

Der Server muss den Token deshalb **nirgends speichern**. Er prüft nur die Signatur. Das ist der
Vorteil (zustandslos, gut skalierbar) und zugleich die Schwäche (nicht widerrufbar).

### 45. Warum darf im Payload kein Passwort-Hash stehen? Der Token ist doch signiert.

Weil Signatur **Integrität** garantiert, nicht **Vertraulichkeit**. Sie verhindert Veränderung,
nicht das Lesen. Alles im Payload ist für jeden sichtbar, der den Token in die Hände bekommt – und
das ist mindestens der Nutzer selbst, oft auch Proxys, Logs und Browser-Erweiterungen.

Faustregel: In den Payload gehört nur, was der Nutzer ohnehin über sich wissen darf. Nutzer-ID,
E-Mail, Rollen – ja. Passwort-Hash, interne Schlüssel, Kontostände – nein.

Wer Vertraulichkeit braucht, nimmt **JWE** (verschlüsselte Token) statt JWS. In der Praxis fast
immer unnötig: Man legt einfach nichts Geheimes hinein.

### 46. Warum prüfst du das Passwort auch dann, wenn es den Nutzer gar nicht gibt?

Weil sonst die **Antwortzeit** verrät, was die Fehlermeldung verschweigt.

Naiver Code kehrt bei unbekannter Adresse sofort zurück – nach wenigen Millisekunden. Existiert die
Adresse, läuft vorher argon2, das absichtlich 50–100 ms braucht. Diesen Unterschied kann ein
Angreifer messen und damit herausfinden, welche Adressen registriert sind. **User Enumeration über
einen Seitenkanal**, ganz ohne unterschiedliche Fehlermeldung.

Lösung: Auch ohne gefundenen Nutzer wird `verify` ausgeführt – gegen einen konstanten
Platzhalter-Hash. Beide Wege kosten dann etwa gleich viel Zeit.

Der Platzhalter ist kein Geheimnis: Es ist der Hash einer Zufallszeichenkette, die zu keinem Konto
gehört. Er darf im Quelltext stehen.

**Der entscheidende Satz:** Ein früher `return` ist hier kein Performance-Gewinn, sondern ein
Sicherheitsfehler.

### 47. Warum ist die Login-Meldung generisch, obwohl die Registrierung mit 409 zugibt, dass die Adresse existiert?

Weil die Abwägung unterschiedlich ausfällt.

Bei der **Registrierung** gibt es einen zwingenden Usability-Grund: Ohne Rückmeldung bekäme der
Nutzer scheinbar ein Konto und könnte sich nicht anmelden. Vermeiden ließe sich das nur mit
E-Mail-Versand – den gibt es (noch) nicht.

Beim **Login** gibt es keinen solchen Grund. „E-Mail oder Passwort ist falsch" ist genauso
hilfreich wie eine genauere Meldung, verrät aber nichts. Also wird nichts verraten.

Die eigentliche Antwort auf diese Frage ist nicht „generisch ist besser", sondern: **Man trifft die
Abwägung bewusst und dokumentiert sie** – statt beide Fälle gleich zu behandeln, ohne
darüber nachgedacht zu haben.

### 48. Was ist der `alg: none`-Angriff, und was verhindert ihn?

Im Header eines JWT steht das Signaturverfahren, etwa `{"alg":"HS256"}`. Frühe Bibliotheken haben
dieses Feld **gelesen und befolgt**. Ein Angreifer konnte es auf `{"alg":"none"}` setzen, die
Signatur weglassen und den Payload frei bestimmen – die Bibliothek prüfte dann pflichtgemäß gar
nichts.

Verwandte Variante: `HS256` statt `RS256` angeben. Die Bibliothek verwendet dann den *öffentlichen*
Schlüssel als symmetrisches Geheimnis – und der ist öffentlich.

**Schutz:** Das erwartete Verfahren wird serverseitig festgelegt, nicht dem Token entnommen. In
unserem Code:

```ts
signOptions:   { algorithm: 'HS256' },
verifyOptions: { algorithms: ['HS256'] },
```

Die Kernaussage dahinter, die weit über JWTs hinausgeht: **Nichts, was aus einer Anfrage stammt,
darf bestimmen, wie diese Anfrage geprüft wird.**

### 49. Warum nur 15 Minuten Lebensdauer? Und was kann der Server mit einem gestohlenen JWT nicht tun?

Er kann ihn **nicht widerrufen**. Der Server speichert ihn nirgends – er prüft nur die Signatur.
Ein gestohlener Token gilt bis zu seinem Ablauf, auch wenn der Nutzer sich abmeldet oder das
Passwort ändert.

Die kurze Lebensdauer ist deshalb der einzige Schutz: Sie begrenzt das Zeitfenster, in dem ein
gestohlener Token nützlich ist.

Die naheliegende Frage ist dann, warum man nicht doch eine Sperrliste führt – und die Antwort:
Damit gäbe man die Zustandslosigkeit auf, also genau den Grund für JWTs. Jede Anfrage bräuchte einen
Datenbankzugriff.

Der übliche Kompromiss ist ein **Refresh-Token**: kurzlebiger Access-Token für die Zustandslosigkeit,
langlebiger Refresh-Token, der serverseitig gespeichert und damit widerrufbar ist. Erst damit wirkt
ein Logout wirklich.

### 50. HS256 oder RS256 – wann brauchst du welches?

**HS256** ist symmetrisch: Ein Geheimnis signiert und prüft. Einfacher, schneller, weniger zu
verwalten. Passt, solange **derselbe Dienst** beides tut.

**RS256** ist asymmetrisch: Ein privater Schlüssel signiert, ein öffentlicher prüft. Nötig, sobald
weitere Dienste Token **prüfen** sollen, ohne selbst welche ausstellen zu dürfen – Microservices,
externe Partner, ein API-Gateway. Der öffentliche Schlüssel darf dann veröffentlicht werden (JWKS).

Faustregel: **Ein Dienst signiert und prüft → HS256. Mehrere prüfen, einer signiert → RS256.**

Bei HS256 gilt zusätzlich: Das Geheimnis muss mindestens so viel Entropie haben wie die Ausgabe des
Hashverfahrens – bei HS256 also 256 Bit. Deshalb die Mindestlänge von 32 Zeichen im Schema.

---

## Refresh-Token & Sitzungen

### 51. Warum reicht ein JWT allein nicht? Wozu ein zweiter Token?

Weil zwei Anforderungen im Widerspruch stehen:

- **Sicherheit** verlangt eine kurze Lebensdauer – ein JWT ist nicht widerrufbar, ein gestohlener
  gilt bis zum Ablauf.
- **Bequemlichkeit** verlangt eine lange – niemand will sich alle 15 Minuten neu anmelden.

Mit nur einem Token muss man sich für eine Seite entscheiden. Zwei Token lösen den Konflikt:

| | Access-Token | Refresh-Token |
|---|---|---|
| Lebensdauer | 15 Minuten | 30 Tage |
| Gespeichert? | nein (zustandslos) | ja, serverseitig |
| Widerrufbar? | nein | **ja** |
| Wo im Browser | JS-Variable | `httpOnly`-Cookie |
| Wie oft benutzt | bei jeder Anfrage | nur zum Erneuern |

Der Access-Token bleibt zustandslos und schnell, der Refresh-Token macht Sitzungen kontrollierbar.
Erst dadurch wirkt ein Logout überhaupt.

### 52. Was ist Token-Rotation, und was bringt sie – ein gestohlener Token funktioniert doch trotzdem einmal?

Rotation heißt: Bei jedem Erneuern wird der benutzte Token entwertet und ein neuer ausgestellt. Ein
Refresh-Token ist ein **Einmal-Token**.

Der Einwand stimmt: Rotation allein verhindert die erste Nutzung durch einen Dieb nicht. Ihr Zweck
ist ein anderer – sie macht Diebstahl **bemerkbar**.

Ohne Rotation könnte ein Angreifer einen gestohlenen Token 30 Tage lang unbemerkt neben dem
rechtmäßigen Nutzer verwenden. Mit Rotation können beide denselben Token nur einmal einlösen: Sobald
der zweite ihn vorlegt, ist er bereits verbraucht – und genau daran erkennt der Server, dass etwas
nicht stimmt.

**Rotation ist keine Vorbeugung, sondern eine Erkennung.** Die Reaktion darauf ist der nächste Punkt.

### 53. Warum fliegt bei einer Wiederverwendung auch der rechtmäßige Nutzer raus?

Weil der Server nicht unterscheiden kann, wer wer ist. Beide legen einen technisch einwandfreien
Token vor. Es gibt kein Merkmal, an dem sich Dieb und Bestohlener trennen ließen – IP-Adressen und
User-Agents sind fälschbar und wechseln bei echten Nutzern ständig.

Zwei mögliche Erklärungen für einen erneut vorgelegten, verbrauchten Token:
- ein abgebrochenes Erneuern (Netzwerkfehler, doppelter Klick), oder
- ein Diebstahl mit paralleler Nutzung.

Da beides gleich aussieht, wird der **schlimmere Fall angenommen**: Die gesamte Familie wird
widerrufen. Das Prinzip heißt **fail closed** – im Zweifel sperren, nicht durchlassen.

Der entscheidende Zusatz, der die Härte rechtfertigt: **Die Kosten sind ungleich verteilt.** Der
rechtmäßige Nutzer meldet sich neu an – lästig, aber machbar, er kennt sein Passwort. Der Angreifer
kann das nicht.

Die kundenfreundliche Alternative („nur den verdächtigen Token sperren") setzt voraus, dass man weiß,
welcher der verdächtige ist. Genau das weiß man nicht.

### 54. Warum SHA-256 für den Refresh-Token, aber argon2 für Passwörter? War SHA-256 nicht „zu schnell"?

Der Unterschied liegt nicht im Verfahren, sondern in der **Entropie der Eingabe**.

Ein Passwort ist von Menschen gewählt, kurz und erratbar – oft aus einer Menge, die ein Angreifer
durchprobieren kann. Deshalb muss das Verfahren bremsen: Jeder Versuch soll teuer sein.

Ein Refresh-Token besteht aus **32 Byte kryptografischem Zufall** – 2²⁵⁶ Möglichkeiten. Da gibt es
nichts zu erraten, egal wie schnell das Hashverfahren ist. Das Durchprobieren ist nicht „langsam",
sondern praktisch unmöglich.

Der Grund fürs Hashen ist hier ein anderer: Bei einem Datenbankleck wären gespeicherte Rohwerte
sofort verwendbare Sitzungen. Der Hash macht die Zeilen wertlos.

Und Geschwindigkeit ist hier sogar **erwünscht**, weil bei jedem Erneuern geprüft wird – argon2
würde jede Anfrage um 50–100 ms verzögern, ohne etwas zu verbessern.

**Merksatz:** Langsam hashen, wo die Eingabe erratbar ist. Schnell hashen, wo sie es nicht ist.

### 55. Was schützt den Refresh-Token gegen XSS – und was gegen CSRF?

Zwei verschiedene Angriffe, zwei verschiedene Antworten.

**Gegen XSS: `httpOnly`.** Ein so gesetztes Cookie ist für JavaScript unsichtbar – `document.cookie`
zeigt es nicht. Selbst wenn ein Angreifer Code einschleust, kann er den Token nicht auslesen. Läge
er in `localStorage`, wäre er sofort weg.

**Gegen CSRF: `SameSite=Lax` plus POST.** Cookies werden vom Browser automatisch mitgeschickt – auch
bei Anfragen, die eine fremde Seite ausgelöst hat. Genau das ist CSRF. `Lax` sorgt dafür, dass das
Cookie von fremden Seiten aus nur bei normaler Navigation mitgeht, nicht bei Hintergrund-POSTs. Da
der Refresh-Endpoint ein POST ist, greift der Schutz.

Zusätzlich begrenzt `Path=/auth` den Radius: Andere Anfragen tragen das Cookie gar nicht erst mit
sich – weniger Gelegenheiten, es in Logs oder Proxys zu verlieren.

Wichtig zu wissen: **`httpOnly` hilft nicht gegen CSRF und `SameSite` nicht gegen XSS.** Wer beide
Angriffe mit einer Maßnahme abdecken will, hat einen davon nicht verstanden.

### 56. Warum läuft die Rotation in einer Transaktion?

Weil zwei Schreibvorgänge zusammengehören: den alten Token entwerten und den neuen anlegen.

Ohne Transaktion könnte der erste gelingen und der zweite scheitern – etwa bei einem
Verbindungsabbruch. Der Nutzer hätte dann einen entwerteten Token im Cookie und keinen neuen: **ohne
eigenes Zutun ausgesperrt**, und beim nächsten Versuch würde sein Token sogar als Wiederverwendung
gewertet.

Eine Transaktion macht beide Schritte zu einer Einheit: entweder beide oder keiner. Das ist das
**A** in ACID – Atomarität.

### 57. Was ist nach dem Logout sofort ungültig, und was bleibt gültig?

**Sofort ungültig:** die gesamte Refresh-Token-Familie. Es lassen sich keine neuen Access-Token mehr
holen.

**Weiter gültig:** der bereits ausgestellte Access-Token – bis zu 15 Minuten. Er ist zustandslos, der
Server kennt ihn nicht und kann ihn deshalb nicht zurücknehmen.

Vertretbar ist das wegen der kurzen Lebensdauer: Das Zeitfenster ist klein und begrenzt.

Wer es dichter braucht (Banking, Gesundheitsdaten), führt eine **Sperrliste** – gibt damit aber die
Zustandslosigkeit auf, also genau den Grund für JWTs. Jede Anfrage bräuchte einen Datenbank- oder
Redis-Zugriff.

**Das ist die eigentliche Antwort:** Es gibt keine kostenlose Lösung, nur eine Abwägung zwischen
Zustandslosigkeit und sofortigem Widerruf – und man sollte sagen können, welche man warum gewählt
hat.

---

## Härtung & Betrieb

### 58. Wozu Rate Limiting, wenn argon2 doch schon bremst?

Weil beide unterschiedliche Größen begrenzen: **argon2 begrenzt die Kosten pro Versuch**
(~50–100 ms), **Rate Limiting die Anzahl der Versuche**.

argon2 allein schützt gegen das Durchprobieren eines geklauten Hashes – dort rechnet der Angreifer
auf eigener Hardware, und jeder Versuch kostet ihn. Es schützt aber nicht gegen jemanden, der
einfach viele Anfragen an den Login schickt: Dann rechnet **unser** Server, und zehn Versuche pro
Sekunde über Stunden reichen für eine Liste häufiger Passwörter.

Umgekehrt gilt dasselbe: Rate Limiting allein ohne teures Hashing wäre wertlos, sobald die Datenbank
einmal abfließt.

Erst beides zusammen macht Brute Force unwirtschaftlich. Verwandte Maßnahmen: kontobezogene Sperren
nach mehreren Fehlversuchen, CAPTCHA, und Abgleich gegen Listen bekannt gewordener Passwörter.

### 59. Warum läuft der Throttler vor dem Authentifizierungs-Guard?

Weil Guards in der Reihenfolge ihrer Registrierung laufen und die teure Arbeit möglichst spät kommen
soll.

Ein Angreifer, der den Server flutet, wird abgewiesen, **bevor** für jede seiner Anfragen eine
JWT-Signatur geprüft wird. Andersherum wäre die Signaturprüfung selbst der Angriffspunkt: Der
Server verbrennt Rechenzeit für Anfragen, die er ohnehin verwirft.

Allgemeine Regel: **billig prüfen vor teuer prüfen** – erst Format, dann Rate, dann Kryptografie,
dann Datenbank.

### 60. Warum stehen die strengen Anmelde-Grenzen fest im Code statt in der Konfiguration?

Zwei Gründe, ein technischer und ein inhaltlicher.

**Technisch:** Decorator-Argumente werden beim *Import* der Datei ausgewertet – zu einem Zeitpunkt,
an dem das ConfigModule die `.env` noch gar nicht gelesen hat. Ein Konfigurationswert wäre dort
schlicht `undefined`.

**Inhaltlich, und das ist der wichtigere Grund:** Das ist eine Sicherheitsentscheidung, keine
Betriebseinstellung. Was pro Umgebung lockerbar ist, wird irgendwann versehentlich in Produktion
gelockert – meist unter Zeitdruck, „nur mal kurz zum Testen".

Das *globale* Limit bleibt konfigurierbar, weil es von der erwarteten Last abhängt.

### 61. Wo liegt die Grenze eures Rate Limiters?

Der Zähler liegt im **Arbeitsspeicher**. Bei einer Instanz genügt das. Laufen mehrere hinter einem
Loadbalancer, hat jede ihren eigenen Zähler – bei fünf Instanzen wären aus „5 Versuche pro Minute"
faktisch 25.

Lösung wäre ein gemeinsamer Speicher, üblicherweise Redis. Das ist bewusst zurückgestellt und in
`10_SECURITY.md` vermerkt, weil DevBoard vorerst auf einer Instanz läuft.

Zweite Grenze: Gezählt wird pro IP-Adresse. Ein verteilter Angriff über viele Adressen umgeht das.
Dagegen helfen kontobezogene Sperren und Reputationsdienste.

### 62. Warum darf ein Stacktrace niemals nach außen?

Weil er Dateipfade, Verzeichnisstruktur, Bibliotheksversionen und Teile des Quelltexts verrät –
genau die Aufklärung, aus der ein Angreifer sein Bild vom System baut. Eine bekannte
Bibliotheksversion mit bekannter Lücke ist eine Einladung.

Die Regel lautet: **nach innen alles protokollieren, nach außen nur das Nötige.** Ein globaler
Exception-Filter unterscheidet dafür zwei Fälle:

- **`HttpException`** – eine absichtliche Aussage des Codes („E-Mail bereits vergeben"). Ihre
  Meldung ist für Nutzer gedacht und wird unverändert durchgereicht, samt der feldbezogenen
  Validierungsmeldungen.
- **Alles andere** – ein unerwarteter Fehler. Vollständig ins Log, nach außen nur „Interner
  Serverfehler".

### 63. Welche Security-Header setzt ihr, und wogegen?

Über Helmet, unter anderem:

| Header | Wogegen |
|---|---|
| `X-Content-Type-Options: nosniff` | Browser errät den Inhaltstyp – eine als Text ausgelieferte Datei könnte als Skript laufen |
| `X-Frame-Options` / `frame-ancestors` | Clickjacking durch Einbetten in eine fremde Seite |
| `Strict-Transport-Security` | Herabstufung auf HTTP; erzwingt HTTPS für weitere Aufrufe |
| `Content-Security-Policy` | XSS – bei einer reinen API von geringem Nutzen, schadet aber nicht |

Ebenso wichtig ist, was **entfällt**: `X-Powered-By: Express`. Das ist eine kostenlose Auskunft an
Angreifer darüber, wonach sie suchen sollen.

Nicht mehr gesetzt wird `X-XSS-Protection` – der Header ist veraltet und war in manchen Browsern
selbst eine Lücke.

---

## Mandanten & Datenmodell

### 64. Wann macht man aus einer n:m-Beziehung eine eigene Entität?

**Sobald die Verbindung selbst Attribute trägt.**

Eine reine n:m-Beziehung („Nutzer gehört zu Organisationen") lässt sich von Prisma implizit
abbilden – im Hintergrund entsteht eine Verbindungstabelle mit genau zwei Fremdschlüsseln. Sobald
aber etwas an der *Beziehung* hängt, reicht das nicht mehr.

Bei uns ist das die Rolle. Sie gehört nicht an den Nutzer – derselbe Mensch ist `OWNER` in seiner
eigenen Organisation und `MEMBER` in der eines Kunden. Sie gehört auch nicht an die Organisation –
die hat viele Mitglieder mit verschiedenen Rollen. Sie beschreibt ausschließlich das Verhältnis der
beiden zueinander. Also wird `Membership` ein eigenes Modell mit `id`, `role` und Zeitstempeln.

Weitere typische Attribute an einer Mitgliedschaft: Beitrittsdatum, wer eingeladen hat, Status
(eingeladen / aktiv / gesperrt). Die kämen alle an dieselbe Stelle.

Gegenprobe: „Task hat Labels" ohne weitere Angaben bleibt eine implizite n:m-Beziehung. „Task hat
Labels, und wer wann welches gesetzt hat" ist wieder eine eigene Entität.

### 65. Ihr habt `UNIQUE (organizationId, userId)` und *zusätzlich* einen Index auf `userId` allein. Ist das nicht redundant?

Nein – und das ist die häufigste Fehlannahme bei zusammengesetzten Indizes.

Ein zusammengesetzter Index ist ein B-Baum, sortiert **erst** nach der ersten Spalte, **dann** nach
der zweiten. Bildlich: ein Telefonbuch nach Nachname, dann Vorname. Damit findet man
„alle Müller" sofort und „Müller, Anna" auch. Aber „alle Annas" findet man nicht – die stehen über
das ganze Buch verstreut. Das ist die **Präfix-Regel** (*leftmost prefix*): Ein zusammengesetzter
Index hilft nur von links gelesen.

Konkret bei uns:

| Abfrage | Nutzt `(organizationId, userId)`? |
|---|---|
| „alle Mitglieder dieser Organisation" (`organizationId`) | ja – linkes Präfix |
| „ist dieser Nutzer Mitglied hier?" (beide) | ja – vollständig |
| „meine Organisationen" (`userId` allein) | **nein** |

Der letzte Fall ist `GET /organizations` – die Abfrage, die bei jedem Seitenaufruf läuft. Ohne den
zweiten Index müsste PostgreSQL dafür jedes Mal die ganze Tabelle lesen. Nachweisen lässt sich das
mit `EXPLAIN ANALYZE`: `Seq Scan` statt `Index Scan`.

Umgekehrt gilt: Hätten wir die Spalten als `(userId, organizationId)` herum definiert, bräuchten wir
den Extra-Index nicht – dafür aber einen auf `organizationId`. Die Reihenfolge in einem
zusammengesetzten Index ist eine Entscheidung, keine Formalie.

### 66. Warum ein Postgres-Enum für die Rolle und nicht einfach `TEXT`?

Weil die **Datenbank** die gültigen Werte erzwingt, nicht der Anwendungscode. `'Admn'` kommt gar
nicht erst hinein – auch nicht über ein Migrationsskript, einen anderen Dienst oder eine manuelle
Korrektur in `psql`. Zusätzlich erzeugt Prisma daraus einen TypeScript-Union-Typ, sodass der
Compiler jeden Tippfehler findet.

Der Preis ist Starrheit: Ein neuer Wert braucht eine Migration (`ALTER TYPE ... ADD VALUE`), und
Werte zu entfernen oder umzusortieren ist in PostgreSQL umständlich, weil bestehende Zeilen darauf
zeigen.

Die Abwägung lautet also **Sicherheit gegen Beweglichkeit**. Bei einer Rollenliste, die sich alle
paar Jahre ändert, gewinnt Sicherheit. Bei etwas Volatilem – frei definierbare Task-Status pro
Organisation – wäre `TEXT` mit Referenztabelle richtig, weil sich die Werte dann zur *Laufzeit*
ändern müssen, nicht zur Deploy-Zeit.

Dritte Möglichkeit: `TEXT` mit `CHECK`-Constraint. Erzwingt ebenfalls, ist leichter zu ändern,
liefert aber keinen generierten Typ.

**Fallstrick, den wir bewusst vermieden haben:** Die Enum-Werte sind absteigend nach Rechten
notiert, weil sie sich so leichter lesen. Der Code darf daraus **keine Ordnung ableiten** –
`rolle <= ADMIN` wäre ein Zahlenvergleich auf einem Enum und bricht still, sobald jemand einen Wert
dazwischenschiebt. Rechte werden über eine explizite Zuordnung geprüft, nicht über Sortierung.

### 67. Ihr habt `ON DELETE CASCADE` von der Mitgliedschaft zum Nutzer. Was passiert, wenn der letzte Eigentümer sein Konto löscht?

Die Organisation bleibt **ohne Eigentümer** zurück – niemand kann sie mehr verwalten, obwohl ihre
Daten weiterexistieren.

Das ist die richtige Antwort auf diese Frage, weil sie zeigt, wo die Grenze zwischen Datenbank- und
Anwendungslogik liegt. `ON DELETE CASCADE` ist korrekt: Eine Mitgliedschaft ohne Nutzer beschreibt
nichts mehr, sie *muss* verschwinden. Die Datenbank kann aber nicht wissen, dass eine Organisation
mindestens einen `OWNER` braucht – das ist eine fachliche Regel.

Solche Regeln gehören in die Anwendung, und zwar an *jede* Stelle, die sie verletzen könnte:

- Mitglied entfernen
- eigene Mitgliedschaft aufgeben („Organisation verlassen")
- Rolle des letzten Eigentümers herabstufen
- Konto löschen

Vier Wege, eine Regel. Deshalb liegt die Prüfung im Service und nicht im Controller – sonst
vergisst man den vierten Weg. Umgesetzt in Scheibe 2.3.

### 68. Warum muss das Anlegen einer Organisation eine Transaktion sein?

Weil es **zwei** Schreibvorgänge sind: die Organisation und die Mitgliedschaft des Erstellers als
`OWNER`. Gelingt der erste und scheitert der zweite – Verbindungsabbruch, Prozessende, Deadlock –,
bleibt eine Organisation **ohne Eigentümer** zurück. Niemand kann sie verwalten, niemand löschen,
und sie taucht in keiner Liste auf, weil Listen über Mitgliedschaften laufen. Eine Datenleiche.

Eine Transaktion macht aus beiden Schritten einen einzigen: entweder beide oder keiner. Das ist das
**A in ACID** – *Atomicity*.

**Der Zusatz, der die Antwort stark macht:** In unserem Code steht gar kein `$transaction`. Wir
benutzen einen *nested write*:

```ts
prisma.organization.create({
  data: { name, memberships: { create: { userId, role: Role.OWNER } } },
});
```

Prisma führt verschachtelte Schreibvorgänge **von sich aus** in einer Transaktion aus – das ist eine
Zusage der Schnittstelle, keine Bequemlichkeit. Ausgeschrieben wäre es dasselbe Ergebnis mit mehr
Code und einer zusätzlichen Runde zur Datenbank.

**Wann man `$transaction` trotzdem braucht:** sobald zwischen den Schritten *gelesen und
entschieden* wird („hat diese Organisation noch einen anderen `OWNER`?"), oder wenn Schritte
betroffen sind, die nicht über eine Relation zusammenhängen. Ein verschachtelter Schreibvorgang
kann nur, was der Beziehungsbaum hergibt.

### 69. Warum kommt die Nutzer-ID aus dem Token und nicht aus dem Anfragekörper?

Weil alles, was der Client schickt, eine **Behauptung** ist. Ein Körper wie
`{ "name": "…", "userId": "…" }` wäre bequem – und wer die eigene ID mitschicken darf, darf auch
eine fremde mitschicken und legt Organisationen im Namen anderer an.

Die ID aus dem Token ist dagegen **signiert** und stammt vom Server selbst. Eine Manipulation
zerstört die Signatur und der Guard weist die Anfrage mit `401` ab.

> **Merksatz:** Identität kommt nie aus dem Anfragekörper.

Dieselbe Klasse von Fehler in anderer Verkleidung: ein `role`-Feld im Registrierungsformular, ein
`isAdmin`-Flag im Profil-Update, eine `organizationId`, die nicht gegen die Mitgliedschaft geprüft
wird. Alle drei sind **Mass Assignment** – der Client schreibt Felder, die er nicht schreiben darf.
Unser Schutz dagegen ist das Zod-Schema: Es akzeptiert ausschließlich `name`, alles andere fällt
weg, bevor es den Service erreicht.

### 70. Warum kein `409` bei doppeltem Organisationsnamen, obwohl es einen bei doppelter E-Mail gibt?

Weil die Eindeutigkeit fachlich gar nicht gefordert ist. Zwei Kunden dürfen beide eine Organisation
„Marketing" haben – sie sehen sich ohnehin nie. Es gibt keinen Grund, das zu verbieten.

Wichtiger ist der zweite Teil: Ein globaler `UNIQUE`-Index wäre hier sogar **schädlich**. Er würde
antworten „diesen Namen gibt es schon" – und damit Rückschlüsse auf fremde Mandanten erlauben. Man
könnte Namen durchprobieren und herausfinden, welche Firmen das Produkt einsetzen. Dieselbe
Klasse von Informationsleck wie bei der User Enumeration über Fehlermeldungen.

Die E-Mail-Adresse ist der Gegenfall: Dort ist Eindeutigkeit *technisch notwendig*, weil sie die
Anmeldekennung ist. Zwei Konten mit derselben Adresse wären nicht auseinanderzuhalten.

### 71. Eure Liste zeigt bei einem Nutzer ohne Organisation `200` mit leerem Array. Warum nicht `404`?

Weil `404` heißt: *„Diese Ressource gibt es nicht."* Die Ressource ist hier aber die **Liste meiner
Organisationen**, und die existiert – sie ist nur leer. Ein leeres Regal ist kein fehlendes Regal.

Praktisch ist das auch für den Client wichtig: Bei `200 []` schreibt das Frontend eine Schleife über
null Einträge und zeigt einen Leerzustand. Bei `404` müsste es einen Fehlerpfad behandeln, der gar
kein Fehler ist – und der ließe sich nicht mehr von einem echten „Endpoint existiert nicht"
unterscheiden.

**Faustregel:** `404` für ein *Element*, das es nicht gibt (`GET /organizations/<fremde-id>`).
`200` mit leerer Liste für eine *Kollektion* ohne Treffer.

### 72. Ihr habt einen Test, der prüft, dass ein Nutzer etwas NICHT sieht. Warum reicht der Erfolgspfad nicht?

Weil der Erfolgspfad auch dann grün ist, wenn der Mandantenfilter komplett fehlt.

Der übliche Test lautet: „Ich lege eine Organisation an, ich rufe die Liste ab, sie ist da." Wenn im
Test nur *ein* Nutzer existiert, gehört ihm ohnehin alles. Ob der Service `where: { userId }` oder
`where: {}` schreibt, macht für dieses Ergebnis keinen Unterschied. Die Lücke fällt erst mit einem
**zweiten** Nutzer auf.

Deshalb gibt es in jeder Scheibe von Sprint 2 einen Test dieser Form: Nutzer A legt an, Nutzer B
fragt ab, und B darf nichts sehen.

**Und wir haben es nachgewiesen statt behauptet:** Der Filter wurde versuchsweise auf `where: {}`
geändert. Ergebnis – ein Unit-Test und drei E2E-Tests schlagen fehl. Das ist eine *Mutationsprobe*
von Hand: Ein grüner Test beweist nur, dass er läuft. Erst wenn er bei kaputtem Code rot wird, weiß
man, dass er etwas bewacht.

### 73. Warum legt ihr bei der Registrierung nicht automatisch eine Organisation an?

Das wäre bequem – der Nutzer landet nie in einem leeren Dashboard. Zwei Gründe sprechen dagegen.

**Fachlich:** Ab Scheibe 2.4 gibt es Einladungen. Wer per Einladung dazustößt, schleppt dann eine
automatisch erzeugte, nie benutzte Organisation mit sich herum – Datenmüll, der nie wieder
verschwindet.

**Strukturell:** Der `AuthService` müsste Organisationen kennen. Das ist eine Kopplung zwischen zwei
Modulen, die fachlich nichts miteinander zu tun haben. Authentifizierung beantwortet „wer bist
du?", Organisationen „wozu gehörst du?" – zwei getrennte Fragen.

„Nutzer ohne Organisation" ist ein **gültiger Zustand**, kein Fehler. Das Frontend bekommt dafür
einen ordentlichen Leerzustand.

Nebenbei ist es die Entscheidung, die sich leichter zurücknehmen lässt: Automatisches Anlegen
später einzubauen ist eine Zeile. Es wieder herauszunehmen, wenn schon Tausende leerer
Organisationen existieren, ist eine Datenmigration.
