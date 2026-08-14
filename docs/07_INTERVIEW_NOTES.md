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

### 74. Wann antwortet ihr mit 403 und wann mit 404? Beides heißt doch „du darfst nicht".

Nein – und der Unterschied ist eine Sicherheitsentscheidung, keine Geschmacksfrage.

| Fall | Antwort |
|---|---|
| kein Token, abgelaufen, gefälscht | `401` |
| gültiger Token, **kein Mitglied** der Organisation | `404` |
| Organisation existiert gar nicht | `404` – **wortgleich** |
| Mitglied, aber Rolle reicht nicht | `403` |

**Warum `404` und nicht `403` bei einer fremden Organisation:** Ein `403` würde bestätigen, dass es
eine Organisation mit dieser ID *gibt*. Damit ließen sich IDs durchprobieren und existierende
Mandanten kartieren. Für einen Außenstehenden existiert sie schlicht nicht – und genau das sagt
`404`.

**Der Teil, den die meisten vergessen:** Der Statuscode allein reicht nicht. Wenn die eine Antwort
„Organisation nicht gefunden" sagt und die andere „Sie sind kein Mitglied dieser Organisation", ist
der vorsichtige Statuscode wieder aufgehoben. Beide Fälle liefern bei uns **denselben Text**, und
ein E2E-Test schreibt das fest.

**Warum `403` trotzdem existiert:** Sobald die Mitgliedschaft steht, weiß der Anfragende ohnehin,
dass es die Organisation gibt – es ist nichts mehr zu verbergen. Dann ist eine konkrete Meldung
sogar hilfreich: „erfordert eine der Rollen: OWNER, ADMIN".

> **Faustregel:** Verrate mit dem Statuscode nichts, was der Anfragende nicht schon weiß.

### 75. Euer Guard läuft global. Wie stellt ihr sicher, dass er auch wirklich greift?

Zuerst der Grund für „global": Bei `@UseGuards` pro Route ist ein vergessener Guard ein **offener
Endpoint** – und niemand merkt es, weil alles funktioniert. Secure by default heißt, dass ein
Versehen zur sicheren Seite ausschlägt.

Möglich wird das durch ADR-008: Der Mandant steht **immer** als `:orgId` im Pfad. Damit gilt

```
Route hat :orgId  ⟺  Route betrifft einen Mandanten
```

Der Guard braucht also gar keine Markierung, an die man sich erinnern müsste – er prüft einfach, ob
dieser Parameter existiert. Vergessen kann man ihn nicht, denn ohne den Parameter funktioniert die
Route überhaupt nicht.

**Die Kehrseite, und das ist der eigentliche Inhalt der Frage:** Der Guard kann nicht vergessen
werden, aber er kann **ins Leere greifen**. Schriebe ein Controller `:organizationId` statt
`:orgId`, fände der Guard nichts, gäbe `true` zurück – und die Route wäre ungeschützt. Kein Fehler,
keine Warnung, nur ein offener Endpoint.

Geschlossen über eine geteilte Konstante:

```ts
export const ORG_PARAM = 'orgId';            // im Guard definiert
@Controller(`organizations/:${ORG_PARAM}`)   // im Controller benutzt
```

Beide lesen denselben Wert. Ein Tippfehler ist damit ein Compilerfehler statt eines stillen Lochs.

**Und nachgewiesen:** Die Prüfung wurde versuchsweise auf `return true` gesetzt – ein Unit-Test und
vier E2E-Tests schlagen fehl.

### 76. Warum lädt der Controller die Mitgliedschaft nicht selbst, wenn der Guard sie schon geprüft hat?

Der offensichtliche Grund ist die gesparte Datenbankabfrage. Der wichtigere ist ein anderer.

Lädt der Controller die Mitgliedschaft erneut, könnte er eine **andere** laden als die geprüfte –
ein anderer Parameter, eine andere Nutzer-ID, ein Tippfehler. Dann prüft der Guard das eine und der
Controller arbeitet mit dem anderen. Solche Fehler sind nicht theoretisch; sie entstehen, sobald
jemand später eine Route umbaut.

Der Guard hängt sein Ergebnis deshalb an die Anfrage, ein Parameter-Decorator reicht es herein:

```ts
@Get()
zeige(@AktuelleMitgliedschaft() m: AktiveMitgliedschaft) {
  return this.organizations.findeEine(m.organizationId, m.role);
}
```

**Die Konsequenz, die man aussprechen muss:** In diesen Controllern steht **nie** `@Param('orgId')`.
Beide tragen denselben Wert – aber nur der eine ist durch die Prüfung gegangen. Wer den
Route-Parameter nimmt, umgeht den Guard an der Stelle, an der es am wenigsten auffällt.

Merksatz: **Geprüft und benutzt muss dasselbe Objekt sein.**

### 77. Warum listet ihr erlaubte Rollen auf, statt eine Rangordnung zu prüfen?

`@Rollen(Role.OWNER, Role.ADMIN)` statt „mindestens ADMIN". Zwei Gründe.

**Technisch:** Ein Enum ist keine Zahl. `Role.OWNER <= Role.ADMIN` wäre ein Vergleich zweier
Zeichenketten, und alphabetisch ist `"OWNER" <= "ADMIN"` schlicht falsch – der Code wäre still
kaputt. Mit numerischen Werten ließe es sich erzwingen, aber dann bricht die Ordnung, sobald jemand
einen Wert dazwischenschiebt. Genau davor warnt schon der Kommentar am Enum im Schema.

**Fachlich, und das ist das stärkere Argument:** Rechte sind selten eine saubere Kette.

- Organisation löschen? Nur `OWNER` – obwohl `ADMIN` sonst mehr darf als `MEMBER`.
- Sich selbst aus der Organisation entfernen? Jeder, auch `MEMBER`.
- Den letzten `OWNER` herabstufen? Niemand, auch kein `OWNER`.

Eine Rangordnung suggeriert eine Ordnung, die es gar nicht gibt. Eine ausdrückliche Liste zwingt
dazu, bei jedem Endpoint zu **entscheiden**, statt eine Grenze zu verschieben – und ist im Review
leichter zu prüfen.

### 78. In eurem Guard steht ein `throw new Error(...)`, das einen 500er auslöst. Ist das nicht ein Fehler?

Nein, es ist Absicht. Der Fall tritt ein, wenn der Guard läuft, ohne dass ein angemeldeter Nutzer an
der Anfrage hängt – was nur passieren kann, wenn er im `AppModule` **vor** dem `AccessTokenGuard`
registriert wurde.

Das ist kein Nutzerfehler, sondern ein Programmierfehler. Und für die gilt eine andere Regel:

> **Nutzerfehler leise, Programmierfehler laut.**

Ein `return true` an dieser Stelle wäre ein offener Endpoint. Ein `throw new NotFoundException()`
wäre fast genauso schlimm – es sähe wie eine normale Ablehnung aus und würde den Konfigurationsfehler
verstecken, vermutlich für Monate. Ein `500` mit der Meldung „steht er vor dem AccessTokenGuard?"
fällt beim ersten Aufruf auf und benennt die Ursache.

Dass ein `500` nach außen nichts verrät, stellt der globale Exception-Filter sicher: Nach innen das
vollständige Log, nach außen nur „Interner Serverfehler".

### 79. Warum darf bei euch nur `OWNER` Rollen ändern, nicht auch `ADMIN`?

Weil es sonst kein `ADMIN` mehr wäre. Dürfte er Rollen vergeben, könnte er sich selbst zum `OWNER`
machen – und die Unterscheidung der beiden Rollen wäre wertlos. Jeder `ADMIN` wäre ein `OWNER`, der
es nur noch nicht ausgesprochen hat.

> **Merksatz:** Wer Rechte vergeben darf, hat sie.

Die Befugnis, Rollen zu ändern, ist deshalb in jedem System die höchste Befugnis und gehört an die
höchste Rolle. Dieselbe Überlegung greift an einer zweiten Stelle: Ein `ADMIN` darf keinen `OWNER`
**entfernen**. Sonst könnte er alle `OWNER` löschen und die Organisation übernehmen – wer den
Höherstehenden entfernen kann, steht höher.

Das ist die Klasse von Lücke, die man **Privilege Escalation** nennt, und sie entsteht fast nie
durch eine fehlende Prüfung. Sie entsteht durch eine Prüfung, die den *falschen* Umfang hat.

### 80. Wann gehört Autorisierung in einen Guard und wann in den Service?

Das Unterscheidungsmerkmal ist, ob die **Zielressource** eine Rolle spielt.

Ein Guard läuft, bevor der Controller existiert. Er kennt den Anfragenden und die Route – aber
nicht, welche Ressource betroffen ist und in welchem Zustand sie sich befindet.

| Regel | Wo | Warum |
|---|---|---|
| „nur `OWNER` darf Rollen ändern" | Guard (`@Rollen`) | hängt nur am Anfragenden |
| „sich selbst entfernen darf jeder" | Service | hängt daran, **wen** es trifft |
| „`ADMIN` darf keinen `OWNER` entfernen" | Service | hängt an der Rolle des **Ziels** |
| „der letzte `OWNER` darf nicht gehen" | Service | hängt am **Zustand** der Organisation |

Konkret bei `DELETE /members/:userId`: Ein `@Rollen(OWNER, ADMIN)` würde einen `MEMBER` abweisen,
bevor überhaupt klar ist, dass er nur sich selbst meint – „Organisation verlassen" wäre unmöglich.

> **Faustregel:** Ein Guard entscheidet über den **Zugang**, nicht über den **Einzelfall**.

### 81. Ihr habt eine Regel, die von vier Stellen aus verletzt werden kann. Wie geht ihr damit um?

Die Regel lautet: Die letzte `OWNER`-Mitgliedschaft darf nicht verschwinden. Verletzen kann man sie
durch Entfernen, Selbst-Verlassen, Herabstufen und Kontolöschung.

Die Antwort ist: **einmal implementieren, an der Stelle, durch die alle vier Wege führen.** Das ist
der Service. Am Endpoint müsste sie viermal stehen, und beim fünften Weg – der irgendwann dazukommt
– würde sie fehlen.

Das ist die praktische Bedeutung von „Geschäftslogik gehört in den Service, nicht in den
Controller". Nicht als Stilregel, sondern weil ein Controller pro Zugangsweg existiert und eine
fachliche Regel unabhängig vom Zugangsweg gilt.

**Statuscode `409 Conflict`**, nicht `403`: Der Anfragende *ist* berechtigt, die Anfrage ist formal
in Ordnung. Sie widerspricht nur dem aktuellen **Zustand** – mit einem zweiten `OWNER` wäre dieselbe
Anfrage erfolgreich. Genau dafür gibt es `409`.

### 82. Ihr habt eine Transaktion. Reicht die nicht gegen gleichzeitige Zugriffe?

Nein, und das ist der am häufigsten missverstandene Punkt bei Transaktionen.

Das Muster hier ist *lesen, entscheiden, schreiben*:

```
A: zählt OWNER → 2 → "einer darf weg" → entfernt sich
B: zählt OWNER → 2 → "einer darf weg" → entfernt sich
```

Beide laufen in einer Transaktion. Beide sind atomar. Danach hat die Organisation **null**
Eigentümer.

Der Grund ist die **Isolationsstufe**. PostgreSQL fährt standardmäßig `READ COMMITTED`: Jede
Transaktion sieht den Stand, der bei ihrem Beginn festgeschrieben war. Atomarität schützt gegen
**halbe** Schreibvorgänge, nicht gegen eine veraltete Entscheidungsgrundlage.

> **Merksatz:** Eine Transaktion macht Schreibvorgänge unteilbar. Sie macht Lesen und Schreiben
> nicht automatisch zu einer Einheit.

**Unsere Lösung:** eine pessimistische Sperre auf der Organisationszeile, `SELECT … FOR UPDATE`. Die
zweite Anfrage wartet und liest danach den aktualisierten Stand.

Gesperrt wird die **Organisation**, nicht die einzelne Mitgliedschaft – die Regel betrifft die
Organisation als Ganzes, also braucht es einen gemeinsamen Punkt, an dem sich konkurrierende
Änderungen begegnen. Zwei Sperren auf zwei verschiedenen Mitgliedschaften kämen sich nie in die
Quere.

**Alternativen:** `SERIALIZABLE` (PostgreSQL erkennt den Konflikt selbst, braucht aber
Wiederholungslogik) und optimistisches Sperren über eine Versionsspalte (richtig, wenn Konflikte
selten sind und eine Fehlermeldung genügt – beim Kanban-Board in Sprint 3 die passende Wahl; hier
nicht, weil ein verlorener Eigentümer sich nicht durch Neuladen beheben lässt).

### 83. Wie testet man eine Race Condition?

Nicht mit `Promise.all`. Das ist die Antwort, die ich in diesem Sprint auf die harte Tour gelernt
habe.

Der erste Versuch war ein E2E-Test: zwei `OWNER` verlassen gleichzeitig, danach muss einer übrig
sein. Grün. Sah nach einem Nachweis aus.

Dann die Gegenprobe: **Sperre entfernt, Test dreimal gelaufen – jedes Mal grün.** Der Test belegte
gar nichts. Zwei Anfragen über HTTP verschränken sich nur selten so eng, dass beide ihre Zählung
abschließen, bevor die andere schreibt. Jede durchläuft Guard, Controller und mehrere
Datenbankrunden; das Fenster für die Kollision ist winzig. Die Race Condition ist echt – über
diesen Weg nur nicht zuverlässig auslösbar.

`Promise.all` erzeugt keine Verschränkung, es erzeugt nur die **Möglichkeit** einer.

**Was tatsächlich funktioniert: den Konflikt erzwingen.** Eine eigene Transaktion nimmt die Sperre
auf der Organisationszeile und hält sie 500 ms. Nimmt der Endpoint dieselbe Sperre, *muss* er
warten – gemessen wird die Dauer seiner Antwort. Ohne `FOR UPDATE` antwortet er nach 60 ms, und der
Test wird rot.

Andere Wege, denselben Effekt zu erreichen: eine künstliche Pause an der kritischen Stelle im Code
(nur unter Testflagge), oder der Test direkt auf Datenbankebene mit zwei Verbindungen.

**Das eigentliche Learning ist allgemeiner:** Ein grüner Test kann gefährlicher sein als gar keiner.
Er erzeugt Vertrauen, das durch nichts gedeckt ist, und segnet spätere Änderungen ab, die den Schutz
entfernen. Ob ein Test etwas bewacht, sieht man ihm nicht an – man muss den Code kaputt machen und
nachschauen.

### 84. Wie speichert man einen Einladungs-Token?

Genau wie einen Refresh-Token: **nur als SHA-256-Hash**, nie im Klartext. Bei einem Datenbankleck
wären gespeicherte Rohwerte sofort verwendbare Zugänge zu fremden Organisationen.

Warum SHA-256 und nicht argon2: Der Token besteht aus 256 Bit Zufall (`randomBytes(32)`) und ist
kein erratbares Passwort. Gegen Durchprobieren muss nichts gebremst werden – ein Angreifer müsste
den Zufall raten, nicht ein schwaches Geheimnis. Bei Passwörtern ist es genau umgekehrt: Dort ist
Langsamkeit der ganze Zweck.

Zwei Punkte, die die Antwort abrunden:

- **Der Rohwert existiert genau einmal** – in der Antwort auf das Anlegen. Die Liste der offenen
  Einladungen enthält ihn nicht, und zwar erzwungen über zwei getrennte Rückgabetypen, nicht über
  Disziplin. Wer ihn nachträglich herausgeben wollte, müsste einen Typ ändern und fiele im Review
  auf.
- **Eingelöste Einladungen werden nicht gelöscht**, sondern mit `acceptedAt` markiert. Nur eine
  aufbewahrte, entwertete Zeile lässt sich von einer nie existierenden unterscheiden – dasselbe
  Argument wie bei der Wiederverwendungs-Erkennung der Refresh-Token.

### 85. Beim Einladen: Was, wenn unter der Adresse schon ein Konto existiert?

Die naheliegende Lösung wäre, das nachzuschlagen und den Nutzer direkt als Mitglied einzutragen –
bequemer, ein Klick weniger.

**Genau das darf man nicht tun.** Die beiden Wege hätten unterscheidbare Antworten („hinzugefügt"
vs. „eingeladen"), und damit hätte jeder `ADMIN` einen Dienst, mit dem er beliebige Adressen darauf
prüfen kann, ob sie bei DevBoard registriert sind. Das ist **User Enumeration**, dieselbe Klasse wie
unterschiedliche Login-Fehlermeldungen – nur an einer Stelle, an der kaum jemand danach sucht.

Bei uns entsteht deshalb **immer** eine Einladung, mit identischer Antwortform. Ein Test vergleicht
die Feldmengen beider Fälle; unterschiedliche Felder wären genauso verräterisch wie ein
unterschiedlicher Statuscode.

Der Preis ist ein zusätzlicher Klick für bestehende Nutzer. Das ist der Tausch, den man benennen
können muss: **Bequemlichkeit gegen Vertraulichkeit.**

### 86. Reicht der Token zum Annehmen einer Einladung, oder prüft ihr mehr?

Wir prüfen zusätzlich, dass die **E-Mail-Adresse des angemeldeten Kontos** mit der Adresse
übereinstimmt, an die eingeladen wurde. Sonst `403`.

Die Alternative kennt man von vielen Produkten: „Wer den Link hat, ist drin." Bequemer – aber dann
ist ein **weitergeleiteter Link ein Zugang**. Eine Einladung, die versehentlich in einem geteilten
Postfach, einem Ticket oder einem Chat landet, öffnet die Organisation für jeden, der mitliest.

Mit der Bindung an die Adresse braucht ein Angreifer **beides**: den Token *und* Zugriff auf das
Konto mit dieser Adresse. Der Preis: Wer sich unter einer anderen Adresse registriert hat als der,
an die eingeladen wurde, kommt nicht hinein und muss neu eingeladen werden.

Das ist eine Produktentscheidung, keine rein technische – und beide Varianten sind vertretbar.
Wichtig ist, sie **bewusst** zu treffen und den Unterschied benennen zu können.

### 87. Warum ist das Einlösen ein `POST` und kein `GET`, obwohl der Nutzer auf einen Link klickt?

Weil das Einlösen **etwas verändert** – es entsteht eine Mitgliedschaft – und `GET` laut Standard
nebenwirkungsfrei sein muss.

Das ist nicht bloß Formalismus. Ein `GET`-Endpoint, der eine Einladung einlöst, wird von Dingen
ausgelöst, die niemand als Nutzeraktion gemeint hat: Link-Vorschaudienste in Chat-Programmen,
Virenscanner, die Links im Postfach vorsorglich öffnen, der Prefetch des Browsers. Die Einladung
wäre eingelöst, bevor der Empfänger die Mail gelesen hat – und ein zweiter Klick liefe ins Leere.

Der Link in der E-Mail zeigt deshalb auf eine **Seite im Frontend**. Die liest den Token aus der URL
und ruft den `POST`-Endpoint auf, wenn der Nutzer bestätigt.

Zweiter Punkt: Der Token steht im **Anfragekörper**, nicht im Pfad. Ein Pfad landet in Server-Logs,
im Browserverlauf und im `Referer`-Header der nächsten Anfrage. Für ein Geheimnis alles falsche
Orte – derselbe Grund, aus dem Passwörter nicht in die URL gehören.

### 88. Der Guard hat die Organisation geprüft. Reicht das für `DELETE /organizations/:orgId/invitations/:id`?

Nein, und das ist der vergessene Mandantenfilter in seiner typischsten Form.

Der Guard prüft, dass der Anfragende in der Organisation aus dem **Pfad** berechtigt ist. Er prüft
**nicht**, dass die Einladungs-ID zu dieser Organisation gehört. Ein `OWNER` seiner eigenen
Organisation kommt durch – und könnte mit einer fremden Einladungs-ID deren Einladung zurückziehen.

```ts
// FALSCH
prisma.invitation.update({ where: { id: einladungId } })

// RICHTIG
prisma.invitation.updateMany({ where: { id: einladungId, organizationId } })
```

> **Merksatz:** Die ID im Pfad gehört nicht automatisch zu der Organisation im Pfad.

Das ist der Grund, warum ein Guard allein nie ausreicht. Er beantwortet „darfst du in diese
Organisation hinein?" – nicht „gehört *diese Ressource* dorthin?". Die zweite Frage beantwortet nur
die `WHERE`-Bedingung.

Nachgewiesen: Filter entfernt, der zugehörige E2E-Test schlägt fehl.

---

## Frontend & Mandanten

### 89. Ihr legt den Access-Token nicht in `localStorage`, die aktive Organisation aber schon. Ist das nicht inkonsequent?

Nein – und der Unterschied ist genau die Frage, die man sich bei *jedem* persistierten Wert stellen
sollte: **Wäre es schlimm, wenn ein fremdes Skript das liest?**

- Der **Access-Token** ist ein *Zugangsmittel*. Wer ihn hat, **ist** der Nutzer. Eine einzige
  XSS-Lücke – auch in einer fremden Bibliothek – genügt, und die Sitzung ist übernommen. Er liegt
  deshalb in einer JavaScript-Variablen und ist beim Neuladen weg (ADR-007).
- Die **Organisations-ID** ist eine *Anzeigepräferenz*. Wer sie hat, hat nichts. Sie steht ohnehin
  in jeder URL, und der Server prüft bei jeder Anfrage die Mitgliedschaft neu.

Die Faustregel „nichts in `localStorage`" ist zu grob. Richtig ist: **keine Geheimnisse und nichts,
worauf sich eine Berechtigung stützt.**

### 90. Ihr blendet Knöpfe je nach Rolle aus. Ist das eure Berechtigungsprüfung?

Nein, und diese Verwechslung ist eine der häufigsten Ursachen echter Lücken.

Einen Knopf auszublenden ist **Benutzerführung**. Es verhindert, dass jemand eine Aktion versucht,
die ohnehin scheitern würde. Es verhindert nicht, dass er sie ausführt – die Entwicklerwerkzeuge
brauchen dafür zehn Sekunden, und ein Angreifer würde die Oberfläche gar nicht erst benutzen,
sondern die API direkt ansprechen.

Der Schutz sitzt im Backend: `@Rollen()` am Endpoint, Mandantenfilter in jeder Abfrage. Selbst wenn
jemand den Knopf zurückholt, bekommt er `403` oder `404`.

> **Merksatz:** Frontend-Schutz ist Führung, Backend-Schutz ist Sicherheit. Wer beides verwechselt,
> baut eine Anwendung, die nur so lange sicher wirkt, wie niemand F12 drückt.

Dieselbe Trennung gilt für die Formularvalidierung: im Browser aus **Bequemlichkeit**, im Backend
aus **Sicherheit**. Beide prüfen dieselbe Regel – aus zwei verschiedenen Gründen.

### 91. Wann benutzt man `useSyncExternalStore` statt `useState` plus `useEffect`?

Sobald die Daten aus einer Quelle stammen, die **React nicht gehört**: `localStorage`,
`matchMedia`, `navigator.onLine`, ein WebSocket, ein Store außerhalb von React.

Der übliche Reflex sieht so aus:

```ts
const [wert, setWert] = useState(null);
useEffect(() => { setWert(localStorage.getItem(schluessel)); }, []);
```

Drei Probleme:

1. **Doppeltes Rendern.** Erst `null`, dann der echte Wert – sichtbar als Flackern. Der
   React-Compiler in Next 16 lehnt das mit `react-hooks/set-state-in-effect` ab.
2. **Änderungen von außen werden nicht bemerkt.** Schreibt ein anderer Tab, zeigt dieser weiter den
   alten Wert.
3. **Der Serverfall bleibt offen** – man merkt es erst, wenn `window is not defined` fliegt oder
   die Hydration warnt.

`useSyncExternalStore(abonniere, leseImBrowser, leseAufServer)` beantwortet alle drei: ein
Abonnement für Änderungen, ein Lesevorgang für den Browser, einer für den Server. Das dritte
Argument ist der eigentliche Punkt – es **zwingt** dazu, den Serverfall auszusprechen.

**Ein Detail, das man kennen muss:** `localStorage.setItem` löst im *eigenen* Tab **kein**
`storage`-Ereignis aus, nur in den anderen. Wer nur darauf hört, sieht die eigene Änderung nie – die
Abonnenten müssen zusätzlich von Hand benachrichtigt werden.

### 92. Erzähl mir von einem Fehler, den deine Tests nicht gefunden haben.

Nach Abschluss von Sprint 2 habe ich DevBoard zum ersten Mal seit Wochen tatsächlich **gestartet** –
155 Tests grün, CI grün. In der Netzwerkansicht stand bei einem einfachen Seitenneuladen:

```
POST /auth/refresh → 200 OK
POST /auth/refresh → 200 OK
```

Zwei Erneuerungen für einen Seitenaufruf. In der Datenbank: zwei **gleichzeitig gültige**
Refresh-Token in derselben Familie, zehn Millisekunden auseinander. Das Cookie hält nur einen – der
andere bleibt 30 Tage gültig, ohne Besitzer.

**Warum das gefährlich ist:** Wir rotieren Refresh-Token und erkennen Wiederverwendung – ein bereits
verbrauchter Token gilt als Diebstahlverdacht, dann wird die ganze Familie widerrufen. Laufen die
beiden Anfragen *versetzt* statt parallel, legt die zweite einen entwerteten Token vor, und der
Nutzer fliegt aus der Sitzung. Genau das ist mir in derselben Sitzung passiert: Nach ein paar
Neuladungen waren alle Token der Familie widerrufen.

**Ursache:** Das Frontend fasste gleichzeitige Aufrufe von `erneuere()` nicht zusammen. Sichtbar
gemacht hat es der StrictMode von Next, der Effekte doppelt ausführt – aber das war nur der
Auslöser. In Produktion genügen zwei parallele Abfragen, die beide in ein `401` laufen, oder zwei
offene Tabs.

**Behebung:** Single Flight – der erste Aufrufer startet die Anfrage, alle weiteren bekommen
dasselbe Promise und warten mit. Wichtig ist das Zurücksetzen im `finally`, sonst bliebe das alte
Promise für immer stehen und eine spätere echte Erneuerung fände nie statt.

**Was ich daraus mitnehme** – und das ist der eigentliche Inhalt der Antwort:

- **Eine grüne Testsuite ist kein Ersatz dafür, die Anwendung zu benutzen.** Der Fehler entstand aus
  dem Zusammenspiel von React-Lebenszyklus, Netzwerk-Zeitverhalten und einer serverseitigen
  Sicherheitsfunktion. Jeder Teil für sich war korrekt und getestet.
- **Ein Sicherheitsmechanismus kann zur Ausfallursache werden.** Wer Wiederverwendungs-Erkennung
  einbaut, übernimmt die Pflicht, jeden Weg zu prüfen, auf dem ein Token zweimal vorgelegt werden
  kann – auch die harmlosen.
- **Jede Operation, die einen Zustand rotiert, braucht Single Flight.**
- Der doppelte Effektaufruf im StrictMode ist **genau dafür da**, solche Annahmen aufzudecken. Der
  bequeme Weg wäre gewesen, ihn abzuschalten.

### 93. Was ist ein Open Redirect, und wo ist er euch begegnet?

Ein Endpoint, der den Nutzer auf eine Adresse weiterleitet, die **aus der Anfrage stammt** – ohne
sie zu prüfen.

Bei uns entsteht der Bedarf durch die Einladungen: Wer einen Einladungslink öffnet, ist meist nicht
angemeldet. Die Anmeldeseite muss sich merken, wohin es danach zurückgeht:

```
/login?weiter=/einladung%3Ftoken%3D9Xk2
```

Der naive Weg ist `router.replace(weiter)`. Damit bestimmt aber der **Absender des Links**, wohin
der Nutzer nach der Anmeldung geschickt wird:

```
/login?weiter=https://devb0ard-anmeldung.example/login
```

Der Nutzer prüft die Adresszeile, sieht eine **echte** DevBoard-Adresse, meldet sich an – und landet
auf einer nachgebauten Seite, die ihn erneut nach seinen Zugangsdaten fragt. Weil er den
Anmeldevorgang selbst begonnen hat, wirkt das plausibel.

**Der Punkt, der die Antwort stark macht:** Ein Open Redirect stiehlt selbst nichts. Er verleiht
einer Phishing-Seite die **Glaubwürdigkeit der echten Domain** – und genau die ist das, was Nutzer
prüfen sollen. Deshalb wird die Lücke oft unterschätzt.

**Unsere Prüfung:** Der Wert muss mit *genau einem* Schrägstrich beginnen.

```ts
if (!/^\/(?![/\])/.test(weiter)) return ersatz;
```

Was damit abgewiesen wird:

| Eingabe | Warum gefährlich |
|---|---|
| `https://boese.example` | absolute Adresse |
| `//boese.example` | **protokollrelativ** – der Browser ergänzt das Protokoll und landet auf einem fremden Host |
| `/\boese.example` | manche Browser behandeln `\` wie `/` |
| `javascript:…` | Skript statt Adresse |

Der zweite Fall ist der eigentliche Fallstrick: Eine Prüfung auf „beginnt mit einem Schrägstrich"
lässt ihn durch. Deshalb eine **Positivliste** statt einer Sperrliste – wer verbotene Muster
aufzählt, vergisst eines.

Nachgewiesen mit einer Gegenprobe: Prüfung entfernt → sechs Tests werden rot.

### 94. Warum zeigt ihr den Einladungs-Token in einem Kasten, den man wegklicken muss?

Weil er genau **einmal** existiert. Das Backend speichert nur den SHA-256-Hash; der Rohwert kommt
ausschließlich in der Antwort auf das Anlegen zurück und lässt sich nicht nachschlagen. Wer ihn
verliert, muss neu einladen.

Das ist keine Unbequemlichkeit, sondern die Folge einer Sicherheitsentscheidung: Bei einem
Datenbankleck wären gespeicherte Rohwerte sofort verwendbare Zugänge zu fremden Organisationen.

Für die Oberfläche heißt das zweierlei: Sie muss den Wert **deutlich zeigen** und **deutlich sagen**,
dass er danach weg ist. Ein Kasten, der nach drei Sekunden verschwindet, wäre hier eine Falle.
Deshalb muss der Nutzer ihn ausdrücklich schließen.

Genau so verhalten sich frisch erzeugte API-Schlüssel bei GitHub oder Stripe – dieselbe Ursache,
dieselbe Gestaltung. Das ist ein gutes Beispiel dafür, dass eine Entscheidung im Backend die
Gestaltung im Frontend **bestimmt**: Man kann das eine nicht sinnvoll entwerfen, ohne das andere zu
kennen.

Im Typsystem ist die Einmaligkeit ebenfalls abgebildet – `Einladung` (ohne Token) und
`AusgestellteEinladung` (mit) sind zwei Typen. Wer den Token aus der Liste lesen wollte, bekäme
einen Compilerfehler statt `undefined` zur Laufzeit.

### 95. Warum steht auf eurer Einladungsseite kein Anmeldeschutz?

Weil der typische Besucher dort **nicht angemeldet** ist – er hat gerade eine Einladung bekommen.

Unsere `<Geschuetzt>`-Komponente würde ihn auf `/login` werfen und dabei den Token aus der
Adresszeile verlieren. Nach der Anmeldung stünde er ratlos auf dem Dashboard, ohne zu wissen, was
mit seiner Einladung passiert ist.

Die Seite behandelt den abgemeldeten Fall deshalb selbst: Sie zeigt Links zu Anmeldung und
Registrierung, die das Ziel über `?weiter=` mitnehmen – geprüft, siehe Frage 93. Auch der Wechsel
*zwischen* den beiden Formularen trägt das Ziel weiter, sonst ginge es dort verloren.

Der Endpoint dahinter ist trotzdem geschützt: Eine Einladung anzunehmen setzt ein Konto voraus, und
der globale `AccessTokenGuard` antwortet ohne Token mit `401`. **Der Schutz sitzt im Backend, die
Führung im Frontend** – die Seite ohne Schutzmantel zu bauen, öffnet nichts.

---

## Sprint 3 – Projekte, Tasks & Kanban-Board

### 96. Ihr sortiert Kanban-Karten über eine `numeric`-Spalte. Warum nicht `float`?

Weil die Grenze bei Gleitkomma **unsichtbar** ist.

Das Verfahren heißt fractional indexing: Eine Karte bekommt den Mittelwert ihrer beiden künftigen
Nachbarn – zwischen 100 und 200 wird 150. Der Gewinn ist, dass eine Verschiebung **eine** Zeile
schreibt statt der ganzen Spalte.

Der Preis ist, dass die Zahl bei jedem Einfügen an derselben Stelle länger wird. Bei `float8` sind
nach etwa 50 Halbierungen die Mantissenbits verbraucht: Der Mittelwert zweier benachbarter Werte
*ist* dann einer der beiden Werte. Zwei Karten haben dieselbe Position, die Reihenfolge wird
stillschweigend zufällig – und niemand bekommt einen Fehler.

Bei `numeric(65,30)` ist die Grenze bekannt und nachrechenbar: Die *n*-te Halbierung an derselben
Stelle braucht *n* Nachkommastellen, ab 30 muss die Spalte neu verteilt werden. Damit ist sie
testbar, und genau das prüfen die Grenzfalltests der Sortierlogik.

**Der Kern der Antwort:** Beide Varianten haben eine Grenze. Die eine kann man behandeln, die andere
merkt man erst, wenn die Daten schon falsch sind.

### 97. Warum steht `organizationId` nicht auf `tasks`, obwohl das jede Abfrage einen Join spart?

Weil es eine **zweite Wahrheit** wäre.

Ein Task hängt am Projekt, das Projekt an der Organisation. Speicherten wir den Mandanten zusätzlich
am Task, gäbe es zwei Angaben über dieselbe Tatsache. Solange sie übereinstimmen, ist alles gut –
und wenn nicht, ist genau der Filter kaputt, dem die ganze Mandantentrennung vertraut. Ein Fehler
in einem Migrationsskript oder ein vergessenes Feld beim Kopieren eines Projekts genügt.

Gefiltert wird stattdessen über die Beziehung: `where: { id, project: { organizationId } }`. Prisma
übersetzt das in eine Bedingung **innerhalb** der Abfrage, nicht in eine Prüfung danach – die
Sprint-2-Regel bleibt gewahrt. Und ein Projekt wechselt nie die Organisation, die geerbte
Zugehörigkeit ist also stabil.

**Wann ich anders entscheiden würde:** Wenn die Abfrage über mehrere Ebenen ginge und der Join
messbar teuer wäre. Dann wäre die Denormalisierung vertretbar – aber mit einem Datenbank-Constraint
oder Trigger, der die Übereinstimmung erzwingt, nicht auf Zuruf.

### 98. Euer Index ist `(projectId, status, position)`. Was passiert, wenn `position` vorne steht?

Dann ist er für die Board-Abfrage **nutzlos**.

Die Abfrage lautet `WHERE projectId = ? AND status = ? ORDER BY position`. Ein zusammengesetzter
Index ist ein Baum, sortiert erst nach der ersten Spalte, dann nach der zweiten. Er hilft nur von
**links** gelesen: Steht `position` vorne, liegen die Zeilen eines Projekts über den ganzen Index
verstreut, und PostgreSQL liest die Tabelle vollständig.

In der gewählten Reihenfolge passiert das Gegenteil, und zwar zweimal: Der Index findet den Block
für Projekt + Spalte, **und** die Zeilen liegen darin bereits nach `position` sortiert. Der
Sortierschritt entfällt komplett – im Ausführungsplan verschwindet der `Sort`-Knoten.

Dasselbe Argument steht hinter dem zusätzlichen Index auf `memberships.userId` aus Sprint 2.

### 99. In Sprint 2 habt ihr pessimistisch gesperrt, beim Board optimistisch. Was unterscheidet die Fälle?

Ob der Konflikt **heilbar** ist.

Sprint 2, letzte `OWNER`-Mitgliedschaft: Treten zwei Eigentümer gleichzeitig aus und beide lesen
„es gibt noch einen anderen", bleibt die Organisation ohne Eigentümer zurück. Das lässt sich durch
Neuladen nicht reparieren – der Zustand ist bereits kaputt. Also muss die zweite Anfrage warten:
`SELECT … FOR UPDATE`.

Board: Zwei Nutzer verschieben dieselbe Karte. Die zweite Anfrage bekommt `409`, das Board lädt neu,
die Karte liegt woanders als gedacht. Ärgerlich, nicht kaputt – und **selten**, weil zwei Menschen
selten dieselbe Karte in derselben Sekunde anfassen. Sperren würde hier jeden Normalfall
verlangsamen, um einen Ausnahmefall zu vermeiden, der ohnehin harmlos ist.

**Die Faustregel:** Pessimistisch sperren, wenn ein Konflikt Daten zerstört. Optimistisch, wenn er
nur eine Wiederholung kostet.

### 100. `Task.assignee` zeigt auf `Membership`, nicht auf `User`. Vorteil und Preis?

Zugewiesen wird nicht „ein Mensch", sondern „jemand, der in dieser Organisation mitarbeitet" – und
das *ist* eine Mitgliedschaft. Das Modell bildet damit ab, was fachlich gemeint ist.

Der praktische Gewinn ist ein geschenkter: Wird jemand aus der Organisation entfernt, verschwindet
seine Mitgliedschaft, und `ON DELETE SET NULL` löst seine Zuweisungen von selbst. Bei einem
Fremdschlüssel auf `users` bliebe ein Ex-Kollege auf den Karten stehen, oder wir müssten es im Code
aufräumen – und würden dabei irgendwann einen Pfad vergessen. **Was die Datenbank erzwingt, kann
kein Codepfad umgehen.**

`SET NULL` und nicht `CASCADE`, weil die *Aufgabe* bleiben soll, nur unzugewiesen. `CASCADE` würde
beim Entfernen eines Mitglieds dessen Tasks mitlöschen.

Der Preis: Für den Anzeigenamen geht es einen Schritt weiter – `task.assignee.user.name`. Und „meine
Aufgaben über alle Organisationen" braucht einen Umweg über die Mitgliedschaften des Nutzers.

### 101. Warum ist `TaskStatus` ein Enum, obwohl euer eigener Kommentar bei `Role` davon abrät?

Der Kommentar sagt genauer: Ein Enum taugt, **solange die Werteliste fest ist**. Bei etwas Volatilem
wie frei definierbaren Status wäre Text mit Referenztabelle richtig.

Genau das ist der Punkt: In Sprint 3 sind die Spalten *nicht* konfigurierbar. Drei feste Spalten für
alle Projekte. Solange das gilt, ist das Enum der bessere Tausch – die Datenbank erzwingt die Werte,
ein Tippfehler kommt gar nicht erst hinein, und Prisma erzeugt daraus einen TypeScript-Union-Typ.

Werden Spalten später konfigurierbar, ersetzt eine Tabelle `BoardColumn` das Enum. Das steht so im
Backlog, mit dem Migrationsweg. **Der Widerspruch ist benannt statt übergangen** – und das ist der
Unterschied zwischen einer Abkürzung und einem Versehen.

### 102. Ihr habt `findFirst` statt `findUnique` benutzt. Warum ist das eine Sicherheitsentscheidung?

`findUnique` akzeptiert nur eindeutige Spalten. Die Projekt-ID ist eindeutig, `organizationId` nicht
– also lässt sich der Mandant dort gar nicht mit hineinschreiben. Der naheliegende Weg wäre dann:
laden, und danach `if (projekt.organizationId !== organizationId) throw`.

Damit sind die fremden Daten aber bereits **gelesen**. Solange nur verglichen wird, fällt das nicht
auf – bis jemand einen früheren Rückgabepfad einbaut, die Reihenfolge ändert oder beim Debuggen
loggt, was er geladen hat. Der Schutz hängt an einer Codezeile, die man verschieben kann.

`findFirst` erlaubt beliebige Filter. Damit lautet die Abfrage „das Projekt mit dieser ID, **sofern**
es zu dieser Organisation gehört" statt „das Projekt mit dieser ID, und dann sehen wir weiter".
Beim Schreiben gilt dasselbe: `update({ where: { id, organizationId } })` – Prisma erlaubt neben der
eindeutigen Bedingung zusätzliche Filter; passt der Mandant nicht, ändert sich nichts.

### 103. Warum antwortet euer `DELETE` beim zweiten Aufruf mit `204` statt `404`?

Weil `DELETE` idempotent sein soll: Der zweite Aufruf hinterlässt denselben Zustand wie der erste,
also gibt es nichts zu melden. Ohne das wird jeder Doppelklick, jeder Wiederholungsversuch nach
einem Timeout und jedes erneute Absenden zu einer Fehlermeldung, hinter der kein Problem steckt.

Interessant ist, was das im Code kostet: `updateMany` liefert `count: 0` für **zwei** fachlich
verschiedene Fälle – „gibt es nicht" und „war schon archiviert". Die Antwort ist einmal `404` und
einmal `204`. Deshalb steht dort eine zweite Abfrage, die die beiden unterscheidet. Sie läuft nur im
Ausnahmefall, nie im Normalbetrieb.

**Was ich daraus mitgenommen habe:** Eine Rückgabe wie „0 Zeilen geändert" beantwortet nicht die
Frage, die man eigentlich stellt. Sie fasst Fälle zusammen, die man auseinanderhalten muss.

### 104. Ihr archiviert, nennt den Endpoint aber `DELETE`. Ist das nicht irreführend?

Für den Client nicht: Das Projekt verschwindet aus der Liste, genau das hat er angefordert. Dass wir
stattdessen `archivedAt` setzen, ist eine Entscheidung *unserer* Seite – der Verlauf bleibt
erhalten, und Sprint 4 zieht seine Kennzahlen daraus.

Die Alternative wäre `POST /projects/:id/archive`. Ehrlicher im Namen, aber sie macht eine interne
Entscheidung nach außen sichtbar. Wenn wir später doch hart löschen wollten, müsste sich die API
ändern – bei `DELETE` nicht.

**Wo die Grenze liegt:** Sobald Archivieren und Löschen *beide* fachlich existieren und der Nutzer
zwischen ihnen wählen soll, brauchen sie zwei Endpoints. Solange es nur eine Bedeutung gibt, ist
`DELETE` die richtige.

### 105. Eure Mutationsprobe ließ zuerst *alle* Tests der Datei fehlschlagen. Warum war das ein schlechtes Zeichen?

Weil ein Schutz, der genau eine Stelle absichert, auch genau die Tests rot machen sollte, die diese
Stelle prüfen. Werden es plötzlich alle, ist die wahrscheinlichere Erklärung, dass die **Probe**
kaputt ist – nicht dass der Schutz überall wirkt.

Genau so war es: Aufgerufen wurde `npx jest` statt `npm run test:e2e`, und damit fehlte
`THROTTLE_LIMIT=0`. Das Rate Limiting wies schon die Registrierungen im Testaufbau ab, die Tests
scheiterten also vor der eigentlichen Prüfung. Mit der richtigen Umgebung wurde genau **ein** E2E-
und **ein** Unit-Test rot – der Nachweis, den wir wollten.

**Die Lehre:** Ein zu breites Rot ist genauso verdächtig wie ein ausbleibendes. Beide bedeuten, dass
der Test etwas anderes misst, als man glaubt.

### 106. Ihr habt `numeric` in der Datenbank gewählt – und trotzdem gerundet. Wie kam das?

Weil die Entscheidung in der Datenbank nichts über den Code sagt.

Die Spalte ist `numeric(65,30)`, ausdrücklich gegen den Präzisionsverlust von `float8`. Prisma
liefert solche Werte als `decimal.js`-Objekte – und deren Voreinstellung ist `precision: 20`, also
zwanzig **signifikante** Stellen. Die Rechnung rundete, bevor die Datenbank überhaupt gefragt wurde:

```ts
new Prisma.Decimal('0.000000000000000000000000000001').plus(1000)  // "1000"
```

Behoben mit einem eigenen Typ: `Prisma.Decimal.clone({ precision: 80 })`. `clone()` und nicht
`Decimal.set()`, weil ein `set` beim Laden der Datei jeden Decimal im ganzen Prozess umkonfiguriert
hätte – eine Fernwirkung, die niemand vermutet, der diese eine Datei nicht kennt.

**Was ich daraus gelernt habe:** Wer sich für Genauigkeit entscheidet, muss die *ganze Kette*
prüfen – Spalte, Treiber, Rechenbibliothek, Serialisierung. Eine einzelne richtige Entscheidung in
der Mitte nützt nichts, wenn eine Schicht davor oder danach rundet.

### 107. Warum gibt eure API die Sortierposition als String zurück?

Weil JSON nur einen Zahlentyp kennt, und der ist `float64`. Eine Position mit 30 Nachkommastellen
käme im Browser gerundet an – derselbe Präzisionsverlust wie oben, nur auf dem Transportweg.

Das Frontend rechnet ohnehin nicht damit: Beim Verschieben schickt es die IDs der beiden Nachbarn,
den Mittelwert bildet der Server. Der Wert ist für den Client eine **undurchsichtige Kennung**, und
als solche ist eine Zeichenkette die ehrliche Darstellung.

Dasselbe Muster kennt man von großen Ganzzahlen: Deshalb geben Twitter- und Stripe-APIs IDs als
Strings zurück, obwohl es Zahlen sind.

### 108. Warum nimmt die Zuweisung eine `userId`, wenn die Spalte auf `memberships` zeigt?

Zwei Gründe, ein interner und ein externer.

**Extern:** Das Frontend kennt aus `GET /organizations/:orgId/members` Nutzer-IDs. Müsste es
Mitgliedschafts-IDs schicken, wäre unsere Tabellenstruktur Teil der öffentlichen Schnittstelle –
und ein späterer Umbau eine brechende Änderung für jeden Client.

**Intern, und das ist der bessere Teil:** Der Service übersetzt, indem er die Mitgliedschaft über
`(organizationId, userId)` nachschlägt. Genau darin steckt die Regel „nur an Mitglieder derselben
Organisation" – nicht als zusätzliche Prüfung, sondern als der **einzige Weg**, überhaupt an eine
`assigneeId` zu kommen. Ist der Nutzer kein Mitglied, gibt es keine Zeile und damit keine Zuweisung.

Eine Prüfung kann man vergessen oder umgehen. Was es nicht gibt, kann man nicht versehentlich
durchlassen.

### 109. Euer PATCH ändert alles außer Status und Position. Warum diese Ausnahme?

Weil die beiden nur *gemeinsam* einen gültigen Zustand ergeben: Eine Spalte zu wechseln, ohne die
Position innerhalb der neuen Spalte zu bestimmen, ist kein sinnvoller Zwischenschritt.

Dafür gibt es einen eigenen Endpoint mit optimistischem Sperren. Wären sie zusätzlich im PATCH
erlaubt, gäbe es **zwei Wege zum Verschieben** – einen mit Konfliktbehandlung und einen ohne. Der
ohne würde irgendwann benutzt, spätestens von jemandem, der den anderen nicht kennt.

**Verallgemeinert:** Wenn zwei Felder nur zusammen gültig sind, brauchen sie einen gemeinsamen
Endpoint. Ein CRUD-PATCH, der jedes Feld einzeln erlaubt, ist bequem – und macht ungültige Zustände
erreichbar.

### 110. Bei Projekten archiviert ihr, bei Aufgaben löscht ihr wirklich. Ist das nicht inkonsistent?

Es ist unterschiedlich, weil die Dinge unterschiedlich sind.

Ein Projekt ist ein **Behälter**, dessen Verlauf interessant bleibt – Sprint 4 zieht daraus
Kennzahlen, und ein abgeschlossenes Projekt schlägt man nach. Eine einzelne Karte ist das nicht;
„falsch angelegt, weg damit" ist der häufigste Grund für ihr Löschen. Sie unsichtbar aufzubewahren,
füllt die Tabelle mit Zeilen, die niemand mehr sehen will – und jede künftige Abfrage müsste an den
Filter denken.

Sichtbar wird der Unterschied am zweiten Aufruf: beim Projekt `204`, bei der Aufgabe `404`. Auch das
ist kein Widerspruch, sondern folgt aus dem Zustand – das archivierte Projekt existiert noch, die
gelöschte Aufgabe nicht. Idempotenz nach HTTP-Spezifikation betrifft den *Zustand* auf dem Server,
nicht den Statuscode.

**Den Preis nenne ich offen:** Wer eine Aufgabe versehentlich löscht, bekommt sie nicht zurück.
Sobald der Aktivitäts-Feed steht, wäre ein „gelöscht"-Ereignis die passende Ergänzung.

### 111. Warum liefert `GET /tasks` eine flache Liste statt nach Spalten gruppierter Daten?

Weil die Spalten eine Eigenschaft des **Boards** sind, nicht der Daten.

`{ "TODO": [...], "DONE": [...] }` wäre bequemer für das Frontend und trotzdem falsch: Eine leere
Spalte fehlte im Ergebnis. Der Client müsste die vollständige Spaltenliste also ohnehin selbst
kennen – und hätte dann zwei Quellen dafür, von denen eine unvollständig ist.

Die flache Liste ist außerdem genau das, was der Index `(projectId, status, position)` hergibt:
sortiert nach Spalte, dann Position, ohne Sortierschritt in PostgreSQL. Serverseitig zu gruppieren
hieße, diese Reihenfolge wieder aufzubrechen, um sie im Client neu zusammenzusetzen.

### 112. Zwei Nutzer legen gleichzeitig eine Aufgabe in derselben Spalte an. Was passiert?

Beide können dieselbe letzte Position lesen und damit dieselbe neue Position bekommen. Die
Transaktion verhindert das nicht – dafür bräuchte es eine Sperre auf der ganzen Spalte, und die wäre
für diesen Fall zu teuer.

Vertretbar ist es, weil zwei gleiche Positionen **kein kaputter Zustand** sind, sondern nur eine
unbestimmte Reihenfolge zwischen genau diesen beiden Karten. Deshalb löst `orderBy` den Gleichstand
über `createdAt` und zuletzt über die `id` auf: Das Ergebnis ist **stabil**, auch wenn es nicht
vorhersagbar ist – das Board zeigt bei jedem Laden dasselbe.

Beim *Verschieben* ist die Lage anders: Dort geht es um einen Wert, den ein Nutzer bewusst gesetzt
hat, und dort steht das optimistische Sperren. **Nicht jede Wettlaufsituation muss verhindert
werden – man muss nur wissen, welche man in Kauf nimmt und warum.**

### 113. Warum schickt euer Client beim Verschieben die Nachbarn statt der Position?

Weil er die Position gar nicht berechnen *darf*.

Drei Gründe. Erstens müsste er dafür die Rechenregel kennen – damit wäre sie Teil der Schnittstelle,
und ein späterer Wechsel (etwa auf string-basierte Ränge wie LexoRank) bräche jeden Client.
Zweitens müsste er in JavaScript rechnen, also in `float64` – genau die Genauigkeit, die wir mit
`numeric` vermeiden. Drittens könnten zwei Clients dieselbe Position berechnen.

Die Nachbarn sind außerdem das, was der Client tatsächlich *weiß*: Der Nutzer hat die Karte zwischen
zwei anderen losgelassen. Alles Weitere ist Ableitung – und Ableitungen gehören dorthin, wo die
Daten liegen.

**Verallgemeinert:** Eine Schnittstelle sollte die Absicht übertragen, nicht das Ergebnis einer
Rechnung über fremde Daten.

### 114. Wie testet man einen Nebenläufigkeitsfehler, ohne auf Timing zu hoffen?

Beim optimistischen Sperren gar nicht – und das ist der Punkt.

In Sprint 2 musste der Konflikt erzwungen werden: Eine eigene Transaktion hielt die Zeilensperre
500 ms, und gemessen wurde, ob der Endpoint wartet. Ein früherer Versuch mit `Promise.all` war
grün geblieben, weil er keine Verschränkung *erzeugt*, sondern nur deren Möglichkeit.

Beim optimistischen Sperren hängt der Konflikt nicht am Zeitverhalten, sondern an der **Version**.
Zwei Anfragen mit derselben gelesenen Version sind genau das, was zwei gleichzeitig ladende Nutzer
erzeugen – egal, wann sie abschicken. Der Test stellt sie also nacheinander:

```
Nutzer 1: move(version: 0)  → 200, Version steht auf 1
Nutzer 2: move(version: 0)  → 409, nichts geschrieben
```

Der Test prüft zusätzlich, dass danach der Stand von Nutzer 1 unverändert dasteht. Ohne diese
Zusicherung wäre „409" nur eine Fehlermeldung, kein Beweis, dass nichts geschrieben wurde.

**Der Satz, den ich mir gemerkt habe:** Optimistisches Sperren macht einen Nebenläufigkeitsfehler
deterministisch reproduzierbar. Das ist ein Testbarkeitsvorteil, der bei der Wahl des Verfahrens
selten genannt wird.

### 115. Was passiert, wenn die Positionen zwischen zwei Karten „aufgebraucht" sind?

Dann verteilt der Server die Spalte neu – und der Client merkt nichts davon.

Erkannt wird es *vor* dem Schreiben: `position.decimalPlaces() > 30`. Die 30 ist keine Schätzung,
sondern steht so in der Migration (`numeric(65,30)`). Eine Stelle mehr, und PostgreSQL würde runden;
zwei Karten hätten dieselbe Position, und die Reihenfolge wäre ab da unbestimmt – ohne Fehler, ohne
Meldung.

Die Neuverteilung setzt 1000, 2000, 3000 … , liest die Nachbarn erneut und rechnet noch einmal. Der
zweite Durchgang kann nicht wieder anschlagen, weil danach ganze Zahlen mit großem Abstand
dastehen.

**Warum das nicht der Normalfall sein darf:** Sie schreibt N Zeilen. Wäre das jede Verschiebung,
hätte man die Nachteile der Integer-Nummerierung wieder eingekauft, die zu vermeiden der ganze
Zweck von `numeric` war. Sie ist der seltene Ausnahmepfad – geprüft von einem Test, der den Zustand
direkt herstellt, statt 30-mal zu verschieben.

### 116. Warum antwortet ihr mit `409` und nicht mit `412 Precondition Failed`?

Weil `412` zu den HTTP-Vorbedingungen gehört – `If-Match` mit einem ETag in der Kopfzeile. Wer `412`
schickt, sagt damit: „Ihre Vorbedingung im Protokoll ist nicht erfüllt."

Wir tragen die Version im **Körper**, als fachliches Feld. Dann ist der Konflikt ein fachlicher, und
`409 Conflict` ist die ehrlichere Antwort: „Der Zustand der Ressource verträgt sich nicht mit Ihrer
Anfrage."

Man *könnte* es mit ETags bauen, und bei einer öffentlichen API mit Zwischenspeichern wäre das
sogar der bessere Weg – Proxies und Browser verstehen `If-Match`. Für eine interne API ohne
Zwischenspeicher wäre es Aufwand ohne Gegenwert.

### 117. Warum liegt die Sortierarithmetik in einer eigenen Datei?

Weil sie der fachlich heikelste Teil des Sprints ist und zugleich der am billigsten prüfbare –
sobald sie nichts anderes mehr braucht.

`positionen.ts` kennt weder Prisma-Abfragen noch NestJS: rein Ein- und Ausgabe. Deshalb prüft
`positionen.spec.ts` die Grenzfälle ohne Datenbank, ohne Testmodul, ohne HTTP – darunter die
40-fache Halbierung und die Frage, ob nach einer Neuverteilung wieder Platz ist. Im Service-Test
hätte jeder dieser Fälle eine Prisma-Attrappe gebraucht.

**Die allgemeine Regel:** Was rein rechnend ist, gehört von dem getrennt, was Ein- und Ausgabe
macht. Nicht wegen der Architekturlehre, sondern weil die Testkosten um eine Größenordnung
auseinanderliegen.

### 118. Ihr blendet Schaltflächen je nach Rolle aus. Ist das eure Autorisierung?

Nein – und die Unterscheidung ist mir wichtig.

Ein `MEMBER` sieht das Formular „Neues Projekt" nicht. Das ist **Höflichkeit**: Die Oberfläche
bietet nichts an, was ohnehin mit `403` scheitern würde. Wer den Endpoint direkt aufruft – mit
`curl`, aus der Konsole, mit einem manipulierten Bundle –, bekommt trotzdem `403`, weil die
Entscheidung im Backend sitzt.

Der Satz dazu: **Das Frontend blendet aus, was ohnehin scheitern würde. Es entscheidet nicht, was
erlaubt ist.** Jede Rollenlogik im Client ist eine Kopie – und Kopien laufen auseinander.

Ein Frontend-Test hält das trotzdem fest: nicht als Sicherheitsnachweis, sondern weil eine
Schaltfläche, die immer scheitert, ein Bedienfehler ist.

### 119. Warum steht die Organisations-ID im Query-Schlüssel des Frontends?

Weil TanStack Query die Daten unter diesem Schlüssel im Speicher hält.

Wäre er nur `['projects']`, sähe ein Nutzer nach dem Umschalten der aktiven Organisation für einen
Moment die Projekte der **vorigen** – aus dem Zwischenspeicher, ohne dass eine Anfrage läuft. Das
wäre kein Sicherheitsloch (die Daten hatte er legitim), aber ein sichtbarer Fehler an genau der
Stelle, an der Mandantentrennung wichtig ist. Und wer ihn sieht, glaubt an ein echtes Leck.

Der Schlüssel ist zusätzlich mit `organisationKey(orgId)` verschachtelt. TanStack Query vergleicht
Schlüssel von **links**, also entwertet ein `invalidateQueries` auf der Organisation auch ihre
Projekte – dieselbe Präfix-Regel wie bei einem zusammengesetzten Datenbankindex.

Der Filter „auch archivierte" steckt ebenfalls im Schlüssel, nicht nur in der URL: Sonst hielte
TanStack Query beide Varianten für dieselbe Abfrage und lieferte nach dem Umschalten den alten
Stand.

### 120. Warum habt ihr das Frontend nach den Tests trotzdem noch von Hand durchgeklickt?

Weil der teuerste Fehler des Projekts von **155 grünen Tests** nicht bemerkt wurde: die doppelte
Token-Erneuerung aus Sprint 1. Jeder Teil war für sich korrekt und getestet; der Fehler entstand aus
dem Zusammenspiel von React-Lebenszyklus, Netzwerk-Zeitverhalten und einer serverseitigen
Sicherheitsfunktion. Gefunden wurde er beim Starten der Anwendung und einem Blick in die
Netzwerkansicht.

Seitdem gilt hier: gestartet wird immer. Diesmal geprüft – Organisation anlegen, Projekt anlegen,
Detailseite, ein fremdes Projekt in der eigenen Organisation (`404` mit erklärendem Text statt
Störungsmeldung), archivieren mit Rückfrage, Umschalter für archivierte Projekte. Dazu die
Netzwerkansicht: Der Umschalter löst tatsächlich eine neue Anfrage aus und filtert nicht nur im
Browser.

**Eine grüne Testsuite ist kein Ersatz dafür, die Anwendung zu benutzen.**

### 121. Erklären Sie Ihr optimistisches Update – und was passiert, wenn der Server ablehnt?

Optimistisch heißt: Die Anzeige ändert sich **sofort**, die Anfrage läuft daneben. Drei Rückrufe von
TanStack Query, jeder mit einer eigenen Aufgabe:

- `onMutate` – laufende Abfragen **abbrechen**, aktuellen Stand sichern, Vorschau schreiben
- `onError` – gesicherten Stand zurückschreiben (**Rollback**)
- `onSettled` – **immer** entwerten, damit die echten Positionen und die neue Version kommen

Das `cancelQueries` vergisst man am leichtesten: Läuft gerade eine Board-Abfrage, käme ihre Antwort
*nach* unserer Vorschau an und überschriebe sie mit dem alten Stand. Die Karte spränge sichtbar
zurück – und der Fehler wäre nur unter Last reproduzierbar.

Lehnt der Server ab, setzt das Rollback die Anzeige zurück, und `onSettled` lädt den echten Stand
nach. Bei `409` bekommt der Nutzer keine Fehlermeldung, sondern eine Erklärung: „Diese Karte wurde
inzwischen von jemand anderem verschoben." Es ist ja alles richtig gelaufen – nur nicht so, wie er
es sich gedacht hat.

**Warum nicht überall optimistisch?** Es lohnt sich, wenn die Handlung *häufig*, der Fehlschlag
*selten* und die Verzögerung *spürbar* ist. Beim Anlegen eines Projekts trifft nichts davon zu, und
die ID vergibt ohnehin der Server.

### 122. Die Vorschau erfindet keine Position. Warum nicht, und wie kann das gehen?

Weil die Position der **Server** berechnet – eine ausgedachte wäre eine Behauptung über etwas, das
der Client nicht weiß, und beim nächsten Laden stünde ein anderer Wert da.

Möglich ist das, weil die Anzeige die Reihenfolge aus der **Liste** liest und nie aus dem
Positionswert. Die Vorschau sortiert die Karte also an der richtigen Stelle *ein* und lässt
`position` und `version` unangetastet. Genau deshalb darf `position` für das Frontend eine
undurchsichtige Kennung sein.

Ein Test hält das ausdrücklich fest – sonst hätte jemand später „hilfsweise" einen Wert eingesetzt.

### 123. Wie testet man Drag & Drop?

Möglichst wenig davon.

Ziehbewegungen über Testereignisse nachzustellen ist aufwendig und brüchig – die Bibliothek
dazwischen ändert ihr Verhalten von Version zu Version. Was dabei *gerechnet* wird, ist dagegen
reine Listenarithmetik. Die steht deshalb in `board-logik.ts`, ohne React, ohne dnd-kit, ohne
Netzwerk, und wird dort mit allen Grenzfällen geprüft: Ränder, leere Spalten, Spaltenwechsel,
ein zu großer Zielindex.

Der wichtigste dieser Tests betrifft einen Fehler, der **nur in eine Richtung kippt**: Zählt die
bewegte Karte sich selbst mit, ist das Verschieben nach *unten* um eine Stelle daneben – nach oben
dagegen richtig. Das übersieht man beim Ausprobieren, weil man zuerst nach oben schiebt.

Dieselbe Trennung wie bei `positionen.ts` im Backend: Was rein rechnend ist, wird vom Ein- und
Ausgabe-Teil getrennt – nicht wegen der Architekturlehre, sondern weil die Testkosten um eine
Größenordnung auseinanderliegen.

Was Tests nicht abdecken, wurde von Hand geprüft: eine Karte per Tastatur verschoben und in der
Netzwerkansicht nachgesehen, dass `PATCH …/move` mit `200` antwortet und die neue Position
zurückgibt.

### 124. Warum ist Ihr Board mit der Tastatur bedienbar?

Weil Drag & Drop sonst **nur mit der Maus** bedienbar wäre – und ein Kanban-Board, dessen einzige
Kernfunktion eine Zeigerbewegung ist, schließt jeden aus, der keine benutzt.

dnd-kit bringt dafür einen eigenen Sensor mit: Leertaste zum Aufnehmen, Pfeiltasten zum Bewegen,
Leertaste zum Ablegen. Er meldet jeden Schritt zusätzlich über eine Live-Region, damit ein
Screenreader ansagen kann, wo die Karte gelandet ist.

Dazu kommt eine Kleinigkeit mit großer Wirkung: Der Zeiger-Sensor zieht erst nach **5 Pixeln**. Ohne
diese Bedingung beginnt schon ein einfacher Klick eine Ziehbewegung, und der Löschen-Knopf auf der
Karte reagiert nicht mehr zuverlässig.

Aus demselben Grund sitzen die Ziehgriffe am Titel und nicht auf der ganzen Karte – sonst wäre der
Knopf Teil der Ziehfläche.

## Sprint 4 – Dashboard und Aktivitäts-Feed

### 125. Ihr `tasks`-Modell speichert bewusst keine `organizationId`, `activities` schon. Widersprechen Sie sich?

Nein – die Regel hatte von Anfang an eine Bedingung, und die ist hier nicht erfüllt.

Bei `tasks` lautet sie: Der Mandant wird über `project.organizationId` **geerbt**, weil ein Projekt
seine Organisation nie wechselt. Die Spalte zu duplizieren wäre eine zweite Wahrheit ohne Gegenwert.

Bei `activities` fällt beides weg:

- **Es gibt nichts zu erben.** Nicht jedes Ereignis hat ein Projekt. Sprint 5 speist
  GitHub-Webhooks in denselben Feed, eine Einladung hängt an der Organisation. Der Mandant wäre für
  manche Zeilen über `projects` erreichbar und für andere überhaupt nicht – der Filter hätte je
  nach Ereignistyp eine andere Form.
- **Es gibt einen Gegenwert.** PostgreSQL kann keinen Index über Spalten *zweier* Tabellen anlegen.
  Ohne eigene Spalte müsste jede Feed-Seite erst verbinden und danach sortieren, bei der einzigen
  Tabelle im Schema, die unbegrenzt wächst.

Der Preis heißt trotzdem Redundanz, und ich würde ihn nicht überall zahlen. Was ihn hier vertretbar
macht, ist die **Unveränderlichkeit**: Redundanz ist dann gefährlich, wenn zwei Kopien
*auseinanderlaufen* können. Ein Eintrag wird einmal geschrieben und danach nie angefasst – keine
der beiden Angaben kann sich noch bewegen.

> Die eigentliche Antwort auf diese Frage ist nicht die Ausnahme, sondern dass „keine zweite
> Wahrheit" nie die vollständige Regel war. Sie lautet: *nicht duplizieren, solange sich der Wert
> ändern kann und die Duplikation nichts einbringt.*

### 126. Sie haben eine Tabelle für Ereignisse. Ist das Event Sourcing?

Nein, und der Unterschied ist keine Wortklauberei – es ist die Frage, wo die Wahrheit liegt.

Bei mir ist `activities` ein **Protokoll neben** den Fachdaten. Die Wahrheit über eine Aufgabe steht
in `tasks`; ich könnte die Aktivitätstabelle löschen und die Anwendung liefe weiter, nur ohne Feed.

Bei Event Sourcing wären die Ereignisse die **einzige** Wahrheit, und `tasks` wäre eine daraus
berechnete Ansicht, die man jederzeit verwerfen und neu aufbauen kann. Jede Leseabfrage kostet dann
entweder eine Wiedergabe der Ereignisse oder eine zweite, nachgeführte Datenhaltung, die konsistent
bleiben muss.

Was Event Sourcing dafür löst: „Wie sah der Zustand letzten Dienstag aus" und „wie kam es dazu".
Das kann mein Entwurf nicht – ich weiß, *dass* eine Karte verschoben wurde, aber ich kann den
Gesamtzustand von vorletzter Woche nicht rekonstruieren.

Ich habe keine dieser beiden Fragen. Ich will einen Feed anzeigen. Den Aufwand zu tragen, ohne den
Nutzen zu brauchen, wäre die teuerste Art, ein Schlagwort zu belegen – deshalb heißt das Modell
`Activity` und nicht `ActivityEvent`, wie ursprünglich geplant. Der Name hätte eine Architektur
behauptet, die nicht dahintersteht.

### 127. Warum steht `id` in einem Index, der nach `createdAt` sortiert? Der Zeitstempel ist doch praktisch eindeutig.

Er ist es gerade nicht, und das ist messbar statt geschätzt.

Prisma bildet `DateTime` auf **`timestamp(3)`** ab – Millisekunden. PostgreSQL könnte Mikrosekunden
(`timestamp(6)`), aber JavaScript-`Date` kann sie nicht darstellen, also rundet der Treiber ab. Zwei
Ereignisse, die in **einer** Transaktion entstehen, bekommen damit regelmäßig denselben Zeitstempel
– das ist kein Ausnahmefall, sondern der Normalfall.

Nach `createdAt` allein ist die Ordnung dann nicht **total**: Zwischen zwei gleichen Werten
entscheidet PostgreSQL, in welcher Reihenfolge es liefert, und das darf sich von Abfrage zu Abfrage
unterscheiden. Genau daran zerbricht die Cursor-Paginierung. Ein Cursor bedeutet „zeig mir alles
nach dieser Stelle". Ist die Stelle nur ein Zeitstempel, ist sie keine Stelle, sondern eine Gruppe –
je nach Ausgang zeigt Seite 2 einen Eintrag doppelt oder überspringt einen.

Mit `id` als zweitem Kriterium ist die Ordnung total, und der Cursor bezeichnet **einen** Eintrag.

Das ist dieselbe Falle wie bei zwei gleichen `position`-Werten auf dem Board – und dieselbe Lehre
wie aus dem `Date.now()`-Fehler in Sprint 3: **Sortierung und Testisolierung dürfen nicht auf der
Auflösung einer Uhr beruhen.**

### 128. Sie haben zwei Indizes, beide enden auf `createdAt, id`. Warum bedient der erste nicht auch den zweiten Fall?

Weil ein Index sortiert abgelegt ist und **nur von links gelesen** hilft.

```sql
CREATE INDEX … ON activities("organizationId", "createdAt", "id");  -- Feed der Organisation
CREATE INDEX … ON activities("projectId",      "createdAt", "id");  -- Feed eines Projekts
```

Der erste ist nach `organizationId` sortiert, **dann** nach `createdAt`. Die Zeilen *eines*
Projekts liegen darin über den gesamten Zeitraum verstreut – `projectId` kommt im Index gar nicht
vor. PostgreSQL müsste also alle Aktivitäten des Mandanten der Reihe nach lesen, die fremden
Projekte wegwerfen und hoffen, früh genug 20 Treffer beisammen zu haben. Bei einem Projekt, in dem
seit Monaten nichts passiert ist, liest es die halbe Tabelle für eine Seite.

Die Faustregel dahinter: **Was mit Gleichheit gefiltert wird, gehört nach vorne; was sortiert wird,
dahinter.** Ein Index kann nur dann ohne Sortierschritt liefern, wenn der Filter am Anfang alle
verbleibenden Zeilen in der gewünschten Reihenfolge stehen lässt.

Eine Kleinigkeit, die schnell übersehen wird: `organizationId` steht im **zweiten** Index nicht –
bleibt aber im `WHERE` der Abfrage. Der Index wählt Zeilen *vor*, der Mandantenfilter entscheidet
über *Sichtbarkeit*. Beides zu verwechseln wäre genau der Fehler aus Sprint 2: Ein Projekt gehört
nicht automatisch zu der Organisation im Pfad, nur weil seine ID im Pfad steht.

### 129. Ihr Feed sortiert absteigend. Warum steht dann kein `DESC` in Ihren Indizes?

Weil es nichts brächte. Ein B-Baum ist in **beide Richtungen** lesbar: PostgreSQL bedient
`ORDER BY createdAt DESC, id DESC` mit einem aufsteigenden Index, indem es ihn rückwärts durchläuft.
Im Ausführungsplan steht dann `Index Scan Backward` – ohne Zusatzkosten gegenüber vorwärts.

Eine Richtungsangabe zahlt sich erst bei **gemischter** Sortierung aus, etwa `createdAt DESC, id
ASC`. Rückwärtslesen dreht dann beide Spalten auf einmal, und der Index passt zu keiner der beiden
verlangten Reihenfolgen – dafür bräuchte es einen Index, der die Richtungen schon gespeichert hat.

Solange alle Sortierkriterien in dieselbe Richtung zeigen, ist `DESC` im Index Ballast, den ein
späterer Leser für bedeutsam hält und erst nachschlagen muss.

### 130. Warum schreiben Sie den Feed-Eintrag inline und nicht über Domain Events?

Weil Entkopplung hier eine Garantie kostet, die den ganzen Zweck der Tabelle trägt.

`EventEmitter2` mit `@OnEvent`-Listenern ist das Lehrbuch-Muster für NestJS, und ich habe es
bewusst nicht genommen: **Ein Listener läuft außerhalb der Transaktion des Auslösers.** Wird die
fachliche Änderung zurückgerollt – ein `409` beim Verschieben, ein Constraint, ein
Verbindungsabbruch – steht der Feed-Eintrag trotzdem da. Der Feed behauptet dann ein Ereignis, das
die Fachdaten nicht kennen, und der Widerspruch ist von außen nicht auflösbar, weil beide Seiten
für sich stimmig sind.

Stattdessen bekommt `ActivitiesService.protokolliere` den `TransactionClient` des Aufrufers
hereingereicht. Die Klasse hat **keinen** eigenen `PrismaService` – das ist die wichtigste Zeile
der Datei, nämlich die, die fehlt.

Der Preis ist Kopplung: Die Services kennen den Feed. Meine Antwort darauf ist nicht „Kopplung ist
schlecht", sondern die Trennlinie:

> **Konsistenz gehört in die Transaktion, Seiteneffekte gehören in Events.** Ein Protokolleintrag
> ist kein Seiteneffekt, sondern Teil der Änderung.

Für echte Seiteneffekte – E-Mail, Webhooks – bleibt `EventEmitter2` richtig. Die dürfen scheitern,
ohne dass die Änderung falsch wird. Und das Muster, das beides hätte, kenne ich: die
**Transactional Outbox**, bei der das Ereignis in derselben Transaktion in eine Outbox-Tabelle
geht und ein separater Prozess zustellt. Sie löst ein Problem, das ich hier nicht habe –
Zustellung an ein *fremdes* System. In Sprint 5 stellt sich die Frage neu.

### 131. Können Sie belegen, dass das nötig war – oder ist das eine Vermutung?

Belegen. Ich habe den Schreiber testweise auf eine eigene Verbindung gelegt, also genau das getan,
was ein Listener tut, und die Tests laufen lassen. Ergebnis:

```
Foreign key constraint violated on the constraint: `activities_projectId_fkey`
```

Die fremde Verbindung sieht das gerade angelegte Projekt **nicht**, weil dessen Transaktion noch
nicht committet ist. Ein Listener könnte den Eintrag also nicht nur unzuverlässig schreiben – im
Anlege-Fall kann er ihn **gar nicht** schreiben, solange der Fremdschlüssel steht. Das ist ein
mechanisches Argument, kein rhetorisches.

Interessanter ist aber, was dabei schiefging. Meine Erwartung stand vorher fest: die Anlege-Tests
rot, der 409-Test grün. Rot wurden **alle sechs**. Nach meiner eigenen Regel – *ein zu breites Rot
ist genauso verdächtig wie ein ausbleibendes* – habe ich die Ursache nachgelesen statt das Rot als
Bestätigung zu nehmen: Jeder Test legt im Aufbau ein Projekt an, schon der erste Schreibvorgang
scheitert, und die eigentlichen Behauptungen werden nie erreicht.

### 132. Was bewacht Ihr 409-Test dann eigentlich?

Die **Reihenfolge**, nicht die Atomarität – und das ist der Teil, den ich in `12_TESTING.md`
ausdrücklich hingeschrieben habe, weil er unbequem ist.

Der Test prüft: Nach einem abgewiesenen Verschiebeversuch steht kein Eintrag im Feed. Das gilt in
meinem Code aber schon deshalb, weil protokolliert wird, *nachdem* das `UPDATE` erfolgreich war –
der `409` verlässt die Methode vorher. Wäre die Reihenfolge umgedreht, würde ihn erst die
Transaktion retten; so, wie der Code steht, kommt er nie an die Stelle.

Die Transaktion schützt hier also gegen etwas, das **kein vorhandener Test auslöst**: einen Fehler
*zwischen* fachlicher Änderung und Protokolleintrag – ein Verbindungsabbruch, ein Constraint, oder
eine Anweisung, die ein späterer Entwickler dahintersetzt. Realer Schutz, aber ohne wachenden Test.

Das steht so im Testkapitel, damit niemand – ich eingeschlossen – den grünen Haken für mehr hält,
als er ist. Ein Test, der etwas anderes bewacht, als man glaubt, ist gefährlicher als gar keiner,
weil er spätere Änderungen absegnet.

### 133. Ihr `payload` ist `jsonb`. Wie stellen Sie sicher, dass da nicht Unsinn drinsteht?

Gar nicht – die Datenbank kann es nicht. Es gibt kein Constraint, das erzwingt, dass bei
`TASK_MOVED` auch `fromStatus` im `payload` steht. `jsonb` nimmt jedes Objekt an.

Das ist der bewusste Tausch aus ADR-011: Ich gebe die Prüfung der Datenbank auf, um nicht bei jedem
neuen Ereignistyp eine Migration zu brauchen – und hole sie mir im **Typsystem** zurück.

`payload` wird nirgends als freies Objekt geschrieben. Der einzige Weg zu einem Eintrag führt über
eine **unterscheidbare Union** (`discriminated union`): Der Compiler weiß, dass zu
`'AUFGABE_VERSCHOBEN'` zwingend `vonStatus` und `nachStatus` gehören, und lehnt einen halb
gefüllten Eintrag ab, bevor er entsteht. Der `switch` über das Unterscheidungsfeld engt den Typ in
jedem Zweig ein, und am Ende steht eine Vollständigkeitsprüfung:

```ts
const niemals: never = ereignis;
```

Sind alle Fälle behandelt, hat `ereignis` hier den Typ `never` und die Zuweisung ist gültig. Fehlt
ein Fall, ist es der vergessene Typ – und es schlägt fehl. Der Fehler erscheint beim Kompilieren
statt zur Laufzeit als fehlender Feed-Eintrag, den niemand vermisst: **Man sieht nicht, was nicht
da ist.**

Dazu kommt eine eigene Spec ohne Datenbank, die genau den `payload` festnagelt. Sie ist die einzige
Stelle, an der die Zusicherung überhaupt belegt ist.

### 134. Ihr `DELETE` ist idempotent. Gilt das auch für den Feed?

Ja, und das war eine echte Änderung an dieser Stelle.

Idempotenz hieß bisher: Das zweite `DELETE` hinterlässt denselben Zustand in `archivedAt`. Seit dem
Feed gehört er dazu – zweimal „Projekt archiviert" untereinander wäre ein sichtbarer Widerspruch zu
der Zusage, die der Endpoint gibt.

Entscheidend ist, **woran** der Eintrag hängt: an `ergebnis.count` des `updateMany`, nicht an einem
vorher gelesenen `archivedAt`. Würde erst gelesen und dann entschieden, könnten zwei gleichzeitige
Anfragen beide `null` sehen – eine schriebe die Spalte, aber **beide** schrieben ihren Eintrag.

```sql
UPDATE projects SET "archivedAt" = ? WHERE id = ? AND "organizationId" = ? AND "archivedAt" IS NULL
```

Genau einer der beiden bekommt `count = 1`. Dasselbe Prinzip wie beim optimistischen Sperren aus
Sprint 3: **Die Bedingung gehört ins `WHERE`, nicht in ein `if` davor.** Dass diese Regel hier zum
dritten Mal trägt – Mandantenfilter, Versionsprüfung, jetzt Idempotenz – ist der Grund, warum ich
sie mir gemerkt habe.

### 135. Warum Cursor-Paginierung und nicht `?page=3`?

Weil der Feed sich unter dem Nutzer bewegt.

Offset hat zwei Probleme, und das bekanntere ist das kleinere: `OFFSET 10000` liest zehntausend
Zeilen und wirft sie weg – die Kosten steigen mit der Seitenzahl, obwohl das Ergebnis gleich groß
bleibt.

Der schlimmere ist die **Korrektheit**: Kommt zwischen zwei Seitenaufrufen ein Eintrag *oben* dazu,
verschiebt sich alles um eins nach hinten, und Seite 2 beginnt mit dem letzten Eintrag von Seite 1.
Bei einem Feed, in den ständig geschrieben wird, ist das der Normalfall, nicht der Ausnahmefall.

Ein Cursor bezeichnet stattdessen eine **Stelle**: „weiter nach genau diesem Eintrag". Neue Einträge
oben liegen außerhalb dessen, was noch gelesen wird.

Der Preis, den ich dazusage: **kein Springen zu Seite 7 und keine Gesamtzahl.** Für einen
chronologischen Feed ist beides bedeutungslos – für eine Tabelle mit Seitenzahlen wäre Offset die
richtige Wahl. Die Frage lautet nicht „was ist besser", sondern **„springt der Nutzer, oder blättert
er weiter"**.

### 136. Ihr Cursor ist base64 – ist das nicht Sicherheit durch Verschleierung?

Nein, weil er gar nichts zu schützen hat. Das ist der Punkt.

Base64 ist keine Verschlüsselung; jeder kann den Inhalt lesen und ändern. Undurchsichtig ist er aus
einem ganz anderen Grund: Wäre der Aufbau sichtbar, würden Clients anfangen, ihn selbst zu bauen –
und der Tag, an dem der Feed ein drittes Sortierkriterium bekommt, bräche jeden dieser Clients. Es
geht um Kopplung, nicht um Geheimhaltung.

Dass Manipulation unbedenklich ist, liegt an dem, was **nicht** drinsteht:

> **Der Cursor trägt den Mandanten nicht.** Er sagt, *wo* weitergelesen wird, nicht *worin*.

Die Organisation kommt ausschließlich aus der vom Guard geprüften Mitgliedschaft und steht in der
`WHERE`-Bedingung. Ein manipulierter Cursor verschiebt die Stelle innerhalb der eigenen Daten – in
fremde Daten kann er nicht zeigen, dort sucht die Abfrage gar nicht erst.

Deshalb braucht er auch **keine Signatur**. Ein signierter Cursor wäre die Antwort auf ein Problem,
das erst entstünde, wenn man den Mandanten hineinschriebe – und *das* wäre der eigentliche Fehler:
Ein Wert aus dem Browser darf nie darüber entscheiden, wessen Daten man sieht.

Ein Detail noch: `base64url`, nicht `base64`. Der Wert steht in einem Query-Parameter, und dort
bedeutet `+` ein Leerzeichen. Der Cursor käme je nach Client beschädigt an – ein Fehler, der nur bei
bestimmten Zufallswerten auftritt und damit teurer ist als einer, der immer auftritt.

### 137. Ihre Keyset-Bedingung hat zwei Zweige. Wozu der zweite?

Für die Einträge mit **genau demselben** Zeitstempel – und das ist der Zweig, den man weglässt, wenn
man es eilig hat.

Gemeint ist ein Vergleich von Wertepaaren:

```sql
WHERE ("createdAt", "id") < ($1, $2)
```

PostgreSQL kann das direkt, Prisma nicht – dort vergleicht `where` immer einzelne Spalten.
Ausgeschrieben:

```sql
WHERE "createdAt" < $1 OR ("createdAt" = $1 AND "id" < $2)
```

Ohne den zweiten Zweig werden an einer Seitengrenze genau die Einträge übersprungen, die
**gemeinsam in einer Transaktion** entstanden sind. Der Fehler tritt also bevorzugt dort auf, wo
mehrere Dinge auf einmal passiert sind – und `timestamp(3)` macht das häufig, weil Prisma nur
Millisekunden speichert.

`lt` und nicht `lte`, weil der Cursor auf den *letzten gelieferten* Eintrag zeigt. Der gehört zur
vorigen Seite.

### 138. Sie sagen „keine N+1-Queries". Können Sie das belegen?

Ja, mit zwei Zahlen und einem Skript, das sie erzeugt.

`messung-dashboard.ts` enthält **beide** Fassungen der Kennzahlen-Abfrage und zählt über
`log: [{ emit: 'event', level: 'query' }]` mit, was Prisma tatsächlich absetzt:

| Projekte | naiv (Schleife) | `groupBy` |
|---|---|---|
| 20 | 42 Abfragen, 68 ms | 4 Abfragen, 17 ms |
| 100 | 202 Abfragen, 276 ms | 4 Abfragen, 16 ms |

Die Aussage ist **nicht** „4 ist weniger als 202". Sie ist: Die eine Zahl wächst mit den Daten
(`2N + 2`), die andere nicht. Genau das macht N+1 so teuer – mit drei Testprojekten sind es acht
Abfragen, und niemand bemerkt etwas. Der Kunde mit zweihundert Projekten bemerkt es.

Zwei Dinge, die zu dem Nachweis gehören:

- Das Skript prüft am Ende, dass **beide Fassungen dasselbe liefern**. Eine schnellere Abfrage, die
  etwas anderes zählt, ist keine Verbesserung, sondern ein Fehler.
- Die naive Fassung steht **nur** im Messskript. Sie ist nicht der Code, der läuft – sie ist der
  Vergleichswert, ohne den die andere Zahl bedeutungslos wäre.

Und die Erklärung dahinter: Die Arbeit verschwindet nicht, sie **wandert**. Statt der Anwendung
zählt die Datenbank, dort wo die Daten liegen – ein Durchgang durch den Index statt N Umläufe über
das Netzwerk. Der teure Teil an N+1 sind selten die Rechenzeiten, sondern die Wartezeiten.

### 139. Sie laden im Feed die Namen der Akteure. Ist das nicht auch N+1?

Nein, aber nicht aus dem Grund, den die meisten nennen – und der Unterschied ist genau die Frage
hinter der Frage.

Prismas verschachteltes `select` erzeugt **keinen JOIN**. Es setzt eine **zweite** Abfrage der Form
`WHERE id IN (...)` ab und fügt die Ergebnisse im Speicher zusammen. Also zwei Abfragen, nicht eine.

Das ist kein Mangel. Ein JOIN würde die Nutzerspalten für *jeden* Eintrag wiederholen – bei zwanzig
Einträgen desselben Akteurs käme derselbe Name zwanzigmal über die Leitung. Entscheidend ist nicht,
dass es *eine* Abfrage ist, sondern dass die Zahl **nicht mit der Seitengröße wächst**.

Wer es doch als JOIN will, kann Prisma seit Version 5 mit `relationLoadStrategy: 'join'` dazu
bringen. Das ist eine Messfrage, keine Glaubensfrage.

### 140. Ihre Kennzahlen laufen in einer Transaktion. Wozu, es wird doch nur gelesen?

Damit die drei Zahlen **denselben Augenblick** beschreiben – und eine Transaktion allein genügt
dafür nicht.

Bei der Voreinstellung `READ COMMITTED` bekommt **jede Anweisung** ihren eigenen Schnappschuss. Wird
zwischen der zweiten und der dritten eine Aufgabe angelegt, zählen sie verschiedene Stände. Das
Dashboard zeigte dann Zahlen, die zusammen nie gegolten haben – und niemand bemerkt es, weil jede
für sich plausibel aussieht.

Deshalb `REPEATABLE READ`: Der Schnappschuss wird beim ersten Lesen eingefroren.

Der Preis ist hier gering, weil nur gelesen wird – es gibt keine Schreibkonflikte, die einen
Serialisierungsfehler auslösen könnten. Bei einer schreibenden Transaktion wäre das eine andere
Abwägung: Dort müsste der Aufrufer mit Wiederholungen rechnen.

### 141. Was hat Ihnen `EXPLAIN ANALYZE` gezeigt, das Sie vorher nicht wussten?

Drei Dinge, und eines davon hat eine Behauptung von mir bestätigt, die ich sonst nicht hätte belegen
können.

**Erstens** – `Index Scan Backward`. Ich hatte begründet, dass `sort: Desc` im Index überflüssig
ist, weil PostgreSQL einen B-Baum rückwärts lesen kann. Im Plan steht es wörtlich.

**Zweitens** – beim projektgefilterten Feed:

```
Index Cond: ("projectId" = …)
Filter:     ("organizationId" = …)
```

Genau die Arbeitsteilung, die ich dokumentiert hatte: **Der Index wählt vor, der Mandantenfilter
entscheidet.** Dass die Organisation nicht im Index steht, macht sie nicht weniger wirksam.

**Drittens** – die Gegenprobe. Ich habe den zweiten Index in einer zurückgerollten Transaktion
entfernt:

```
Rows Removed by Filter: 931
```

951 gelesene Zeilen für 20 gelieferte. Und das bei **gleichmäßig** verteilten Testdaten – bei einem
Projekt, in dem seit Monaten nichts passiert ist, läuft derselbe Plan durch die halbe Tabelle.

Dazu zwei Fallstricke, die ich beide getroffen hätte:

- **Ohne `ANALYZE`** nach dem Massen-`INSERT` plant PostgreSQL auf dem Stand „Tabelle ist leer" und
  wählt einen Seq Scan. „Der Index wird ignoriert" ist dann die falsche Schlussfolgerung – die
  Statistiken fehlen, nicht der Index.
- **Bei zu wenigen Zeilen** ist der Seq Scan zu Recht schneller. Ein `EXPLAIN` auf Testdaten beweist
  regelmäßig das Gegenteil dessen, was gemeint war.

Und was ich dazusage, weil es der ehrliche Teil ist: Die absoluten Zeiten – 0,235 ms gegen 0,082 ms –
sagen bei 40.000 Zeilen im Arbeitsspeicher **nichts**. Belastbar ist, wie viele Zeilen gelesen
werden mussten.

### 142. Warum zeigt Ihr Dashboard beim Laden einen Strich und keine Null?

Weil `0 offene Aufgaben` eine **Aussage** ist, und während des Ladens ist sie unwahr.

Der Nutzer könnte sie nicht von der echten Null unterscheiden – er sähe „alles erledigt", wo in
Wahrheit „noch nicht bekannt" gilt. Ein Strich sagt genau das.

Es ist derselbe Unterschied wie zwischen `nextCursor: null` und `undefined` im Backend: „es gibt
nichts mehr" und „ich weiß es nicht" sind zwei verschiedene Auskünfte, und beide Male ist die
Verwechslung teuer.

Der Test dazu prüft **beide** Richtungen – Striche beim Laden, echte Nullen, sobald die Daten da
sind. Nur die erste Hälfte wäre auch dann grün, wenn nie eine Null erschiene.

### 143. Ihr Feed lädt auf Knopfdruck nach. Warum kein Infinite Scroll?

Weil ein Feed ohne Ende alles unerreichbar macht, was unter ihm steht.

Mit `useInfiniteQuery` wäre der `IntersectionObserver` genauso wenig Code – die Entscheidung ist
also keine Bequemlichkeit. Drei Gründe:

1. **Der Seitenfuß wird nie erreicht.** Alles unterhalb des Feeds existiert praktisch nicht mehr.
2. **Tastatur und Screenreader.** Der Fokus springt beim Nachladen, und dass etwas dazugekommen ist,
   wird nicht angesagt.
3. **Nachladen soll eine Entscheidung sein.** Beim Scrollen lädt der Nutzer Daten, die er nie sehen
   wollte – auf einer Mobilverbindung sein Datenvolumen.

Wer es doch will, kann den Knopf später mit einem Beobachter kombinieren. Umgekehrt ist es schwerer.

Was mir dabei wichtig ist: Der Knopf hängt an `hasNextPage`, und das folgt daraus, dass das Backend
`nextCursor: null` geliefert hat. Die Komponente zählt nichts und kennt keine Gesamtzahl – genau
deshalb kommt die Cursor-Paginierung ohne ein teures `COUNT` aus.

### 144. Im Backend prüfen Sie Vollständigkeit mit `never`. Im Frontend nicht. Ist das inkonsequent?

Nein – es ist der Unterschied zwischen **Erzeugen** und **Empfangen**.

Im Backend erzeuge ich die Ereignisse selbst. Kommt ein Typ dazu und ich vergesse ihn in der
Abbildung, will ich einen Kompilierfehler – sonst fehlt später ein Feed-Eintrag, und **man sieht
nicht, was nicht da ist**.

Im Frontend empfange ich sie. Ein unbekannter Ereignistyp ist dort kein Programmierfehler, sondern
der **Normalzustand während jedes Deployments**: Das Backend ist schon neu, der Browser hält noch
die alte Fassung. Ein Frontend, das das nicht erträgt, ist bei jeder Auslieferung für ein paar
Minuten kaputt. Also: allgemeinerer Satz statt Absturz.

Dasselbe gilt für `payload`. Es ist im Backend `jsonb` und von der Datenbank nicht geprüft – im
Frontend ist es deshalb `unknown` und wird an **einer** Stelle vorsichtig gelesen. Der Grund ist
nicht Vorsicht um ihrer selbst willen: Der Feed ist ein **Protokoll**, seine Einträge sind
unveränderlich und überdauern jede Formatänderung. Ein Frontend, das den heutigen Aufbau
voraussetzt, bricht genau dann, wenn der Feed seinen Zweck erfüllt.

### 145. Sie haben 494 Tests. Woher wissen Sie, dass die etwas bewachen?

Weil ich es zweimal überprüft habe – und einmal war die Antwort *nein*.

Bei einer **Mutationsprobe** entferne ich einen Schutz, lasse die Tests laufen und baue ihn zurück.
Die Erwartung wird **vorher** aufgeschrieben, sonst deutet man das Ergebnis passend.

In diesem Sprint gab es zwei Proben mit unerwartetem Ausgang:

**Der Aktivitäts-Schreiber** – ich habe ihn auf eine eigene Verbindung gelegt, also genau das
getan, was ein `EventEmitter2`-Listener tut. Erwartet hatte ich, dass die Anlege-Tests rot werden.
Rot wurden **alle sechs**. Nach meiner eigenen Regel – *ein zu breites Rot ist genauso verdächtig
wie ein ausbleibendes* – habe ich nachgelesen statt es als Bestätigung zu nehmen:
`Foreign key constraint violated`. Die fremde Verbindung sieht die noch nicht committete Zeile
nicht. Das Ergebnis war stärker als geplant: Außerhalb der Transaktion geht es nicht *schlecht*,
sondern **gar nicht**.

**Die Keyset-Bedingung** – zweiten Zweig entfernt: **16 von 16 grün.** Mein Paginierungstest
bewachte ihn nicht. Seine fünf Einträge stammten aus fünf HTTP-Anfragen und lagen Millisekunden
auseinander; der Gleichstand trat nie ein. Ich habe einen Test ergänzt, der ihn **erzwingt** – fünf
Einträge direkt über Prisma mit identischem `createdAt`. Die Gegenprobe machte dann genau einen Test
rot, mit sprechender Zahl: 3 statt 6 Einträgen.

Das ist zum dritten Mal dasselbe Muster in diesem Projekt: `Promise.all` ohne Verschränkung
(Sprint 2), `Date.now()` als Testisolierung (Sprint 3), jetzt eine Seitengrenze, die den Gleichstand
nie trifft. Jedes Mal war die Uhr stillschweigend Teil der Testbedingung.

> **Ein Test, der einen Grenzfall nur *wahrscheinlich* erreicht, prüft ihn nicht.** Hängt die
> Bedingung von einer Uhr, einer Reihenfolge oder einem Scheduler ab, muss der Test sie herstellen –
> nicht abwarten.

Und der unbequeme Teil, der genauso in `12_TESTING.md` steht: Mein 409-Test bewacht die
**Reihenfolge**, nicht die Atomarität. Der Schutz gegen einen Fehler *zwischen* Änderung und
Protokolleintrag ist real, aber ohne wachenden Test. Das habe ich hingeschrieben, damit niemand –
ich eingeschlossen – den grünen Haken für mehr hält, als er ist.
