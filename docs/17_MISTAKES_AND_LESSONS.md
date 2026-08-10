# Fehler & Learnings

Fehler festhalten und daraus lernen. Jeder Eintrag: was passiert ist, warum, wie behoben,
was daraus folgt.

---

## 2026-08-07 – Falscher Volume-Mount bei PostgreSQL 18

**Symptom:** Der Container `devboard-db` startete nicht, sondern lief in einer Neustart-Schleife.
`docker compose ps` zeigte `Restarting (1)`, `docker inspect` meldete `Health: unhealthy` und neun
Neustarts in 38 Sekunden.

**Ursache:** Der Mount lag auf `/var/lib/postgresql/data`. Das war bis PostgreSQL 17 korrekt.
Ab Version 18 legt das offizielle Image die Daten in einem versionsbenannten Unterverzeichnis ab
(`/var/lib/postgresql/18/docker`), damit spätere `pg_upgrade`-Migrationen nicht an einer
Mount-Grenze scheitern. Der Mount muss deshalb eine Ebene höher sitzen: auf `/var/lib/postgresql`.

**Behebung:** Mount-Pfad in `docker-compose.yml` korrigiert, `docker compose down -v` (das leere,
halb angelegte Volume verwarf), neu gestartet. Danach `Health: healthy`, 0 Neustarts.

**Learnings:**

1. **Logs vor Google.** Die Fehlermeldung des Containers benannte Ursache, Lösung und
   Hintergrunddiskussion vollständig. `docker logs <name>` ist der erste Schritt bei jedem
   Container-Problem, nicht der letzte.
2. **„Denke es funktioniert" ist kein Status.** Ein neustartender Container wirkt auf den ersten
   Blick beschäftigt. Verifiziert wird auf drei Stufen: Container läuft, Container ist *healthy*,
   Datenbank beantwortet eine echte Abfrage.
3. **Versionswechsel ändern Konventionen, nicht nur Funktionen.** Der Pfad war jahrelang stabil und
   steht so in hunderten Tutorials. Genau deshalb wird die Version gepinnt – siehe ADR-004.
4. **Persistenz beweist man, man nimmt sie nicht an.** Test: Tabelle anlegen, `docker compose down`
   (ohne `-v`), neu starten, Zeile abfragen. Erst dann ist das Volume verifiziert.
5. **`-v` unterscheidet Stoppen von Vernichten.** `docker compose down` beendet Container.
   `docker compose down -v` löscht zusätzlich die Volumes – und damit die Datenbank.

---

## 2026-08-08 – Geraten statt nachgeschlagen

**Symptom:** Beim Schreiben der `docker-compose.yml` habe ich die Umgebungsvariablen des
Postgres-Images erfunden: `POSTGRES_DATE`, `POSTGRES_AGE`. Beides existiert nicht.

**Ursache:** Diese Namen legt das Image fest, nicht ich. Sie sind nicht ableitbar, nur nachlesbar –
sie stehen in der Image-Dokumentation unter *Environment Variables*.

**Learning:** *Primärquelle finden statt raten.* Im Backend hängt vieles von Konventionen ab, die
andere festgelegt haben: Variablennamen, Pfade, Optionen, Statuscodes. Wer rät, verliert Zeit und
gewöhnt sich an, Halbwissen für Wissen zu halten.

Nützlicher Trick, den ich mitgenommen habe: Ein Image kann sich selbst erklären. `docker run --rm
postgres:18-alpine` startet, scheitert an der fehlenden Pflichtvariable und schreibt in die Logs,
was es erwartet.

---

## 2026-08-08 – Drei Sackgassen bei Prisma 7

**Kontext:** Prisma 7 ist eine junge Hauptversion. Drei Dinge verhalten sich anders als in jeder
Anleitung, die man im Netz findet – jedes Mal war die Fehlermeldung selbst die Lösung.

**1. `.env` wird nicht mehr automatisch geladen.**
Prisma 7 liest keine `.env`-Dateien mehr von sich aus. Die Datei wird explizit in `prisma.config.ts`
geladen – bei uns zeigend auf die Wurzel-`.env`, damit Docker Compose, das ConfigModule und Prisma
dieselbe Quelle nutzen.

**2. Der generierte Client war ESM, NestJS kompiliert nach CommonJS.**
Fehlerbild: `SyntaxError: Cannot use 'import.meta' outside a module`, danach
`Cannot find module './internal/class.js'`. Gelöst über zwei Generator-Optionen im Schema:
`moduleFormat = "cjs"` und `importFileExtension = ""`.

**3. Der Query-Compiler wird als WASM per dynamischem Import geladen.**
Fehlerbild: `A dynamic import callback was invoked without --experimental-vm-modules`. Betrifft nur
Jest – im echten Node-Prozess funktioniert es. Der Fix gehört deshalb ins Test-Skript
(`NODE_OPTIONS=--experimental-vm-modules` über `cross-env`), **nicht** in den Anwendungscode.

**Learnings:**

1. **Wo der Fehler auftritt, ist nicht zwingend, wo der Fix hingehört.** Punkt 3 war ein reines
   Testlaufzeit-Problem. Wer ihn im Anwendungscode „behebt", verbiegt die Anwendung für das
   Werkzeug.
2. **Bei neuen Hauptversionen ist die Suchmaschine gefährlicher als die Fehlermeldung.** Fast alle
   Treffer im Netz beschrieben Prisma 6 – die Lösungen dort funktionieren nicht mehr. Die
   Fehlermeldungen und der generierte Code selbst waren die verlässliche Quelle.
3. **Generierten Code lesen ist erlaubt.** Die Antwort auf „wie übergebe ich die Verbindung?" stand
   als Beispiel im Kommentar des generierten Clients.

---

## 2026-08-08 – TS1272: `import type` bei dekorierten Signaturen

**Symptom:** Der Build brach ab mit
`TS1272: A type referenced in a decorated signature must be imported with 'import type'`.

**Ursache:** `emitDecoratorMetadata` schreibt die Typen dekorierter Methoden als **Laufzeit**-Metadaten
ins JavaScript. Ein `interface` existiert zur Laufzeit aber nicht. Mit `isolatedModules` kompiliert
TypeScript jede Datei einzeln und kann nicht erkennen, ob ein Import ein Typ oder ein Wert ist –
also muss man es hinschreiben: `import type { HealthStatus } from './health.service';`

**Learning:** Der Fehler wirkte auf den ersten Blick wie Compiler-Schikane, hing aber direkt an dem
Mechanismus, über den NestJS überhaupt weiß, was es injizieren muss. Fehlermeldungen, die man nicht
versteht, decken oft genau die Konzepte auf, die man noch nicht verstanden hat.

---

## 2026-08-09 – Push und Merge verkettet, PR mit veraltetem Stand gemergt

**Symptom:** Nach `git push` und `gh pr merge --rebase --delete-branch` fehlten auf `main` die
letzten beiden Commits. Im Arbeitsverzeichnis war die gesamte Prisma-Integration verschwunden – die
Dateien standen wieder auf dem Stand davor.

**Ursache:** Beide Befehle liefen in einem einzigen Block ohne Prüfung dazwischen. GitHub hat den
Pull Request mit dem Stand gemergt, den es zu diesem Zeitpunkt kannte – ohne die frisch gepushten
Commits. `--delete-branch` hat den Branch anschließend entfernt, samt der beiden Commits, die nur
dort hingen.

**Behebung:**

```bash
git reflog                                  # Commits gefunden: d93ad36, 28402ee
git switch -c feat/prisma-health            # neuer Branch von main
git cherry-pick d93ad36 28402ee             # Commits uebertragen
npm run build; npm test; npm run test:e2e   # verifiziert
git push -u origin feat/prisma-health
git log --oneline origin/feat/prisma-health # Push geprueft
gh pr view 3 --json headRefOid              # PR-Kopf mit lokalem Stand verglichen
gh pr merge 3 --rebase --delete-branch
git log --oneline -3                        # Ergebnis geprueft
```

**Learnings:**

1. **Push und Merge nie verketten.** Zwischen beiden gehört eine Prüfung: Zeigt der PR wirklich auf
   den Commit, den ich meine? `gh pr view <nr> --json headRefOid` beantwortet das in einer Sekunde.
2. **Zwischen jedem unumkehrbaren Schritt verifizieren.** Es ist derselbe Reflex wie bei
   `docker compose ps` – nicht annehmen, nachsehen. Nur ist der Preis hier höher, weil
   `--delete-branch` den Sicherheitsgurt entfernt.
3. **Nichts ist verloren, solange der Reflog existiert.** Git protokolliert jede Bewegung von `HEAD`.
   Commits ohne Branch verschwinden nicht sofort, sondern werden erst nach Wochen von der
   Garbage Collection abgeräumt. `git reflog` ist der erste Griff, wenn Arbeit „weg" ist – nicht
   Panik und nicht Neuschreiben.
4. **`cherry-pick` überträgt einzelne Commits** auf einen anderen Branch. Hier ideal: Die Inhalte des
   Ziel-Branches waren identisch, deshalb ließen sich beide Commits konfliktfrei aufsetzen.
5. **Automatisierung ersetzt kein Nachsehen.** Mehrere Befehle in einem Block sparen Sekunden und
   kosten im Fehlerfall Stunden. Bei allem, was auf einem Server oder Remote wirkt, gilt: ein
   Schritt, eine Prüfung.

---

## 2026-08-10 – Middleware in `main.ts` statt im Modul

**Symptom:** Vier E2E-Tests für den Refresh-Endpoint schlugen mit `401` statt `200` fehl. Von Hand
über den laufenden Server funktionierte alles einwandfrei.

**Ursache:** `app.use(cookieParser())` stand in `main.ts`. E2E-Tests bauen die Anwendung aber mit
`Test.createTestingModule()` **direkt aus dem Modul** – `bootstrap()` läuft dabei nie. Ohne
`cookieParser` blieb `request.cookies` leer, der Controller bekam `undefined` und antwortete
korrekt mit 401.

**Behebung:** `AppModule` implementiert `NestModule` und registriert die Middleware in `configure()`.
Damit gilt sie für die echte Anwendung *und* für jeden Test.

```ts
configure(consumer: MiddlewareConsumer): void {
  consumer.apply(cookieParser()).forRoutes('{*splat}');
}
```

**Learnings:**

1. **In `main.ts` gehört nur, was den PROZESS betrifft** – Port, Logger, Shutdown-Hooks. Alles, was
   die **Anwendung** ausmacht, gehört ins Modul. Sonst testet man eine andere Anwendung als die, die
   später läuft.
2. **Der Test hatte recht.** Der erste Reflex war, den Test für kaputt zu halten, weil es „von Hand
   ja funktioniert". Tatsächlich war die Anwendung falsch zusammengebaut – und der Test hat genau
   den Unterschied zwischen Test- und Produktionsaufbau aufgedeckt, für den es ihn gibt.
3. **Express 5 hat die Wildcard-Schreibweise geändert:** `'*'` wurde zu `'{*splat}'`. NestJS 11
   verwendet Express 5 – ältere Beispiele im Netz funktionieren nicht mehr. Wieder ein Fall von
   „Hauptversion ändert Konventionen, nicht nur Funktionen".

---

## 2026-08-10 – Zwei Fehler, gefunden von den ersten Frontend-Tests

Die Frontend-Tests waren keine halbe Stunde alt, als sie zwei echte Defekte aufdeckten – beide in
Code, der von Hand ausprobiert einwandfrei funktioniert hatte.

### Fehler 1: `finally` statt `catch` beim Abmelden

**Ursprünglich:**

```ts
try   { await api('/auth/logout', { method: 'POST' }); }
finally { verwerfe(); }
```

**Symptom:** Der Test „meldet auch dann lokal ab, wenn der Server nicht erreichbar ist" schlug mit
`TypeError: Failed to fetch` fehl.

**Ursache:** `finally` räumt zwar lokal auf, **lässt den Fehler aber weiterfliegen**. Im Dashboard
steht danach `router.replace('/login')` – diese Zeile wurde nie erreicht. Bei nicht erreichbarem
Server wäre der Nutzer lokal abgemeldet, bliebe aber auf der geschützten Seite stehen. Dazu eine
unbehandelte Promise-Ablehnung in der Konsole.

**Behebung:** `catch` statt `finally` – ein fehlgeschlagener Serveraufruf darf das Abmelden nicht
verhindern.

**Learning:** `finally` bedeutet „führe das auch im Fehlerfall aus", **nicht** „schlucke den
Fehler". Ein häufiger Irrtum, weil beides oft gleich aussieht – bis jemand den Rückgabewert
weiterverwendet.

### Fehler 2: Fehlermeldung im `<label>` verfälscht den Feldnamen

**Symptom:** `getByLabelText('E-Mail')` fand das Feld nicht mehr, **sobald ein Fehler angezeigt
wurde** – in allen anderen Tests derselben Datei aber schon.

**Ursache:** Die Komponente umschloss Beschriftung, Eingabefeld und Fehlermeldung mit einem
gemeinsamen `<label>`. Der **zugängliche Name** eines Feldes ist der gesamte Textinhalt seines
Labels – also hieß das Feld plötzlich „E-Mail Bitte eine gueltige E-Mail-Adresse angeben". Genau das
liest ein Screenreader als Feldnamen vor.

**Behebung:** Trennung der Zuständigkeiten:

| Attribut | Aufgabe |
|---|---|
| `htmlFor` / `id` | verbindet Label und Feld → der **Name** |
| `aria-describedby` | verbindet Fehler und Feld → die **Beschreibung** |
| `aria-invalid` | markiert den Fehlerzustand |

**Learnings:**

1. **Testing Library fragt so ab, wie ein Screenreader liest.** Dass die Abfrage fehlschlug, war
   kein Test-Problem, sondern die korrekte Meldung eines Zugänglichkeitsfehlers. Wer solche Tests
   mit `getByTestId` „repariert", schaltet genau diese Warnung ab.
2. **Zugänglichkeit ist testbar** – und zwar nebenbei, ohne eigenes Werkzeug.
3. **Beide Fehler waren von Hand nicht auffindbar.** Der erste braucht einen nicht erreichbaren
   Server, der zweite einen Screenreader. Genau dafür gibt es automatisierte Tests: für die Fälle,
   die man beim Ausprobieren nicht herstellt.

---

## 2026-08-11 – `ConfigModule.forRoot()` wird beim Import ausgewertet

**Symptom:** Nach Einführung des Rate Limitings schlugen zwölf E2E-Tests mit `429 Too Many Requests`
fehl – die Suite meldet sich dutzendfach an und sperrte sich selbst aus. Der naheliegende Versuch,
das Limit im Test abzuschalten, wirkte nicht:

```ts
beforeAll(async () => {
  process.env.THROTTLE_LIMIT = '0';        // wirkungslos
  const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
```

**Ursache:** `ConfigModule.forRoot({...})` steht als Argument im `@Module`-Decorator. Dieses Argument
wird ausgewertet, **sobald `app.module.ts` importiert wird** – also beim Laden der Testdatei, lange
bevor `beforeAll` läuft. Jede Zuweisung an `process.env` dort kommt grundsätzlich zu spät.

**Zweiter Fehlversuch:** `overrideGuard(ThrottlerGuard)`. Wirkt ebenfalls nicht – über `APP_GUARD`
registrierte Guards hängen am Token `APP_GUARD`, nicht an ihrer eigenen Klasse.

**Behebung:** Die garantierte Reihenfolge von Import-Nebenwirkungen ausnutzen. Das npm-Skript für
E2E setzt `THROTTLE_LIMIT=0`; die eine Datei, die das Limit prüfen will, importiert vorher ein
Modul, das den Wert wieder hochsetzt:

```ts
import './aktiviere-throttling';              // setzt process.env, läuft zuerst
import { AppModule } from '../src/app.module';
```

**Learnings:**

1. **Decorator-Argumente laufen beim Import, nicht beim Instanziieren.** Das gilt für jedes
   `forRoot()` in einem `@Module`. Wer Konfiguration im Test ändern will, muss vor dem Import daran
   sein – oder das Modul dynamisch laden.
2. **Import-Reihenfolge ist eine Zusicherung, keine Kosmetik.** Ein Import allein für seine
   Nebenwirkung sieht ungewöhnlich aus und braucht deshalb einen Kommentar, der erklärt, warum er
   ganz oben stehen muss.
3. **Zustandsbehaftete Tests sind nicht beliebig umsortierbar.** Der Zähler des Rate Limiters liegt
   im Arbeitsspeicher; die Tests, die ihn aufbrauchen, mussten ans Ende der Datei. Und die
   Erwartungen dürfen nicht auf einem unberührten Zähler beruhen – geprüft wird die **Aussage**
   („irgendwann kommt 429, und dann bleibt es dabei"), nicht die Buchhaltung.
4. **Zwei der Fehlschläge waren falsche Erwartungen, kein Codefehler.** Ein Test, der etwas prüft,
   das der Code bewusst nicht tut (hier: E-Mail-Format beim Login), ist selbst der Fehler.

---

## 2026-08-11 – Der Prisma-Client war nach der Migration veraltet

**Situation:** Nach `npm run db:migrate` für die Tabellen `organizations` und `memberships` meldete
Prisma „Your database is now in sync with your schema." Lint, 83 Unit-Tests, 48 E2E-Tests und der
Build liefen grün durch. Alles sah fertig aus.

**Der Fehler:** Der generierte Client kannte die neuen Modelle **nicht**. In
`src/generated/prisma/enums.ts` stand weiterhin:

```ts
// This file is empty because there are no enums in the schema.
export {}
```

Und `src/generated/prisma/models/` enthielt nur `User.ts` und `RefreshToken.ts`.

**Warum es niemandem aufgefallen wäre:** Weil noch kein einziger Codepfad `Role` oder
`prisma.organization` benutzte. Der Compiler hatte nichts zu prüfen, die Tests nichts auszuführen.
Der Fehler wäre erst in der nächsten Scheibe aufgeschlagen – als „`Property 'organization' does not
exist`", also mit einer Meldung, die auf das Schema zeigt, obwohl das Schema korrekt war. Genau die
Sorte Fehlersuche, die eine Stunde frisst.

**Behebung:** `npm run db:generate`. Danach waren `Role`, `Organization.ts` und `Membership.ts` da.

**Learnings:**

1. **„Datenbank ist in sync" heißt nicht „Client ist in sync".** Das sind zwei Artefakte:
   das Schema in PostgreSQL und der generierte TypeScript-Client. Eine Migration bringt zwingend
   nur das erste auf Stand.
2. **Eine grüne Testsuite beweist nur, was sie berührt.** Kein Test schlug fehl, weil kein Test
   die neuen Modelle benutzte. Grün heißt „nichts Bekanntes kaputt", nicht „alles in Ordnung".
3. **Verifiziert wird am Artefakt, nicht an der Erfolgsmeldung.** Ein `grep` nach `OWNER` im
   generierten Verzeichnis hat die Frage in zwei Sekunden beantwortet. Der Werkzeug-Output war
   nicht falsch – er beantwortete nur eine andere Frage als die, die ich hatte.
4. **In der CI konnte das nicht auffallen.** `src/generated/` ist gitignored, die Pipeline generiert
   den Client bei jedem Lauf neu. Der veraltete Stand existierte ausschließlich lokal – eine
   Fehlerklasse, die sich strukturell nur auf dem eigenen Rechner zeigt.
