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

---

## 2026-08-11 – Ein Nebenläufigkeitstest, der nichts bewacht hat

**Situation:** Scheibe 2.4 schützt die letzte `OWNER`-Mitgliedschaft. Das Muster ist *lesen,
entscheiden, schreiben* – und damit angreifbar durch zwei gleichzeitige Anfragen:

```
A: zählt OWNER → 2 → "einer darf weg" → entfernt sich
B: zählt OWNER → 2 → "einer darf weg" → entfernt sich
```

Beide in einer Transaktion, beide atomar, danach **null** Eigentümer. Gelöst mit
`SELECT … FOR UPDATE` auf der Organisationszeile.

Dazu ein E2E-Test: zwei `OWNER` verlassen gleichzeitig per `Promise.all`, danach muss genau einer
übrig sein. Grün. Sah nach einem soliden Nachweis aus.

**Der Fehler:** Die Gegenprobe. Sperre entfernt, Test dreimal gelaufen – **jedes Mal grün**.

Der Test belegte gar nichts. Zwei Anfragen über HTTP verschränken sich nur selten so eng, dass
beide ihre Zählung abschließen, bevor die andere schreibt. Jede Anfrage durchläuft Guard,
Controller, mehrere Datenbankrunden; das Zeitfenster für die Kollision ist winzig. Die Race
Condition ist **echt** – über diesen Weg nur nicht zuverlässig auslösbar.

Hätte ich nicht gegengeprüft, stünde jetzt im Repository ein Test mit dem Namen
„laesst bei zwei gleichzeitigen Austritten genau einen OWNER uebrig", der beim Entfernen des
Schutzes weiter grün leuchtet. Das ist schlimmer als kein Test: Er hätte künftige Änderungen
abgesegnet, die die Sperre entfernen.

**Behebung:** Zweiter Test, der den Konflikt **erzwingt** statt auf Zufall zu hoffen. Eine eigene
Transaktion nimmt die Sperre und hält sie 500 ms. Nimmt der Endpoint dieselbe Sperre, *muss* er
warten – gemessen wird die Dauer seiner Antwort.

Gegenprobe dazu: ohne `FOR UPDATE` antwortet er nach **60 ms** statt nach über 300 – der Test wird
rot. Erst damit bewacht er etwas.

Der ursprüngliche Test bleibt, aber mit ehrlichem Kommentar: Er sichert die **Invariante** („es
bleibt ein `OWNER`"), er beweist nicht die Sperre.

**Learnings:**

1. **Ein Test, der mit und ohne den Schutz grün ist, bewacht ihn nicht.** Das lässt sich nicht
   ansehen – man muss es ausprobieren. Eine Mutationsprobe kostet zwei Minuten.
2. **Nebenläufigkeit lässt sich nicht durch „gleichzeitig aufrufen" testen.** `Promise.all` erzeugt
   keine Verschränkung, es erzeugt nur die Möglichkeit einer. Wer einen Race verlässlich prüfen
   will, muss ihn **erzwingen** – durch eine gehaltene Sperre, eine künstliche Pause an der
   kritischen Stelle oder einen Test direkt auf der Datenbankebene.
3. **Ein grüner Test kann gefährlicher sein als gar keiner.** Er erzeugt Vertrauen, das durch
   nichts gedeckt ist, und segnet spätere Änderungen ab.
4. **Zeitmessungen in Tests sind vertretbar, wenn die Größenordnungen weit auseinanderliegen.**
   Hier: „sofort" (60 ms) gegen „hat eine halbe Sekunde gewartet". Brüchig wäre eine Messung, die
   prüft, ob etwas *schnell genug* ist.

---

## 2026-08-11 – `setState` im Effekt, vom React-Compiler abgefangen

**Situation:** Die zuletzt gewählte Organisation soll in `localStorage` überleben. Erste Fassung –
der Reflex aus React 18:

```ts
const [gemerkteId, setGemerkteId] = useState<string | null>(null);

useEffect(() => {
  setGemerkteId(window.localStorage.getItem(SCHLUESSEL));
}, []);
```

Tests grün, Build grün. `npm run lint:ci` nicht:

```
Avoid calling setState() directly within an effect   react-hooks/set-state-in-effect
```

**Warum die Regel recht hat:** Die Komponente rendert **zweimal** – einmal mit `null`, dann mit dem
echten Wert. Sichtbar wird das als kurzes Flackern: Erst ist keine Organisation aktiv, einen
Frame später die richtige. Bei einem Wert, der die Anzeige steuert, ist das ein echter Fehler und
keine Stilfrage.

**Die eigentliche Erkenntnis:** `localStorage` ist ein **externer Speicher**. Er liegt außerhalb von
React, ändert sich ohne dessen Zutun – auch aus einem *anderen Browser-Tab* – und existiert beim
serverseitigen Rendern überhaupt nicht. Für genau diesen Fall gibt es `useSyncExternalStore`:

```ts
const gemerkteId = useSyncExternalStore(abonniere, leseImBrowser, leseAufServer);
```

Drei Argumente, und jedes beantwortet eine Frage, die die `useEffect`-Variante offengelassen hatte:

| Argument | Frage |
|---|---|
| `abonniere` | Woher erfahre ich von Änderungen? (auch aus anderen Tabs) |
| `leseImBrowser` | Was ist der aktuelle Wert? |
| `leseAufServer` | Was gilt, wenn es kein `window` gibt? |

Das dritte ist der Grund, warum es den Haken gibt: Es *zwingt* dazu, den Serverfall zu beantworten,
statt dort abzustürzen oder unterschiedliches Markup zu erzeugen.

**Nebenbei gefunden:** `localStorage.setItem` löst im **eigenen** Tab kein `storage`-Ereignis aus,
nur in den anderen. Ohne eigene Benachrichtigung hätte sich der Speicher geändert und die Oberfläche
wäre stehen geblieben – ein Fehler, den die `useEffect`-Variante gar nicht erst sichtbar gemacht
hätte, weil sie ohnehin nur einmal beim Aufbau liest.

**Learnings:**

1. **Eine Lint-Regel, die man nicht versteht, ist ein Hinweis – keine Schikane.** Der schnelle
   Ausweg wäre `// eslint-disable-next-line` gewesen. Die Regel hat auf ein doppeltes Rendern und
   auf den falschen Haken gezeigt.
2. **Nicht jeder Zustand gehört in `useState`.** Wer Daten aus einer Quelle liest, die React nicht
   gehört – `localStorage`, `matchMedia`, ein WebSocket, `navigator.onLine` –, braucht
   `useSyncExternalStore`.
3. **Der React-Compiler in Next 16 prüft schärfer als React 18.** Muster, die jahrelang üblich
   waren, sind jetzt Fehler. Das ist der Grund, warum in `frontend/AGENTS.md` steht, vor dem
   Schreiben die mitgelieferte Doku zu lesen statt aus dem Gedächtnis zu arbeiten.
4. **Lint lief nach den Tests.** Grüne Tests und ein grüner Build haben den Fehler nicht bemerkt –
   er war kein Fehlverhalten, sondern ein Muster mit absehbaren Folgen. Genau dafür gibt es
   statische Analyse neben Tests.

---

## 2026-08-11 – Doppelte Token-Erneuerung: der Fehler, den keine Testsuite gefunden hat

**Situation:** Nach Abschluss von Scheibe 2.7 wurde die Anwendung zum ersten Mal seit Sprint 1
tatsächlich **gestartet**. 155 Tests grün, CI grün, alle Scheiben gemergt. Ein Blick in die
Netzwerkansicht bei einem einfachen Seitenneuladen:

```
POST /auth/refresh → 200 OK
POST /auth/refresh → 200 OK
```

**Zwei Erneuerungen für einen Seitenaufruf.** Bestätigt in der Datenbank:

```
createdAt                | widerrufen
2026-08-11 12:06:56.628  | f
2026-08-11 12:06:56.638  | f     ← zehn Millisekunden später
```

Zwei **gleichzeitig gültige** Refresh-Token in derselben Familie. Das Cookie hält nur einen davon –
der andere ist eine Waise, 30 Tage lang gültig, ohne Besitzer. Genau das, was Rotation verhindern
soll.

**Warum das kein Schönheitsfehler ist:** Je nach Zeitablauf gibt es zwei Ausgänge.

| Ablauf | Folge |
|---|---|
| **parallel** | Beide lesen den Token, bevor der andere ihn entwertet. Zwei neue Token, einer verwaist. |
| **versetzt** | Der zweite legt den bereits entwerteten Token vor → Wiederverwendungs-Erkennung → **die ganze Familie wird widerrufen** → der Nutzer fliegt aus der Sitzung. |

Der zweite Fall ist im Verlauf dieser Sitzung **tatsächlich eingetreten**: Nach einigen Neuladungen
waren alle zehn Token der Familie widerrufen, und die Anmeldung war weg – ohne dass jemand etwas
falsch gemacht hatte.

**Ursache:** `erneuere()` in `auth-context.tsx` fasste gleichzeitige Aufrufe nicht zusammen. Jeder
Aufrufer schickte seine eigene Anfrage.

Sichtbar gemacht hat es der StrictMode von Next im Entwicklungsmodus, der Effekte doppelt ausführt.
**Das ist aber nur der Auslöser, nicht die Ursache.** In Produktion genügt: zwei parallele Abfragen
laufen gleichzeitig in ein `401` und rufen beide `erneuere()`. Oder der Nutzer öffnet zwei Tabs.
Mit dem Ausbau in Sprint 3 (Board lädt Projekte, Tasks und Mitglieder gleichzeitig) wäre es
zwangsläufig aufgetreten.

**Behebung – Single Flight:** Der erste Aufrufer startet die Anfrage, alle weiteren bekommen
**dasselbe Promise** und warten mit.

```ts
const laufendeErneuerung = useRef<Promise<boolean> | null>(null);

const erneuere = useCallback(async () => {
  if (laufendeErneuerung.current) return laufendeErneuerung.current;

  const versuch = (async () => { /* … */ })();
  laufendeErneuerung.current = versuch;

  try {
    return await versuch;
  } finally {
    laufendeErneuerung.current = null;   // ohne das bliebe es für immer stehen
  }
}, [uebernehme, verwerfe]);
```

Nachgewiesen auf drei Wegen: neuer Unit-Test (zwei parallele `authFetch` → **eine** Erneuerung),
Gegenprobe (Zusammenfassung entfernt → Test rot), und in der laufenden Anwendung – nach der Korrektur
genau ein Token pro Neuladen statt zwei.

**Learnings:**

1. **Eine grüne Testsuite ist kein Ersatz dafür, die Anwendung zu benutzen.** 155 Tests, und keiner
   konnte diesen Fehler finden: Er entsteht aus dem *Zusammenspiel* von React-Lebenszyklus,
   Netzwerk-Zeitverhalten und einer serverseitigen Sicherheitsfunktion. Jeder Teil für sich war
   korrekt und getestet.
2. **Ein Sicherheitsmechanismus kann zur Ausfallursache werden.** Die Wiederverwendungs-Erkennung
   ist richtig und bleibt. Aber wer sie einbaut, übernimmt die Pflicht, **jeden** Weg zu prüfen, auf
   dem ein Token zweimal vorgelegt werden könnte – auch die harmlosen.
3. **Jede Operation, die einen Zustand rotiert, braucht Single Flight.** Token erneuern, ein Gerät
   registrieren, eine Sitzung aufbauen: Sobald der Aufruf beim zweiten Mal ein *anderes* Ergebnis
   hat als beim ersten, darf er nicht parallel laufen.
4. **Der Entwicklungsmodus ist ein Werkzeug, kein Störenfried.** Der doppelte Effektaufruf im
   StrictMode ist genau dafür da, solche Annahmen aufzudecken. Der bequeme Weg wäre gewesen, ihn
   abzuschalten – und den Fehler in Produktion zu erleben.
5. **Netzwerkansicht und Datenbank sind Diagnosewerkzeuge.** Die Oberfläche sah einwandfrei aus. Der
   Beweis stand in zwei Zeilen SQL.

---

## 2026-08-12 – Derselbe veraltete Prisma-Client, ein Sprint später

**Situation:** Scheibe 3.1 legte `Project` und `Task` an, die Migration lief sauber durch
(„Your database is now in sync with your schema."). In Scheibe 3.2 meldete ESLint dann 39 Fehler
der Sorte *„Unsafe member access `.create` on a type that cannot be resolved"* – der generierte
Client kannte `prisma.project` nicht.

**Das Ärgerliche:** Genau dieser Fehler steht seit dem 11.08. in dieser Datei. Die Lehre war
notiert, die Konsequenz nicht gezogen.

**Behebung:** `npm run db:generate`, danach alles grün.

**Warum es diesmal passierte:** Der erste `migrate dev`-Aufruf lief in eine Zeitüberschreitung und
wurde abgebrochen; der zweite legte die Migration an und meldete Erfolg, ohne dass eine Zeile über
die Client-Erzeugung in der Ausgabe stand. Die genaue Ursache ist nicht abschließend geklärt – und
das ist der Punkt: Sie muss es auch nicht sein, wenn die Prüfung nicht am Werkzeug-Output hängt.

**Learnings:**

1. **Eine notierte Lehre ist keine umgesetzte Lehre.** Der Eintrag vom 11.08. endet mit „verifiziert
   wird am Artefakt". Getan hat das niemand, weil nichts daran erinnert hat. Ein Learning, das nur
   in einer Datei steht, wirkt beim zweiten Mal genauso wenig wie beim ersten.
2. **Wiederholte Fehler sind ein Prozessproblem, kein Wissensproblem.** Die richtige Antwort ist
   nicht „besser aufpassen", sondern die Schritte zusammenzubinden, die zusammengehören: Migration
   und Client-Erzeugung sind ein Vorgang, nicht zwei. Als Konsequenz vorgemerkt in `06_BACKLOG.md`.
3. **Immerhin hat der Fehler diesmal früh und laut geschlagen** – beim ersten Codepfad, der die
   neuen Modelle benutzt, mit 39 Meldungen statt einer stillen Fehlfunktion. Ein Fehler, den das
   Typsystem findet, ist der billigste, den es gibt.

---

## 2026-08-12 – Eine Mutationsprobe, die sich selbst überführt hat

**Situation:** Nachweis, dass der Mandantenfilter in `ProjectsService.findeEines` bewacht ist:
`organizationId` aus der `WHERE`-Bedingung entfernt, Tests laufen lassen. Ergebnis: **alle 17 Tests
der Datei rot.**

**Der Denkfehler, der beinahe passiert wäre:** Das als Erfolg zu verbuchen. Es sah nach einem sehr
wirksam bewachten Schutz aus – tatsächlich war die Probe kaputt.

**Die Ursache:** Aufgerufen wurde `npx jest --config ./test/jest-e2e.json` statt
`npm run test:e2e`. Das npm-Skript setzt `THROTTLE_LIMIT=0`; ohne diese Variable lief das Rate
Limiting mit und wies bereits die Registrierungen im Testaufbau ab. Die Tests scheiterten **vor**
der Stelle, um die es ging.

**Mit der richtigen Umgebung:** genau ein E2E-Test und ein Unit-Test rot – die beiden, die den
Mandantenfilter prüfen. Das ist der Nachweis.

**Learnings:**

1. **Ein zu breites Rot ist genauso verdächtig wie ein ausbleibendes.** Beide bedeuten, dass der
   Test etwas anderes misst als angenommen. Bei einer Mutationsprobe gehört deshalb zur Auswertung
   nicht nur „wurde etwas rot", sondern „**wurde genau das rot, was ich erwartet habe**".
2. **npm-Skripte sind Teil der Testumgebung, nicht nur Tipparbeit.** Was in `package.json` an
   Umgebungsvariablen steht, gehört zum Testaufbau. Das Werkzeug direkt aufzurufen heißt, einen
   anderen Test zu fahren als die CI.
3. **Die Probe selbst braucht eine Erwartung, bevor sie läuft.** „Ich erwarte, dass Test X und Y rot
   werden" vorher aufzuschreiben, macht den Unterschied zwischen einem Nachweis und einem Gefühl.

---

## 2026-08-13 – `decimal.js` rundet bei 20 Stellen, die Spalte fasst 30

**Situation:** Scheibe 3.3, die Positionsberechnung. Die Spalte ist `numeric(65,30)` – ausdrücklich
so gewählt, weil `float8` nach etwa 50 Halbierungen die Genauigkeit verliert. Ein Unit-Test sollte
nachweisen, dass exakt gerechnet wird:

```ts
new Prisma.Decimal('0.000000000000000000000000000001').plus(1000)
```

**Erwartet:** `1000.000000000000000000000000000001`
**Bekommen:** `1000`

**Die Ursache:** Prisma bringt `decimal.js` mit, und dessen Voreinstellung ist `precision: 20` –
zwanzig **signifikante** Stellen. Die Rechnung rundete also, bevor die Datenbank überhaupt gefragt
wurde.

**Warum das besonders bitter gewesen wäre:** Genau der Präzisionsverlust, gegen den `numeric`
gewählt wurde – nur eine Schicht höher. Die Datenbank hätte den Wert halten können; es kam nur nie
einer an. Und sichtbar geworden wäre es erst nach etwa 20 Verschiebungen an dieselbe Stelle, also
frühestens beim echten Benutzen des Boards, vermutlich als „die Karte springt zurück".

**Behebung:** Ein eigener Decimal-Typ mit `Prisma.Decimal.clone({ precision: 80 })`. `clone()` statt
`Decimal.set()`, weil ein `set` beim Laden der Datei **jeden** Decimal im Prozess umkonfiguriert
hätte – eine Fernwirkung, die niemand vermutet, der diese eine Datei nicht kennt.

Zusätzlich muss der von Prisma **gelesene** Wert umhüllt werden (`new Genau(zeile.position)`): Er
kommt mit der Voreinstellung zurück, und `decimal.js` übernimmt bei einer Rechnung die Einstellung
des linken Operanden.

**Learnings:**

1. **Eine Entscheidung in der Datenbank gilt nicht automatisch im Code.** `numeric(65,30)` in
   PostgreSQL und `precision: 20` in der Bibliothek sind zwei getrennte Einstellungen, die niemand
   gegeneinander prüft. Wer sich für Genauigkeit entscheidet, muss die **ganze Kette** prüfen:
   Spalte, Treiber, Rechenbibliothek, Serialisierung.
2. **Voreinstellungen von Bibliotheken sind Annahmen über einen Anwendungsfall, der nicht meiner
   sein muss.** 20 Stellen sind für Geldbeträge großzügig und für fractional indexing zu wenig.
3. **Der Test hat ihn gefunden, weil er einen Grenzfall geprüft hat, nicht den Normalfall.**
   `1000 + 1000 = 2000` wäre grün geblieben – und der Fehler hätte bis ins Board überlebt.
4. **Ein Wert wandert über mehrere Schichten.** Deshalb steht in `tasks.e2e-spec.ts` zusätzlich ein
   Test, der die Genauigkeit über den *gesamten* Weg prüft: PostgreSQL → Prisma → Service → JSON →
   Testcode. Der Unit-Test allein hätte eine gerundete JSON-Serialisierung nicht bemerkt.

---

## 2026-08-13 – Die siebte Testsuite hat die sechste gelöscht

**Situation:** Nach dem Hinzufügen von `tasks.e2e-spec.ts` schlug ein Test in
`organizations.e2e-spec.ts` fehl – einer Datei, die in dieser Scheibe niemand angefasst hatte:

```
Foreign key constraint violated on the constraint: `memberships_userId_fkey`
```

Also: eine Mitgliedschaft für einen Nutzer, den es nicht mehr gab – **mitten im Testlauf**.

**Die Ursache:** Jede E2E-Suite trennt ihre Testdaten über eine Kennung, und die war überall
`Date.now()`. Aufgeräumt wird am Ende mit `email: { contains: '-<kennung>@' }` – ein Filter, der
**nicht** nach der Suite unterscheidet. Starten zwei Suiten in derselben Millisekunde, löscht das
Aufräumen der einen die Testdaten der anderen, während diese noch läuft.

Mit vier Suiten war das unwahrscheinlich genug, um nie aufzufallen. Mit sieben parallel startenden
Suiten wurde es zum realen Fall.

**Behebung:** `` `${Date.now()}-${randomUUID().slice(0, 8)}` `` in **allen** sechs Suiten – nicht
nur in den neuen. Eine Kollision setzt jetzt denselben Zeitstempel *und* dieselben acht Hex-Zeichen
voraus.

**Learnings:**

1. **Eine Testisolierung, die auf Zeit beruht, ist keine Isolierung.** Sie ist eine Wette auf die
   Auflösung der Uhr – und die Wette wird schlechter, je mehr Suiten parallel starten. Eindeutigkeit
   muss man erzeugen, nicht ableiten.
2. **Der Fehler zeigte sich in der Datei, die ihn nicht verursacht hat.** Das ist typisch für
   gemeinsam genutzten Zustand: Die Symptomstelle und die Ursache liegen auseinander. Wer nur die
   fehlgeschlagene Datei ansieht, sucht am falschen Ort.
3. **Behoben wurde die Klasse, nicht der Fall.** Nur die beiden neuen Dateien anzupassen, hätte
   dieselbe Kollision zwischen den vier alten weiterhin zugelassen – seltener, aber genauso
   möglich.
4. **Der Zufallsfehler kam während einer Mutationsprobe** und hat sich fast als „Schutz wirkt breit"
   getarnt. Die vorher notierte Erwartung („genau diese zwei Tests werden rot") hat ihn als das
   entlarvt, was er war.
