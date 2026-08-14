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

---

## Session 6 – 10./11.08.2026 · Sprint 1 abgeschlossen

**Thema:** Authentifizierung von der Datenbank bis zur UI
**Ergebnis:** Registrierung, Login, Refresh-Rotation, Guard, Frontend, Härtung – 155 Tests

### Die sieben Scheiben

Der Sprint war in kleine, jeweils mergebare Stücke geschnitten. Das hat sich bewährt: Nach jeder
Scheibe stand ein lauffähiger, vorzeigbarer Stand – nicht ein halbfertiger Riesen-PR.

### Was ich gelernt habe

**Passwörter.** Hashen statt verschlüsseln (die Umkehrung braucht man nie). Nicht SHA-256, weil
Geschwindigkeit hier ein Nachteil ist. argon2id, weil speicherhart. Der Salt steckt im Hash, ebenso
die Parameter – deshalb lassen sie sich später erhöhen, ohne alte Passwörter zu brechen.

**Die Datenbank ist die einzige Instanz, die Eindeutigkeit garantieren kann.** Eine Vorab-Prüfung
„gibt es die E-Mail schon?" enthält eine Race Condition. Richtig: schreiben und den Fehlercode
`P2002` auswerten. *Die Prüfung im Code ist für die Fehlermeldung da, der Constraint für die
Garantie.*

**Sicherheit ist mehr als die Fehlermeldung.** Beim Login ist sie generisch – aber das genügt nicht:
Auch die **Antwortzeit** verrät etwas. Deshalb wird das Passwort selbst dann gegen einen
Platzhalter-Hash geprüft, wenn der Nutzer gar nicht existiert. Ein früher `return` wäre hier ein
Sicherheitsfehler, kein Performance-Gewinn.

**JWT: lesbar, aber nicht fälschbar.** base64 ist Kodierung, keine Verschlüsselung – ich habe den
Payload selbst mit zwei Zeilen PowerShell gelesen, ohne das Geheimnis. Daraus folgt: nie etwas
Geheimes hineinlegen. Und das Signaturverfahren wird serverseitig festgelegt, nie dem Token
entnommen (`alg: none`).

**Rotation ist Erkennung, keine Vorbeugung.** Ein gestohlener Refresh-Token funktioniert einmal.
Der Gewinn: Sobald der zweite ihn vorlegt, ist er verbraucht – und *daran* erkennt der Server den
Diebstahl. Die Reaktion ist hart: Die ganze Familie fliegt raus, auch der rechtmäßige Nutzer. Weil
sich beide nicht unterscheiden lassen und die Kosten ungleich verteilt sind – er kennt sein
Passwort, der Angreifer nicht.

**Secure by Default.** Der Guard läuft global, Ausnahmen werden ausdrücklich markiert. Der
Unterschied zeigt sich im Fehlerfall: Ein vergessener Guard wäre ein *stiller* Fehler, ein
vergessenes `@Oeffentlich()` ein *lauter*.

**Langsam hashen, wo die Eingabe erratbar ist. Schnell hashen, wo sie es nicht ist.** Passwort →
argon2. Refresh-Token (256 Bit Zufall) → SHA-256.

**Frontend-Schutz ist Benutzerführung, Backend-Schutz ist Sicherheit.** Die Weiterleitung auf
`/login` verhindert nur eine leere Seite. Dasselbe gilt für Zod im Browser: Bequemlichkeit, nicht
Kontrolle.

**Rate Limiting begrenzt die Anzahl, argon2 die Kosten.** Beides zusammen macht Brute Force
unwirtschaftlich – eines allein nicht.

### Was schwierig war

**Nicht die Konzepte, sondern die Werkzeug-Eigenheiten.** Drei Sackgassen kosteten mehr Zeit als
die eigentliche Fachlogik:

- `ConfigModule.forRoot()` wird beim **Import** ausgewertet, nicht beim Instanziieren – deshalb
  wirkte das Abschalten des Rate Limitings im Test nicht.
- `overrideGuard` greift nicht bei Guards, die über `APP_GUARD` registriert sind.
- Benannte Throttler gelten **alle** für **jede** Route – die strenge Anmelde-Grenze hätte global
  gewirkt.

Alle drei stehen im Fehlerprotokoll. Das Muster dahinter: Die Konzepte sind übertragbar, die
Framework-Details muss man nachschlagen oder sich verbrennen.

### Was sich bewährt hat

**Die Tests haben sich mehrfach bezahlt gemacht** – und zwar nicht als Formalität:

| Gefunden von | Fehler |
|---|---|
| E2E-Test (401 statt 200) | `cookieParser` stand in `main.ts` und fehlte damit im Test |
| Frontend-Test | `finally` statt `catch`: Nutzer blieb auf geschützter Seite stehen |
| Frontend-Test | Fehlermeldung im `<label>` verfälschte den zugänglichen Feldnamen |

Keiner davon wäre beim Ausprobieren von Hand aufgefallen.

### Offene Fragen für später

- Wie kommt ein gemeinsamer Rate-Limit-Zähler (Redis) dazu, wenn mehrere Instanzen laufen?
- Wie räumt man abgelaufene Refresh-Token regelmäßig auf?
- Wie sähe ein „Alle Sitzungen beenden"-Knopf aus – und was kostet er an Komplexität?

### Nächster Schritt

**Sprint 2: Organisationen und Multi-Tenancy.** Der stärkste Senioritäts-Marker im ganzen Projekt:
Autorisierung auf Datenebene, nicht nur am Endpoint. Und der erste `403` – bisher gab es
ausschließlich `401`.

---

## Session 7 – 11.08.2026 · Sprint 2 abgeschlossen

**Organisationen, Rollen, Mandantentrennung.** Zehn Scheiben, 284 Tests, zwei Wochen vor Plan.

### Gelernt

**Autorisierung passiert in der `WHERE`-Bedingung, nicht in einer Prüfung danach.** Das ist der
Satz, der den ganzen Sprint zusammenfasst. `findUnique({ where: { id } })` und
`findFirst({ where: { id, organizationId } })` liefern im Erfolgsfall dasselbe – der erste ist eine
Sicherheitslücke, und keine normale Testsuite bemerkt den Unterschied.

**Ein Guard entscheidet über den Zugang, nicht über den Einzelfall.** Er kennt den Anfragenden, aber
nicht die Zielressource. „Sich selbst entfernen darf jeder" lässt sich deshalb nicht als
`@Rollen()` ausdrücken – die Regel hängt daran, *wen* es trifft. Sobald das der Fall ist, gehört sie
in den Service.

**Eine Transaktion macht Schreibvorgänge unteilbar – nicht Lesen und Schreiben.** Unter
`READ COMMITTED` sehen zwei gleichzeitige Anfragen beide „es gibt noch zwei Eigentümer" und
entfernen beide einen. Gelöst mit `SELECT … FOR UPDATE` auf der Organisationszeile.

**Statuscodes tragen Information, die man nicht verschenken darf.** `404` statt `403` bei fremder
Organisation – und beide Fälle mit *wortgleicher* Meldung, sonst ist der vorsichtige Statuscode
wieder aufgehoben.

**Wer Rechte vergeben darf, hat sie.** Deshalb darf nur `OWNER` Rollen ändern, und ein `ADMIN` darf
keinen `ADMIN` einladen – eine Einladung *ist* eine Rechtevergabe.

**Ein zusammengesetzter Index hilft nur von links gelesen.** Der Extra-Index auf `memberships.userId`
sah redundant aus und ist es nicht.

### Schwierig

**Nebenläufigkeit zu testen.** Mein erster Test – zwei gleichzeitige Austritte per `Promise.all` –
war grün, auch **ohne** die Sperre. `Promise.all` erzeugt keine Verschränkung, nur die Möglichkeit
einer. Erst ein Test, der den Konflikt *erzwingt* (eine gehaltene Sperre, gemessene Wartezeit),
bewacht wirklich etwas.

Daraus die allgemeinere Erkenntnis: **Ob ein Test etwas bewacht, sieht man ihm nicht an.** Man muss
den Code kaputt machen und nachschauen. Das habe ich in diesem Sprint bei jeder sicherheitsrelevanten
Stelle gemacht – Mandantenfilter, Guard, Open-Redirect-Schutz, Zeilensperre.

**Der Fehler, den 155 grüne Tests nicht finden konnten.** Beim ersten Start der Anwendung seit
Sprint 1 standen zwei `POST /auth/refresh` für einen Seitenaufruf in der Netzwerkansicht. Ergebnis:
zwei gleichzeitig gültige Refresh-Token, und kurz darauf eine komplett widerrufene Token-Familie –
die Wiederverwendungs-Erkennung hatte zugeschlagen.

Jeder Teil für sich war korrekt und getestet. Der Fehler entstand aus dem Zusammenspiel von
React-Lebenszyklus, Netzwerk-Zeitverhalten und einer serverseitigen Sicherheitsfunktion.

**Eine grüne Testsuite ist kein Ersatz dafür, die Anwendung zu benutzen.**

### Offen

- GitHub-Profil und LinkedIn – seit Woche 2 überfällig, jetzt der beste Zeitpunkt: zwei Wochen
  Puffer und ein vorzeigbares Repository
- E-Mail-Versand für Einladungen (derzeit steht der Token in der HTTP-Antwort – bewusst und
  dokumentiert, aber nicht produktionsreif)
- Partieller Unique-Index für offene Einladungen, Datenbank-Trigger für „mindestens ein OWNER"
- `browser-demo-1@example.com` liegt noch in der lokalen Datenbank

### Interviewfragen dazu

Nr. 64–95 in `07_INTERVIEW_NOTES.md`. Die stärksten: **72** (warum der Erfolgspfad nicht reicht),
**82** (warum eine Transaktion nicht gegen Race Conditions hilft), **83** (wie man eine Race
Condition testet), **92** (der Fehler, den die Tests nicht fanden), **93** (Open Redirect).

---

## Session 8 – 12./13.08.2026 · Sprint 3 abgeschlossen

Der größte Sprint, in sieben Scheiben: Datenmodell, Projekte-CRUD, Tasks-CRUD, Verschieben,
Frontend-Projektseiten, Board, Politur. **429 Tests**, CI grün, wieder vor Plan.

### Gelernt

**Fractional Indexing – und warum die Grenze sichtbar sein muss.** Eine Karte bekommt beim
Verschieben den Mittelwert ihrer Nachbarn; das schreibt *eine* Zeile statt der ganzen Spalte. Der
Preis ist, dass die Zahl bei jedem Einfügen an derselben Stelle länger wird.

Der Punkt, der mir vorher nicht klar war: **Beide Datentypen haben diese Grenze.** Bei `float8`
sind nach ~50 Halbierungen die Bits verbraucht, und zwei Karten bekommen denselben Wert – ohne
Fehler, ohne Meldung. Bei `numeric(65,30)` steht sie als Zahl da, die man vergleichen kann. Eine
bekannte Grenze mit Gegenmaßnahme ist besser als eine unsichtbare ohne.

**Eine Entscheidung in der Datenbank gilt nicht automatisch im Code.** Die Spalte war `numeric`,
gewählt gegen den Präzisionsverlust – und `decimal.js` rundete trotzdem, weil es voreingestellt mit
20 signifikanten Stellen rechnet. Es wurde also gerundet, *bevor* die Datenbank überhaupt gefragt
war. Gefunden hat das ein Grenzfalltest; `1000 + 1000 = 2000` wäre grün geblieben.

Seitdem prüfe ich bei so etwas die ganze Kette: Spalte, Treiber, Rechenbibliothek, Serialisierung.
Deshalb geht `position` auch als **Zeichenkette** über die API – JSON kennt nur `float64`.

**Optimistisch vs. pessimistisch sperren.** In Sprint 2 hatte ich eine Zeilensperre gebaut und
hätte sie hier wiederholt. Das Unterscheidungsmerkmal ist aber nicht „Nebenläufigkeit ja/nein",
sondern **ob der Konflikt heilbar ist**: Ein verlorener Eigentümer lässt sich durch Neuladen nicht
reparieren, eine falsch liegende Karte schon.

Der Nebeneffekt hat mich überrascht: Optimistisches Sperren macht den Nebenläufigkeitsfehler
**deterministisch reproduzierbar**. Zwei Anfragen mit derselben gelesenen Version sind exakt der
Fall – kein Zeitspiel nötig, anders als beim Sperrtest aus Sprint 2.

**Reine Rechnung gehört von Ein- und Ausgabe getrennt.** Zweimal in diesem Sprint: `positionen.ts`
im Backend, `board-logik.ts` im Frontend. Nicht wegen der Architekturlehre, sondern weil die
Testkosten um eine Größenordnung auseinanderliegen – Drag & Drop über Testereignisse nachzustellen
ist brüchig, die Listenarithmetik dahinter ist trivial prüfbar.

**Optimistische Updates im Frontend.** `onMutate` / `onError` / `onSettled`. Das `cancelQueries`
hätte ich ohne die Dokumentation vergessen – ohne es überschreibt eine bereits laufende Abfrage die
Vorschau mit dem alten Stand, und die Karte springt zurück. Ein Fehler, der nur unter Last
auftritt.

Und: Die Vorschau erfindet **keine** Position. Sie sortiert die Karte nur ein. Das geht, weil die
Anzeige die Reihenfolge aus der Liste liest und nie aus dem Positionswert.

### Schwierig

**Mein eigenes Learning zweimal nicht angewendet.** Der veraltete Prisma-Client stand seit dem
11.08. im Fehlerprotokoll – und hat mich am 12.08. wieder eine Viertelstunde gekostet. Die richtige
Konsequenz ist nicht „besser aufpassen", sondern die Schritte zusammenzubinden, die
zusammengehören. Steht im Backlog.

**Eine Mutationsprobe, die sich selbst überführt hat.** Schutz entfernt, *alle 17* Tests rot – das
sah nach einem sehr wirksamen Schutz aus. Tatsächlich war die Probe kaputt (`npx jest` statt
`npm run test:e2e`, also ohne `THROTTLE_LIMIT=0`).

Daraus die Regel, die ich jetzt vorher aufschreibe: **Ein zu breites Rot ist genauso verdächtig wie
ein ausbleibendes.** Beim zweiten Mal habe ich die Erwartung vorab notiert – und genau das hat den
nächsten Zufallsfehler entlarvt, als plötzlich alle Tests fielen, weil Docker nicht lief.

**Zwei Testsuiten, die sich gegenseitig gelöscht haben.** Alle E2E-Suiten trennten ihre Testdaten
über `Date.now()`. Mit vier Suiten fiel nie auf, dass zwei in derselben Millisekunde starten
können; mit sieben schon – als Fremdschlüsselverletzung in einer Datei, die ich gar nicht angefasst
hatte. **Eine Testisolierung, die auf Zeit beruht, ist keine Isolierung.**

### Offen

- GitHub-Profil: Bio geschärft (noch selbst zu setzen), Bootcamp-Repos entpinnen
- LinkedIn – weiterhin offen
- Wieder-Aktivieren archivierter Projekte, konfigurierbare Board-Spalten, Neuverteilung als
  Hintergrundaufgabe: alles im Backlog mit Begründung
- `db:migrate` und `db:generate` zu einem Schritt verbinden

### Interviewfragen dazu

Nr. 96–124 in `07_INTERVIEW_NOTES.md`. Die stärksten: **96** (warum `numeric` statt `float`),
**99** (optimistisch vs. pessimistisch), **106** (die gerundete Rechenbibliothek), **114** (wie man
einen Nebenläufigkeitsfehler ohne Timing testet), **121** (optimistisches Update mit Rollback),
**123** (wie man Drag & Drop testet).
