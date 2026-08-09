# Learning Journal

Nach jeder Session: Was gelernt? Was war schwierig? Was ist offen?

---

## Session 1 – 07./08.08.2026 · Sprint 0, Schritte 1–2

**Thema:** Projektsetup, Git & GitHub, PostgreSQL im Container
**Ergebnis:** Repository online, Datenbank läuft und ist verifiziert persistent

### Was ich gelernt habe

**Git ist nicht GitHub.**
Git ist ein Programm auf meinem Rechner, GitHub nur einer von vielen Hosting-Anbietern. Mein
lokales Repository ist vollwertig – ich kann committen, branchen und die Historie durchsuchen,
ohne je online zu sein. Ein Commit landet erst durch `git push` auf GitHub. Anfangs habe ich mich
gewundert, warum mein Projekt nach dem Commit nicht auf GitHub auftauchte: Es war kein Remote
konfiguriert, es gab schlicht keine Adresse, an die etwas hätte gesendet werden können.

**Der Weg einer Änderung**
`Arbeitsverzeichnis` → `git add` → `Staging Area` → `git commit` → `lokales Repo` → `git push` → `Remote`

**Conventional Commits.**
Format `typ(scope): beschreibung`, Beschreibung englisch, klein, im Imperativ. Der Nutzen ist
Maschinenlesbarkeit – daraus lassen sich Changelogs und Versionsnummern automatisch erzeugen.
Wichtiger Nebeneffekt: Wenn ich für die Nachricht ein „und" brauche, ist der Commit falsch
geschnitten und gehört aufgeteilt.

**Historie umschreiben ist nur vor dem Push erlaubt.**
Ich musste die Autor-E-Mail nachträglich ändern. Weil noch nichts gepusht war, ging das gefahrlos
per Rebase. Dabei haben sich alle Commit-Hashes geändert – ein Hash ist ein Fingerabdruck über
Inhalt, Autor, Zeitstempel *und* den Hash des Vorgängers. Nach einem Push wäre das tabu gewesen,
weil andere bereits auf der alten Historie arbeiten könnten.

**Zeilenenden (CRLF vs. LF).**
Windows beendet Zeilen anders als Linux. Ein Shell-Skript mit CRLF scheitert im Linux-Container mit
`bad interpreter: ...^M`. Gelöst mit `.gitattributes` im Repository – das gilt für jeden, der klont,
im Gegensatz zu `core.autocrlf`, das nur auf meinem Rechner wirkt. **Prinzip:
Repo-Konfiguration schlägt Maschinen-Konfiguration.**

**Container sind keine VMs.**
Unter Linux teilen sich alle Container den Kernel des Wirts – deshalb starten sie in Millisekunden.
Windows hat keinen Linux-Kernel, deshalb betreibt Docker Desktop über WSL2 eine schlanke Linux-VM,
in der die Container laufen. Genau dafür braucht es Hardware-Virtualisierung (bei AMD `SVM Mode`),
die bei mir im BIOS abgeschaltet war.

**Image, Container, Volume.**
Image = unveränderlicher Bauplan (aus Layern, die zwischen Images geteilt werden).
Container = laufende Instanz davon, **Wegwerfware**.
Volume = Speicher außerhalb des Container-Lebenszyklus. Was überleben muss, gehört ins Volume.

**Infrastructure as Code.**
In Docker Desktop legt man keine „Projekte" an. Die Konfiguration steht in `docker-compose.yml` im
Repository – versioniert, überprüfbar, reproduzierbar. Merksatz: *Eine Konfiguration, die nicht im
Repository steht, existiert nicht.*

**Service-Namen sind Hostnamen.**
Compose baut ein privates Netzwerk, in dem jeder Service unter seinem Namen erreichbar ist. Das
Backend wird die Datenbank später unter `db:5432` ansprechen, **nicht** unter `localhost:5432` –
innerhalb des Netzwerks ist `localhost` der Container selbst.

**Healthcheck ≠ läuft.**
Docker weiß von sich aus nur, ob ein Prozess gestartet ist – nicht, ob er *bereit* ist. Postgres
braucht nach dem Start einige Sekunden. Ohne Healthcheck würde das Backend beim Hochfahren gegen
eine noch geschlossene Datenbank laufen.

### Was schwierig war

**Ich habe geraten statt nachzuschlagen.** Bei den Umgebungsvariablen des Postgres-Images habe ich
`POSTGRES_DATE` und `POSTGRES_AGE` erfunden. Solche Namen kann man nicht wissen, nur nachlesen – sie
werden vom Image festgelegt und stehen in dessen Dokumentation. *Primärquelle finden statt raten*
ist im Backend eine der wichtigsten Fähigkeiten überhaupt.

**„Denke es funktioniert" war falsch.** Der Container lief scheinbar, stürzte aber in einer
Neustart-Schleife ab – neun Neustarts in 38 Sekunden. Details in `17_MISTAKES_AND_LESSONS.md`.
Verifiziert wird auf drei Stufen: Container läuft → Container ist *healthy* → Datenbank beantwortet
eine echte Abfrage.

**Die Menge an neuen Begriffen auf einmal.** Hat geholfen: sich auf drei Kernsätze reduzieren
(Image = Bauplan, Container = Instanz, Volume = das, was überlebt) und den Rest beim Tun aufsammeln.

### Offene Fragen für später

- Wie sieht die Compose-Datei für Produktion aus, wenn der Port 5432 **nicht** veröffentlicht wird?
- Wie funktioniert ein PostgreSQL-Major-Upgrade mit `pg_upgrade` im Container?
- Wann lohnt sich das Pinnen auf einen Image-Digest statt auf einen Tag?

### Nächster Schritt

Sprint 0, Schritt 3: NestJS-Backend mit `/health`-Endpoint, der die echte Datenbankverbindung prüft.

---

## Session 2 – 08.08.2026 · Sprint 0, Schritt 3

**Thema:** NestJS-Grundgerüst, Dependency Injection
**Ergebnis:** Backend läuft, HTTP 200 auf `http://localhost:3000` verifiziert

### Was ich gelernt habe

**Dependency Injection – und warum es kein Selbstzweck ist.**
Bisher hätte ich geschrieben: `private db = new PostgresClient(...)`. Damit erzeugt die Klasse ihre
Abhängigkeit selbst und ist untrennbar an eine echte Datenbank gekettet. Ein Unit-Test bräuchte
eine laufende Postgres-Instanz – dann ist es kein Unit-Test mehr. Fehlerfälle („was passiert, wenn
die Datenbank ausfällt?") lassen sich gar nicht erst simulieren.

Stattdessen:

```ts
constructor(private readonly db: DatabaseClient) {}
```

Die Klasse sagt nur noch, *was* sie braucht. Woher es kommt, ist nicht ihr Problem. Im Test eine
Attrappe, in Produktion die echte Verbindung – ohne eine Zeile im Service zu ändern. Das Prinzip
heißt **Inversion of Control**.

**Composition Root.**
`NestFactory.create(AppModule)` in `main.ts` ist der einzige Ort, an dem der Objektgraph
zusammengebaut wird. Nest liest das Wurzelmodul, findet darüber alle weiteren Module, erzeugt jede
registrierte Klasse einmal und verdrahtet sie. In Spring Boot entspricht das
`SpringApplication.run(...)`.

**Decorators sind Metadaten, kein ausführbarer Code.**
`@Module({...})` steht über einer leeren Klasse – der gesamte Inhalt ist eine Liste, aus der Nest
beim Start ableitet, was zu erzeugen ist. Steht eine Klasse nicht in `providers` oder `controllers`,
kennt Nest sie nicht: `Nest can't resolve dependencies of ...`. Das wird mein häufigster Fehler
werden, und die Ursache ist fast immer ein vergessener Eintrag im Modul.

**Wie Nest weiß, was es injizieren soll.**
Nur aus dem **Typ** im Konstruktor. TypeScript-Typen verschwinden normalerweise beim Kompilieren;
`emitDecoratorMetadata` in der `tsconfig.json` sorgt dafür, dass die Konstruktor-Typen als Metadaten
im JavaScript landen, wo Nest sie zur Laufzeit ausliest. Keine Magie, ein Compiler-Schalter.

**Parameter Properties.**
`constructor(private readonly x: Y) {}` ist TypeScript-Kurzschrift für: Parameter entgegennehmen,
Feld anlegen, zuweisen. Kannte ich aus dem Frontend nicht, weil es dort selten vorkommt.

**Controller dünn, Service dick.**
Der Controller kennt HTTP, der Service kennt die Fachlogik und nichts von HTTP. Dadurch ist
derselbe Service später aus einem Cronjob, einem Worker oder einem Test aufrufbar.

**Provider sind Singletons.**
Nest erzeugt pro Provider genau eine Instanz für die gesamte Anwendung. In Spring ist das ebenso der
Standard-Scope.

**Node führt kein TypeScript aus.**
`nest build` kompiliert nach `dist/`, gestartet wird `dist/main.js`. Im Entwicklungsbetrieb erledigt
`npm run start:dev` das im Hintergrund und startet bei jeder Änderung neu. In Produktion läuft
immer der gebaute Stand.

**Was sich erzeugen lässt, gehört nicht ins Repository.**
`node_modules` hat 29.875 Dateien und 151 MB – Git sieht davon nichts, weil `.gitignore` vor dem
ersten Commit existierte. Alles davon ist aus `package.json` und `package-lock.json`
rekonstruierbar. Deshalb gehört das Lockfile ins Repo, `node_modules` und `dist` nicht.

### Was schwierig war

Der Perspektivwechsel bei DI. Im Frontend erzeugt man Dinge dort, wo man sie braucht, und das ist
völlig in Ordnung. Dass eine Klasse ihre Abhängigkeit *nicht* selbst erzeugen soll, wirkt zunächst
umständlich – bei einer Klasse ist es das auch. Der Nutzen zeigt sich erst bei vielen Klassen mit
Abhängigkeiten untereinander, und vor allem beim Testen.

### Offene Fragen für später

- Wie sieht ein Unit-Test aus, der einen Service mit einer Attrappe statt der echten Datenbank testet?
- Wann braucht ein Provider einen anderen Scope als Singleton (`REQUEST`)?
- Wie werden Zod-Schemata zwischen Backend und Frontend geteilt, ohne Workspace?

### Nächster Schritt

Konfiguration mit Zod validieren (fail fast) und ein `/health`-Modul als erstes echtes Feature-Modul.

---

## Session 3 – 08.08.2026 · Sprint 0, Schritt 3 abgeschlossen

**Thema:** Konfigurationsvalidierung, Health-Endpoint, Prisma
**Ergebnis:** Walking Skeleton auf Backend-Seite geschlossen – HTTP → NestJS → Prisma → PostgreSQL

### Was ich gelernt habe

**Fail fast.** `process.env.FOO` liefert bei fehlender Variable `undefined`, ohne Fehler. Die
Anwendung startet scheinbar normal und fällt Stunden später an ganz anderer Stelle um. Mit
Zod-Validierung beim Start bricht sie sofort ab:

```
ERROR [ExceptionHandler] Error: Ungueltige Umgebungskonfiguration:
  - PORT: Invalid input: expected number, received NaN
```

Ein Container, der wegen fehlender Konfiguration gar nicht hochkommt, ist besser als einer, der halb
funktioniert.

**Health-Checks sind für Maschinen.** Loadbalancer und Orchestratoren lesen den **Statuscode**, nicht
den Body. Deshalb `503` statt `200` mit Fehlerfeld – sonst bekommt eine kaputte Instanz weiter
Anfragen. Selbst nachgestellt: Datenbank gestoppt → 503, Datenbank zurück → 200.

**Liveness vs. Readiness.** „Läuft der Prozess?" und „kann er arbeiten?" sind verschiedene Fragen mit
verschiedenen Konsequenzen. Bei fehlender Datenbank hilft ein Neustart nicht – die Instanz gehört
nur aus dem Verkehr genommen.

**Der Moment, in dem DI sich auszahlt.** Im Unit-Test bekommt der HealthService statt der echten
Datenbank eine Attrappe:

```ts
{ provide: PrismaService, useValue: { isReachable } }
```

Kein Container, Laufzeit in Millisekunden – und der **Ausfallfall** ist überhaupt erst prüfbar.
Genau das war mit `new PrismaClient()` im Rumpf unmöglich. Testbarkeit ist eine Eigenschaft des
Designs, nicht der Tests.

**Prisma erzeugt SQL, das ich lesen kann.** Aus `@unique` wurde ein `CREATE UNIQUE INDEX`. Wichtig
dabei: Die Eindeutigkeit erzwingt die **Datenbank**, nicht mein Code. Eine Prüfung im Code hat immer
eine Lücke zwischen Prüfen und Schreiben – zwei gleichzeitige Registrierungen könnten beide
durchkommen.

**Migrationen sind unveränderlich.** Eine angewendete Migration wird nie bearbeitet; Korrekturen
kommen als neue Migration obendrauf. Dieselbe Regel wie bei Git-Commits nach dem Push.
`migrate dev` erzeugt, `migrate deploy` wendet nur an – nur letzteres darf auf einen Server.

**Lifecycle-Hooks.** `OnModuleInit` und `OnModuleDestroy` hängen den PrismaClient an den
Lebenszyklus der Anwendung. Ohne sauberes `$disconnect` bleiben Verbindungen im Pool hängen.

### Was schwierig war

Prisma 7 ist eine junge Hauptversion, und drei Dinge haben Zeit gekostet – alle drei durch **Lesen
der Fehlermeldung** gelöst, nicht durch Raten:

1. `.env` wird nicht mehr automatisch geladen → explizit in `prisma.config.ts`, zeigend auf die
   Wurzel-`.env`.
2. Der generierte Client ist ESM mit `import.meta`, NestJS kompiliert aber nach CommonJS →
   `moduleFormat = "cjs"` und `importFileExtension = ""` im Generator.
3. Der Query-Compiler wird als WASM per dynamischem Import geladen → in Jest
   `NODE_OPTIONS=--experimental-vm-modules`, im echten Node-Prozess unproblematisch.

Dazu ein TypeScript-Fehler, der direkt am gelernten Konzept hing: `TS1272` verlangt `import type`
für Interfaces in dekorierten Signaturen – weil `emitDecoratorMetadata` einen **Laufzeitwert**
braucht und ein Interface zur Laufzeit nicht existiert.

### Offene Fragen für später

- Wie sieht eine separate Testdatenbank für Integrationstests aus (eigener Container, Testcontainers)?
- Wann lohnt `$queryRaw` statt des Prisma-Clients?
- Wie wird `DATABASE_URL` sauber umgeschaltet, wenn das Backend selbst im Container läuft (`db` statt `localhost`)?

### Nächster Schritt

Sprint 0, Schritt 4: Next.js-Frontend, das `/health` aufruft und anzeigt. Damit ist das Walking
Skeleton vollständig – von der UI bis zur Datenbank.

---

## Session 4 – 09.08.2026 · Sprint 0, Schritt 4

**Thema:** Next.js-Frontend, CORS, Git-Wiederherstellung
**Ergebnis:** Walking Skeleton vollständig – Browser → Next.js → NestJS → Prisma → PostgreSQL

### Was ich gelernt habe

**CORS – und zwar durch Erleben, nicht durch Lesen.**
Die Seite lud, blieb bei „Frage Backend ab …" hängen, und im JavaScript kam nur an:

```
Failed to fetch
```

Der eigentliche Grund stand **nur in der Browser-Konsole**:

```
Access to fetch at 'http://localhost:3000/health' from origin 'http://localhost:3001'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

Zwei Erkenntnisse daraus:

1. **Ein abweichender Port genügt für eine „fremde Herkunft".** Nicht nur eine andere Domain.
2. **Der Browser verrät dem Skript absichtlich nichts.** Würde er den Grund durchreichen, wäre die
   Sperre umgehbar. Deshalb ist bei `Failed to fetch` der erste Griff **F12**, nicht der Debugger.

Behoben wird es im **Backend**, nicht im Frontend – der Server entscheidet, wer ihn aufrufen darf.
Und bewusst nicht mit `origin: '*'`: Das erlaubte jeder beliebigen Webseite, im Namen angemeldeter
Nutzer Anfragen zu stellen.

**Server Components lösen kein CORS aus**, weil kein Browser beteiligt ist. Ein CORS-Fehler dadurch
zu „beheben", dass man die Anfrage auf den Server verschiebt, ist manchmal richtig – oft aber nur
eine Verlagerung.

**`NEXT_PUBLIC_` bedeutet öffentlich.** Solche Variablen werden beim Build ins Browser-Bundle
eingebacken und sind für jeden lesbar. Dort gehört nie ein Geheimnis hinein.

**Next.js 16 cacht `fetch` nicht mehr standardmäßig.** In Next 13/14 war es umgekehrt – eine
Umstellung, die viele Stunden gekostet hat, weil Daten scheinbar veraltet blieben. Nachgelesen habe
ich das in der mitgelieferten Dokumentation unter `node_modules/next/dist/docs/`, nicht im Netz.
Bei neuen Hauptversionen ist die lokale Doku verlässlicher als Suchergebnisse.

**Git: nichts ist verloren, solange der Reflog existiert.**
Zwei Commits verschwanden, weil Push und PR-Merge in einem Zug liefen (Details in
`17_MISTAKES_AND_LESSONS.md`). `git reflog` fand sie, `git cherry-pick` holte sie zurück. Neu
gelernt: `cherry-pick` überträgt einzelne Commits auf einen anderen Branch, und Commits ohne Branch
werden nicht sofort gelöscht.

### Was schwierig war

Weniger die Technik als die **Anzahl gleichzeitig laufender Dinge**: Datenbank-Container, Backend auf
3000, Frontend auf 3001. Wenn etwas nicht geht, ist die erste Frage nicht „wo ist der Bug", sondern
**„läuft überhaupt alles?"**. Drei Prozesse, drei Prüfungen.

### Offene Fragen für später

- Wann lohnt sich ein Server-Component-Fetch, wann einer im Client?
- Wie kommt TanStack Query ins Spiel, und was ersetzt es an dem `useEffect` von heute?
- Wie sieht die CORS-Konfiguration in Produktion aus, wenn Frontend und Backend hinter demselben
  nginx auf derselben Domain liegen – braucht man sie dann überhaupt noch?

### Nächster Schritt

Sprint 0, Schritt 5: ESLint/Prettier-Gates, Husky, und die GitHub-Actions-Pipeline, die Lint, Tests
und Build bei jedem Push ausführt. Damit ist Sprint 0 abgeschlossen.

---

## Session 5 – 09.08.2026 · Sprint 0 abgeschlossen

**Thema:** Git-Hooks, CI-Pipeline, Branch-Schutz
**Ergebnis:** Pipeline im ersten Anlauf grün (1 min 1 s), `main` geschützt

### Was ich gelernt habe

**Ein Git-Hook ist Bequemlichkeit, keine Garantie.**
Husky läuft auf meinem Rechner und lässt sich mit `--no-verify` umgehen. Auf einem fremden Rechner
ist er womöglich gar nicht installiert. Die eigentliche Absicherung ist die Pipeline, weil sie auf
GitHubs Servern läuft und niemand sie überspringen kann.

Daraus folgt die Arbeitsteilung: Hook macht das **Schnelle** (Formatierung, zwei Sekunden), Pipeline
das **Gründliche** (typbewusstes Linting, alle Tests, Build). Ein Hook, der zwei Minuten braucht,
wird nach einer Woche abgeschaltet – und dann schützt gar nichts mehr.

**`npm ci` ist nicht `npm install` mit anderem Namen.**
`ci` löscht `node_modules`, installiert exakt die Versionen aus dem Lockfile und **bricht ab**, wenn
`package.json` und Lockfile nicht zusammenpassen. `install` würde das Lockfile stillschweigend
anpassen. In einer Pipeline ist genau das falsch: Das Ergebnis wäre nicht mehr reproduzierbar, und
zwei Läufe könnten unterschiedliche Abhängigkeiten installieren.

**In der CI wird nicht automatisch repariert.**
Mein lokales `lint` läuft mit `--fix`. In der Pipeline wäre das schädlich – sie würde Fehler
heimlich beheben und grün werden, obwohl der committete Code kaputt ist. Deshalb ein eigenes
`lint:ci` ohne `--fix`, dafür mit `--max-warnings 0`: Auch Warnungen machen den Lauf rot. Sonst
sammeln sich Warnungen an, bis sie niemand mehr liest.

**Service-Container in der Pipeline.**
Der Backend-Job startet einen echten `postgres:18-alpine` für seine Laufzeit. Kein Mock – die
E2E-Tests laufen gegen dieselbe Datenbankversion wie lokal. Der **Healthcheck ist Pflicht**: Ohne
ihn starten die Tests, bevor Postgres Verbindungen annimmt. Genau dasselbe Problem wie lokal bei
`docker compose`, nur an anderer Stelle.

**Erst der Branch-Schutz macht die Pipeline wirksam.**
Ohne ihn kann man eine rote Pipeline schlicht ignorieren. Und eine Einstellung, die ich vorher nicht
bedacht hatte: Pflicht-Reviews würden mich komplett aussperren, weil GitHub niemanden den eigenen
Pull Request freigeben lässt.

Ebenso wichtig: `enforce_admins` steht auf `false`, also kann ich als Eigentümer weiterhin direkt
auf `main` pushen. Der Schutz ist also nur so stark wie meine eigene Disziplin – solange ich ihn
nicht auch für Admins einschalte.

### Was schwierig war

Nichts Technisches – der Lauf war beim ersten Versuch grün. Schwieriger war zu verstehen, **warum**
manche Voreinstellungen in der Pipeline anders sein müssen als lokal. `--fix` ist lokal praktisch
und in der CI ein Fehler. `npm install` ist lokal richtig und in der CI falsch. Die Regel dahinter:
**Lokal optimiert man auf Bequemlichkeit, in der Pipeline auf Reproduzierbarkeit und Ehrlichkeit.**

### Der Bezug zur eigenen Geschichte

Genau das hat bei der lahmgelegten Live-Seite gefehlt: keine Tests, keine Pipeline, keine
Staging-Umgebung, kein Gate vor dem Deployment. Zurücksetzen ging nur, weil Git-Historie,
Vercel-Historie und Snapshots vorhanden waren – also durch Glück beim Aufräumen, nicht durch
Vorsorge.

Ab jetzt kommt in DevBoard nichts nach `main`, ohne dass Lint, Unit-Tests, E2E-Tests und Build für
Backend und Frontend grün sind. Das ist der Unterschied zwischen „ich würde es heute anders machen"
und einem Beleg im Repository.

### Offene Fragen für später

- Wie kommt eine Testdatenbank pro Testlauf zustande, ohne dass Tests sich gegenseitig stören?
- Wann lohnt sich eine Abdeckungsschwelle in der CI – und welche Zahl ist sinnvoll?
- Wie sieht der Schritt aus, der nach grüner Pipeline automatisch auf Staging deployt?

### Nächster Schritt

**Sprint 1: Authentifizierung.** Registrierung, Login, Passwort-Hashing mit argon2, JWT mit
Access- und Refresh-Token, Guards, geschützte Seiten im Frontend – der erste vollständige vertikale
Slice von der Datenbank bis zur UI.
