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
