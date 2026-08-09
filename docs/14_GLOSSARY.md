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

**Fail fast** – Fehler so früh und so nah an ihrer Ursache wie möglich auftreten lassen. Eine
Anwendung, die wegen fehlender Konfiguration gar nicht startet, ist besser als eine, die halb
funktioniert.

---

## NestJS & Backend

**Dependency Injection (DI)** – Eine Klasse erzeugt ihre Abhängigkeiten nicht selbst, sondern
bekommt sie hineingereicht. Macht die Klasse testbar, weil sich im Test eine Attrappe einsetzen
lässt.

**Inversion of Control (IoC)** – Das Prinzip hinter DI: Nicht die Klasse holt sich, was sie braucht,
sondern ein Container gibt es ihr.

**IoC-Container** – Der Mechanismus, der Objekte erzeugt und verdrahtet. In NestJS eingebaut, in
Spring der `ApplicationContext`.

**Composition Root** – Der einzige Ort, an dem der Objektgraph zusammengebaut wird. Bei NestJS
`NestFactory.create(AppModule)` in `main.ts`.

**Module (`@Module`)** – Bündelt zusammengehörige Controller und Provider. Deklariert über
`exports`, was andere Module sehen dürfen. Entspricht in Spring der Konfiguration samt Component
Scan.

**Controller (`@Controller`)** – Nimmt HTTP-Anfragen entgegen und gibt Antworten zurück. Enthält
keine Fachlogik. Entspricht `@RestController`.

**Provider / `@Injectable`** – Eine vom Container verwaltete Klasse, meist ein Service mit der
Fachlogik. Entspricht `@Service`.

**Guard** – Entscheidet vor dem Controller, ob ein Aufruf durchgelassen wird (Authentifizierung,
Rollen). Entspricht einem Spring-Security-Filter.

**Interceptor** – Umschließt Aufrufe, z. B. für Logging, Caching oder das Umformen von Antworten.
Entspricht AOP-Aspekten.

**Pipe** – Validiert und wandelt Eingaben um, bevor der Controller sie erhält.

**Exception Filter** – Wandelt geworfene Fehler in einheitliche HTTP-Antworten. Entspricht
`@ControllerAdvice`.

**Decorator** – Syntax wie `@Module({...})`. Hier reine **Metadaten**, kein ausführbarer Code – eine
Liste, aus der das Framework beim Start ableitet, was zu tun ist.

**`emitDecoratorMetadata`** – Compiler-Option, die TypeScript-Typen aus Konstruktoren als Metadaten
ins JavaScript schreibt. Nur dadurch weiß Nest zur Laufzeit, welche Klasse es injizieren muss.

**Parameter Property** – TypeScript-Kurzschrift: `constructor(private readonly x: Y) {}` nimmt den
Parameter entgegen, legt das Feld an und weist es zu – alles in einer Zeile.

**Scope** – Lebensdauer eines Providers. Standard ist **Singleton** (eine Instanz für die ganze
Anwendung); daneben `REQUEST` (eine pro Anfrage) und `TRANSIENT` (eine pro Injektion).

**`dist/`** – Verzeichnis mit dem kompilierten JavaScript. Node führt kein TypeScript aus; gestartet
wird immer der gebaute Stand.

**Lockfile (`package-lock.json`)** – Hält die exakten Versionen aller Abhängigkeiten fest. Gehört
ins Repository, damit alle dieselben Versionen installieren. `node_modules` dagegen nicht – es ist
daraus rekonstruierbar.

**Lifecycle-Hook** – Methode, die das Framework zu bestimmten Zeitpunkten aufruft, z. B.
`onModuleInit` beim Hochfahren und `onModuleDestroy` beim Herunterfahren.

---

## Datenbank & Prisma

**ORM (Object-Relational Mapping)** – Übersetzt zwischen Datenbanktabellen und Objekten im Code.

**Query Builder** – Mittelweg zwischen rohem SQL und ORM: SQL bleibt sichtbar, wird aber typsicher
zusammengesetzt (Kysely, Knex).

**Migration** – Versionierte Schemaänderung als SQL-Datei im Repository. Wird nie nachträglich
bearbeitet; Korrekturen kommen als neue Migration obendrauf.

**`migrate dev` vs. `migrate deploy`** – `dev` erzeugt neue Migrationen und kann die Datenbank
zurücksetzen (nur lokal). `deploy` wendet nur vorhandene an – das Einzige, was auf einem Server
laufen darf.

**Driver Adapter** – Seit Prisma 7 der Weg zur Datenbank: ein echter Node-Treiber (`pg`) statt einer
Rust-Binärdatei. Macht Container-Images kleiner.

**Constraint** – Regel, die die Datenbank selbst erzwingt (`UNIQUE`, `NOT NULL`, `FOREIGN KEY`).
Stärker als eine Prüfung im Anwendungscode, weil dort immer eine Lücke zwischen Prüfen und
Schreiben bleibt.

**Index** – Datenstruktur, die Suchen beschleunigt. Ein `UNIQUE INDEX` erzwingt zusätzlich
Eindeutigkeit.

**UUID** – 128-Bit-Bezeichner. Als Primärschlüssel bevorzugt, weil fortlaufende Zahlen in URLs
verraten, wie viele Datensätze existieren, und zum Durchprobieren fremder IDs einladen.

**Connection Pool** – Wiederverwendete Datenbankverbindungen. Ohne sauberes Trennen beim
Herunterfahren bleiben sie belegt.

---

## Betrieb & Tests

**Fail fast** – siehe oben. Konkret: Konfiguration beim Start validieren, statt später umzufallen.

**Liveness** – „Läuft der Prozess?" Bei rot hilft ein Neustart.

**Readiness** – „Kann er Anfragen bedienen?" Bei rot hilft ein Neustart **nicht**, wenn eine
Abhängigkeit fehlt – die Instanz gehört aus dem Verkehr genommen.

**Health-Check** – Endpoint, der beides beantwortet. Wird von Maschinen über den **Statuscode**
gelesen, nicht über den Body.

**Unit-Test** – Prüft eine Klasse isoliert, alle Abhängigkeiten ersetzt. Millisekunden.

**E2E-Test** – Startet die echte Anwendung und schickt echte HTTP-Anfragen.

**Mock / Attrappe / Test Double** – Ersatzobjekt für eine Abhängigkeit im Test. Macht Szenarien
prüfbar, die real kaum herstellbar sind (z. B. Datenbankausfall).

**Testpyramide** – Viele schnelle Unit-Tests, wenige langsame E2E-Tests.

---

## Frontend & Browser

**Origin (Herkunft)** – Kombination aus Schema, Host und Port. Weicht eines ab, ist es eine fremde
Herkunft – `http://localhost:3000` und `http://localhost:3001` sind verschieden.

**Same-Origin-Policy** – Grundregel des Browsers: Ein Skript darf die Antwort einer fremden Herkunft
nicht auslesen.

**CORS (Cross-Origin Resource Sharing)** – Der Mechanismus, mit dem ein **Server** einer fremden
Herkunft den Zugriff erlaubt, über den Header `Access-Control-Allow-Origin`. Wird immer im Backend
konfiguriert, nie im Frontend.

**Preflight** – Vorab-Anfrage mit der Methode `OPTIONS`, die der Browser bei „nicht einfachen"
Anfragen (z. B. `PUT`, `DELETE`, eigene Header) schickt, bevor er die eigentliche sendet.

**Server Component** – React-Komponente, die auf dem Server gerendert wird. Kein CORS, Zugriff auf
Geheimnisse möglich, kein Zustand und keine Browser-APIs.

**Client Component** (`'use client'`) – Läuft im Browser. Zustand, Effekte und Interaktion möglich –
und CORS gilt.

**`NEXT_PUBLIC_`** – Präfix, das eine Umgebungsvariable ins Browser-Bundle einbackt. Alles damit
Markierte ist öffentlich lesbar; Änderungen erfordern einen neuen Build.

**Hydration** – Der Vorgang, bei dem React im Browser das servergerenderte HTML „belebt", also
Ereignis-Handler und Zustand daran knüpft.

---

## CI/CD

**Continuous Integration (CI)** – Jede Änderung wird automatisch gebaut und geprüft, bevor sie in den
Hauptzweig gelangt.

**Continuous Delivery** – Jede grüne Änderung ist jederzeit ausrollbar; der letzte Schritt in
Produktion wird manuell freigegeben.

**Continuous Deployment** – Wie oben, nur ohne manuelle Freigabe.

**Pipeline / Workflow** – Die Abfolge automatisierter Schritte. Bei GitHub Actions in
`.github/workflows/` definiert.

**Job** – Abschnitt einer Pipeline, der auf einem eigenen Rechner läuft. Jobs ohne Abhängigkeiten
laufen parallel.

**Runner** – Die Maschine, auf der ein Job ausgeführt wird.

**Service-Container** – Zusätzlicher Container, der für die Dauer eines Jobs läuft, etwa eine
Datenbank für Integrationstests. Braucht einen Healthcheck, sonst starten die Tests zu früh.

**`npm ci`** – Installiert exakt die Versionen aus dem Lockfile und bricht ab, wenn `package.json`
und Lockfile auseinanderlaufen. In Pipelines Pflicht; `npm install` würde das Lockfile still
verändern.

**Git-Hook** – Skript, das Git zu bestimmten Zeitpunkten lokal ausführt, z. B. `pre-commit`. Mit
`--no-verify` umgehbar – deshalb Bequemlichkeit, keine Garantie.

**Husky** – Werkzeug, das Git-Hooks im Repository versioniert und für alle installiert.

**lint-staged** – Führt Befehle nur auf den **gestagten** Dateien aus, statt auf dem ganzen Projekt.
Hält den Hook schnell.

**Branch-Schutz** – Regeln auf einem Branch: Pflicht-Checks, keine Force-Pushes, kein direkter Push.
Erst dadurch wird eine Pipeline verbindlich.

**Required Status Check** – Ein Pipeline-Job, der grün sein muss, bevor gemergt werden darf.

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
