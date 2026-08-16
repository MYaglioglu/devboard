# Testing

Warum getestet wird, steht in `17_MISTAKES_AND_LESSONS.md`: Eine frisch gelaunchte Live-Seite wurde
durch ein ungetestetes Plugin lahmgelegt. Tests, Staging und Pipeline sind in diesem Projekt keine
Kür.

---

## Die Testpyramide

```
      /\        E2E          wenige, langsam, hoher Realitaetsgrad
     /  \
    /    \      Integration  einige, mittelschnell
   /      \
  /________\    Unit         viele, schnell, isoliert
```

Die Form ist eine Empfehlung, keine Vorschrift: **viele schnelle, wenige langsame Tests.** Wer die
Pyramide umdreht (fast nur E2E), bekommt eine Suite, die zwanzig Minuten braucht und bei jeder
Kleinigkeit rot wird, ohne die Ursache zu benennen.

| Art | Was geprüft wird | Abhängigkeiten | Laufzeit |
|---|---|---|---|
| **Unit** | eine Klasse isoliert | alle ersetzt (Attrappen) | Millisekunden |
| **Integration** | Zusammenspiel mehrerer Teile | teilweise echt | Sekunden |
| **E2E** | die laufende Anwendung über HTTP | echt | Sekunden bis Minuten |

---

## Aufbau im Projekt

```
backend/src/**/*.spec.ts     Unit-Tests, neben dem Code
backend/test/*.e2e-spec.ts   E2E-Tests
```

Unit-Tests liegen bewusst **neben** der getesteten Datei, nicht in einem separaten Testbaum. So
sieht man beim Öffnen eines Ordners sofort, ob es Tests gibt.

```bash
npm test           # Unit-Tests
npm run test:watch # im Watch-Modus waehrend der Entwicklung
npm run test:cov   # mit Abdeckungsbericht
npm run test:e2e   # E2E-Tests
```

---

## Warum Dependency Injection und Tests zusammenhängen

Der zentrale Punkt, an dem sich DI auszahlt:

```ts
{ provide: PrismaService, useValue: { isReachable } }
```

Der `HealthService` bekommt statt der echten Datenbank eine Attrappe. Folge: Der Test braucht keinen
Container, läuft in Millisekunden – und kann etwas prüfen, das mit echter Datenbank kaum herstellbar
wäre: **den Ausfall**. Genau dieser Fall („Datenbank down → Status degraded") ist im Betrieb der
interessante, und er ist nur mit einer Attrappe zuverlässig testbar.

Eine Klasse, die ihre Abhängigkeiten selbst erzeugt, lässt das nicht zu. Testbarkeit ist keine
Eigenschaft der Tests, sondern eine Eigenschaft des Designs.

---

## Was ein guter Test prüft

Nicht die Implementierung, sondern das **beobachtbare Verhalten**. Ein Test, der bei jedem Refactoring
bricht, obwohl das Verhalten gleich blieb, ist eine Belastung, kein Netz.

Nützliche Fragen beim Schreiben:
- Was passiert bei **fehlerhaften** Eingaben? (`validateEnv` lehnt `PORT: "dreitausend"` ab)
- Was passiert, wenn eine **Abhängigkeit ausfällt**? (Datenbank weg → `degraded`)
- Was passiert an den **Rändern**? (leer, null, negativ, doppelt)

Der Test `GET /` liefert 404 sieht albern aus, ist aber Absicht: Er hält fest, dass der
Hello-World-Endpoint **bewusst** entfernt wurde. Kommt er versehentlich zurück, schlägt der Test fehl.

Ab Sprint 2 kommt eine Kategorie dazu, die im Bewerbungsgespräch besonders zählt: Tests, die
**fehlgeschlagene** Zugriffe absichern – Zugriff auf eine fremde Organisation muss 403 oder 404
liefern. Sicherheitsverhalten muss getestet sein, sonst ist es nur eine Behauptung.

---

## Aktueller Stand

| Bereich | Tests |
|---|---|
| Backend, Unit | 98 |
| Backend, E2E (echte Datenbank) | 105 |
| Frontend, Komponenten und Hooks | 81 |
| **Gesamt** | **284** |

Alle laufen bei jedem Pull Request in der CI. Der Backend-Job startet dafür einen echten
PostgreSQL-Container.

---

## Negative Tests – ab Sprint 2 Pflicht

Ab der Mandantentrennung genügt es nicht mehr, den Erfolgspfad zu prüfen. Der Grund ist unangenehm
einfach:

> Der Test „ich lege etwas an, ich rufe es ab, es ist da" ist auch dann grün, wenn der
> Mandantenfilter **komplett fehlt**. Existiert im Test nur ein Nutzer, gehört ihm ohnehin alles.

Deshalb hat jede Scheibe von Sprint 2 Tests der Form: *Nutzer A legt an, Nutzer B fragt ab, B sieht
nichts.* Dazu gehören ausdrücklich die Statuscodes – `404` statt `403` bei fremder Organisation,
und die **wortgleiche Meldung** in beiden Fällen.

---

## Mutationsproben – der einzige Beweis, dass ein Test etwas bewacht

Ein grüner Test beweist, dass er läuft. Ob er etwas *schützt*, sieht man ihm nicht an. Der Nachweis
kostet zwei Minuten: **Schutz entfernen, Tests laufen lassen, Schutz zurückbauen.**

In Sprint 2 an jeder sicherheitsrelevanten Stelle durchgeführt:

| Entfernt | Rot geworden |
|---|---|
| `where: { userId }` in der Organisationsliste | 1 Unit, 3 E2E |
| Mandantenprüfung im `MitgliedschaftsGuard` | 1 Unit, 4 E2E |
| `organizationId` beim Zurückziehen einer Einladung | 1 E2E |
| `FOR UPDATE` auf der Organisationszeile | 1 E2E (60 ms statt 500 ms) |
| Open-Redirect-Prüfung | 5 Unit, 1 Seitentest |
| Single Flight bei der Token-Erneuerung | 1 Unit |

Sprint 3:

| Entfernt | Rot geworden |
|---|---|
| `organizationId` im `where` von `ProjectsService.findeEines` | 1 Unit, 1 E2E |
| `project: { organizationId }` im `where` von `TasksService.loesche` | 1 Unit, 1 E2E |
| `version` im `where` des Verschiebens (optimistisches Sperren) | 1 E2E |
| Die Neuverteilung bei erschöpfter Genauigkeit | 1 E2E |

Bei der zweiten Probe wurde die Erwartung **vorher** notiert („rot werden müssen der Unit-Test
*nimmt den Mandanten in die Löschbedingung auf* und der E2E-Test *löscht keine Aufgabe aus einem
fremden Projekt*"). Genau die beiden wurden es. Das ist der Unterschied zwischen einem Nachweis und
einem Gefühl – und es hat sich sofort ausgezahlt: Ein Zwischenlauf zeigte wieder *alle 21* Tests
rot, diesmal weil der Docker-Daemon nicht lief. Ohne vorher festgelegte Erwartung wäre das als
„Schutz wirkt sehr breit" durchgegangen.

Sprint 5:

| Entfernt | Rot geworden |
|---|---|
| `organizationId` aus den drei `where`-Bedingungen im `RepositoryConnectionsService` | 2 E2E, punktgenau |
| Die Signaturprüfung im `WebhookEmpfangService` | 4 E2E, punktgenau |

Bei der Signaturprüfung war die Erwartung ebenfalls **vorher** notiert: „Rot werden *ohne
Signatur*, *mit falscher Signatur*, *nachträglich veränderter Rumpf* und der `ping`-Test, dessen
zweite Hälfte eine falsche Signatur schickt. Grün bleiben *unbekannte Verbindung* (scheitert schon
am Nachschlagen), *ohne Kopfzeilen* und *unsinnige ID* – die hängen nicht an der Signatur."

Genau so kam es. Dass hier **drei** Tests grün bleiben mussten, ist der eigentliche Wert der
vorher festgelegten Erwartung: Wären sie mit rot geworden, hätte die Probe etwas anderes getroffen
als die Signaturprüfung.

Jeder dieser Tests prüft zusätzlich, dass **keine Zeile** in `webhook_deliveries` entstanden ist.
Ohne diese Nachprüfung wären sie auch dann grün, wenn der Endpoint erst geschrieben und danach 404
gemeldet hätte – dieselbe Lücke wie beim Trennen einer fremden Verbindung.

### Der Fehlschlag, der auf die Sache selbst zeigte

Beim ersten Lauf der Webhook-Suite waren genau die **drei Erfolgspfade rot** und alle negativen
Tests grün. Dieses Muster hat nur eine mögliche Ursache: Die Signatur stimmte nie.

Der Grund lag im Testaufbau. `superagent` serialisiert bei einem JSON-Content-Type auch einen
`Buffer` noch einmal selbst – aus den Bytes wurde `{"type":"Buffer","data":[123,34,…]}`. Gesendet
wurden also **andere Bytes** als die, über die signiert worden war.

Das ist dieselbe Falle, um die es in dieser Scheibe inhaltlich geht, nur eine Ebene höher – und ein
Beleg dafür, dass „ein HMAC ist eine Aussage über Bytes" keine Theorie ist. Der Grund steht als
Kommentar an der Stelle im Test, nicht nur in der Behebung.

Erwartung, **vorher** notiert: „Rot werden müssen *gibt 404 für ein Projekt einer fremden
Organisation* und *trennt nichts in einer fremden Organisation*. Alles andere bleibt grün; ein
breiteres Rot hieße, die Tests messen etwas anderes."

Genau diese beiden wurden es – keiner mehr, keiner weniger. Damit ist belegt, dass die negativen
Tests den Mandantenfilter tatsächlich bewachen und nicht bloß danebenstehen.

Der zweite Test der beiden ist dabei der interessantere. Er prüft nach dem erwarteten 404
**zusätzlich**, dass die fremde Verbindung noch existiert. Ohne diese Nachprüfung wäre er auch dann
grün, wenn `deleteMany` die fremde Zeile gelöscht und *danach* 404 gemeldet hätte – ein Test, der
den Statuscode bewacht und die Wirkung nicht.

Sprint 4:

| Entfernt | Rot geworden |
|---|---|
| `tx` im `ActivitiesService` – Eintrag über eigene Verbindung statt über die Transaktion des Aufrufers | 6 von 6 E2E |
| Zweiter Zweig der Keyset-Bedingung (Gleichstand über die `id`) | **0** – siehe unten |
| Derselbe Zweig, nach Ergänzung eines erzwingenden Tests | 1 E2E, punktgenau |

### Die Probe, die etwas anderes bewies als geplant

Die Erwartung war **vorher** notiert:

> Die Anlege-Tests werden rot, weil die fremde Verbindung die noch nicht committete Zeile nicht
> sieht und der Fremdschlüssel scheitert. Der 409-Test bleibt **grün** – dort wird ohnehin erst
> nach dem Erfolg protokolliert.

Rot wurden **alle sechs**. Nach der Regel oben ist das zunächst verdächtig, also wurde die Ursache
nachgelesen statt das Rot als Bestätigung zu nehmen:

```
Foreign key constraint violated on the constraint: `activities_projectId_fkey`
```

Der Grund ist mechanisch und nicht inhaltlich: Jeder der sechs Tests legt im Aufbau ein Projekt an.
Schon dieser erste Schreibvorgang scheitert, und damit fällt die ganze Suite – die eigentlichen
Behauptungen der Tests werden nie erreicht.

**Was die Probe damit beweist**, ist stärker als geplant: Ein Schreiber außerhalb der Transaktion
funktioniert hier nicht *schlecht*, sondern **gar nicht**. Die fremde Verbindung kann die
referenzierte Zeile nicht sehen, weil sie noch nicht committet ist – die Datenbank lehnt den
Eintrag ab. Ein `EventEmitter2`-Listener hätte dieselbe Grenze. Das ist das mechanische Argument
für ADR-012, und es ist besser als jedes rhetorische.

**Was die Probe nicht beweist**, und das ist der ehrlichere Teil: Der Test *schreibt nach einem 409
keinen Verschiebe-Eintrag* bewacht **nicht** die Atomarität. Er bewacht die **Reihenfolge** – dass
protokolliert wird, nachdem das `UPDATE` erfolgreich war. Wäre die Reihenfolge umgedreht, würde ihn
erst die Transaktion retten; so, wie der Code steht, käme er auch ohne sie nie an die Stelle.

Die Transaktion schützt hier also gegen etwas, das kein vorhandener Test auslöst: einen Fehler
*zwischen* fachlicher Änderung und Protokolleintrag – ein Verbindungsabbruch, ein Constraint, oder
eine Anweisung, die ein späterer Entwickler dahinter setzt. Das ist ein realer Schutz, aber einer
ohne wachenden Test. Er steht hier, damit niemand den grünen Haken für mehr hält, als er ist.

### Die Probe, die gar nichts rot machte – und was daraus folgte

Der zweite Zweig der Keyset-Bedingung behandelt Einträge mit **identischem** Zeitstempel. Er wurde
entfernt: **16 von 16 Tests blieben grün.**

Der Paginierungstest liest fünf Einträge über drei Seiten und prüft, dass jeder genau einmal
vorkommt – er *sah* aus wie die vollständige Prüfung. Seine fünf Einträge entstanden aber aus fünf
getrennten HTTP-Anfragen und lagen Millisekunden auseinander. Der Gleichstand trat nie ein.

Ergänzt wurde deshalb ein Test, der ihn **erzwingt**: fünf Einträge direkt über Prisma, alle mit
exakt demselben `createdAt`. Die Gegenprobe machte dann **genau einen** Test rot, mit sprechender
Zahl – 3 statt 6 Einträgen, weil die drei gleichzeitigen übersprungen wurden.

Ausführlich in `17_MISTAKES_AND_LESSONS.md`. Die Lehre in einem Satz:

> **Ein Test, der einen Grenzfall nur *wahrscheinlich* erreicht, prüft ihn nicht.** Hängt die
> Bedingung von einer Uhr, einer Reihenfolge oder einem Scheduler ab, muss der Test sie
> herstellen – nicht abwarten.

## Der Nebenläufigkeitstest, der diesmal ohne Zeitspiel auskommt

In Sprint 2 musste der Konflikt **erzwungen** werden: Eine eigene Transaktion hielt die Zeilensperre
500 ms, gemessen wurde, ob der Endpoint wartet. `Promise.all` hatte dort nichts bewacht, weil es
keine Verschränkung erzeugt, sondern nur deren Möglichkeit.

Beim optimistischen Sperren entfällt dieses Problem, und zwar grundsätzlich: **Der Konflikt hängt
nicht am Zeitverhalten, sondern an der Version.** Zwei Anfragen mit derselben gelesenen Version sind
genau das, was zwei gleichzeitig ladende Nutzer erzeugen – unabhängig davon, wann sie abschicken.
Der Test stellt sie deshalb nacheinander und prüft trotzdem exakt den Fall:

```
Nutzer 1: move(version: 0)  -> 200, Version steht jetzt auf 1
Nutzer 2: move(version: 0)  -> 409, nichts geschrieben
```

Das ist kein Trick, sondern ein Vorteil des Verfahrens: **Optimistisches Sperren macht einen
Nebenläufigkeitsfehler deterministisch reproduzierbar.** Der Test prüft zusätzlich, dass nach dem
409 der Stand von Nutzer 1 unverändert dasteht – ohne diese Zusicherung wäre „409" nur eine
Fehlermeldung und kein Beweis, dass nichts geschrieben wurde.

**Nebenbefund aus dieser Probe:** Der erste Durchlauf ließ *alle 17* Tests der Datei fehlschlagen –
was nach einem sehr wirksamen Schutz ausgesehen hätte. Tatsächlich war die Probe selbst kaputt:
Aufgerufen wurde `npx jest` statt `npm run test:e2e`, und damit fehlte `THROTTLE_LIMIT=0`. Das Rate
Limiting wies die Registrierungen im Testaufbau ab.

Die Lehre gehört zur Mutationsprobe dazu: **Ein zu breites Rot ist genauso verdächtig wie ein
ausbleibendes.** Wird ein Schutz entfernt, muss *genau* der Test rot werden, der ihn bewacht – wird
alles rot, prüft man zuerst die Testumgebung, nicht den Code.

**Ein Test, der mit und ohne den Schutz grün ist, bewacht ihn nicht** – und ist gefährlicher als gar
keiner, weil er spätere Änderungen absegnet. Genau das ist in diesem Sprint einmal passiert: Der
erste Nebenläufigkeitstest (`Promise.all` mit zwei gleichzeitigen Austritten) blieb auch ohne die
Zeilensperre grün. `Promise.all` erzeugt keine Verschränkung, nur die Möglichkeit einer.

Ersetzt wurde er durch einen Test, der den Konflikt **erzwingt**: Eine eigene Transaktion hält die
Sperre 500 ms, gemessen wird, ob der Endpoint wartet. Siehe `17_MISTAKES_AND_LESSONS.md`.

---

## Messungen – die Zahl statt der Behauptung

„Keine N+1-Queries" steht in fast jedem Lebenslauf und wird fast nie belegt. Für Sprint 4 gibt es
zwei Skripte, die nachzählen statt zu behaupten.

### `npm run messung:dashboard`

Legt Testdaten an, lässt **beide** Fassungen der Kennzahlen-Abfrage laufen und zählt die SQL-
Anweisungen, die Prisma tatsächlich absetzt (`log: [{ emit: 'event', level: 'query' }]`).

| Projekte | naiv (Schleife) | gruppiert (`groupBy`) |
|---|---|---|
| 20 | **42** Abfragen · 68 ms | **4** Abfragen · 17 ms |
| 100 | **202** Abfragen · 276 ms | **4** Abfragen · 16 ms |

Die Aussage ist **nicht** „4 ist weniger als 202". Sie ist: Die eine Zahl wächst mit den Daten
(`2N + 2`), die andere nicht. Genau das macht N+1 so teuer – mit drei Testprojekten sind es acht
Abfragen, und niemand bemerkt etwas. Der Kunde mit zweihundert Projekten bemerkt es.

Das Skript prüft am Ende ausdrücklich, dass **beide Fassungen dasselbe liefern**. Eine schnellere
Abfrage, die etwas anderes zählt, ist keine Verbesserung, sondern ein Fehler.

**Warum ein Skript und kein Test:** Ein Test soll bei jedem Lauf dasselbe sagen. Eine Messung soll
eine *Zahl* liefern, und die hängt von der Datenmenge ab – das ist ihre Aussage. Beides zu
vermischen ergäbe einen Test, der nichts prüft, und eine Messung, die nichts misst.

Die naive Fassung steht **nur** in diesem Skript. Sie ist nicht der Code, der läuft – sie ist der
Vergleichswert, ohne den die andere Zahl bedeutungslos wäre.

### `npm run erklaere:feed`

Legt 40.000 Aktivitäten an und liest die Ausführungspläne beider Feed-Pfade, inklusive einer
Gegenprobe ohne den zweiten Index (in einer zurückgerollten Transaktion). Ergebnis und Pläne in
`08_DATABASE.md`. Kurz:

- Der organisationsweite Feed nutzt `Index Scan **Backward**` – der Beleg dafür, dass `sort: Desc`
  im Index tatsächlich überflüssig gewesen wäre.
- Der projektgefilterte Feed nutzt den zweiten Index; `organizationId` erscheint als `Filter`, nicht
  als `Index Cond`. Genau die dokumentierte Arbeitsteilung: **Der Index wählt vor, der
  Mandantenfilter entscheidet.**
- Ohne den zweiten Index: `Rows Removed by Filter: 931` – 951 gelesene Zeilen für 20 gelieferte.

**Zwei Fallstricke, die beide zu falschen Schlüssen führen:**

1. **Ohne `ANALYZE` nach dem Massen-`INSERT`** plant PostgreSQL auf dem Stand „Tabelle ist leer" und
   wählt einen Seq Scan. „Der Index wird ignoriert" ist dann die falsche Schlussfolgerung – die
   Statistiken fehlen, nicht der Index.
2. **Bei zu wenigen Zeilen** ist der Seq Scan zu Recht schneller. Ein `EXPLAIN` auf Testdaten
   beweist regelmäßig das Gegenteil dessen, was gemeint war.

Und die ehrliche Einschränkung: Die absoluten Zeiten (0,235 ms gegen 0,082 ms) sagen bei 40.000
Zeilen im Arbeitsspeicher **nichts**. Belastbar ist, wie viele Zeilen gelesen werden mussten.

---

## Was Tests nicht finden können

Der teuerste Fehler in Sprint 2 stammte aus Sprint 1 und wurde von **155 grünen Tests** nicht
bemerkt: zwei parallele `POST /auth/refresh` bei einem Seitenaufruf, was zu zwei gleichzeitig
gültigen Refresh-Token führte – und zeitweise zur Widerrufung der ganzen Token-Familie.

Jeder Teil für sich war korrekt und getestet. Der Fehler entstand aus dem Zusammenspiel von
React-Lebenszyklus, Netzwerk-Zeitverhalten und einer serverseitigen Sicherheitsfunktion. Gefunden
wurde er beim **Starten der Anwendung** und einem Blick in die Netzwerkansicht.

> Eine grüne Testsuite ist kein Ersatz dafür, die Anwendung zu benutzen.

---

## Frontend: Vitest und Testing Library

```bash
cd frontend
npm test         # einmaliger Lauf
npm run test:watch
```

**Warum Vitest und nicht Jest?** Next.js baut mit einem Vite-nahen Unterbau; Vitest versteht TSX,
Pfad-Aliasse und ESM ohne zusätzliche Übersetzer. Bei Jest bräuchte es dafür Babel- oder
SWC-Konfiguration. Im Backend bleibt Jest – es kam mit NestJS mit und funktioniert dort einwandfrei.
Zwei Testläufer in einem Repository sind kein Schönheitsfehler, sondern die Folge davon, dass beide
Projekte eigenständig sind (ADR-005).

### Testing Library fragt ab, wie ein Mensch liest

`getByLabelText('E-Mail')`, `getByRole('button', { name: 'Anmelden' })` – gesucht wird über das,
was ein Nutzer sieht oder ein Screenreader vorliest, nicht über CSS-Klassen oder `data-testid`.

Das hat zwei Folgen: Ein Refactoring am Markup bricht die Tests nicht, solange die Bedeutung gleich
bleibt. **Und Zugänglichkeitsfehler fallen nebenbei auf** – genau so wurde hier ein falsch
aufgebautes Label entdeckt (siehe `17_MISTAKES_AND_LESSONS.md`).

Wer eine solche fehlschlagende Abfrage mit `getByTestId` „repariert", schaltet genau diese Warnung
ab.

### Was geprüft wird

| Datei | Schwerpunkt |
|---|---|
| `lib/auth-context.test.tsx` | stilles Erneuern, Bearer-Token, **genau eine** Wiederholung bei 401, Abmelden bei Serverausfall |
| `app/login/page.test.tsx` | Validierung ohne Serveranfrage, Fehlermeldung des Servers unverändert, `aria-invalid` |
| `components/geschuetzt.test.tsx` | keine Weiterleitung während der Prüfung, kein Aufblitzen von Inhalten |

Der wichtigste ist die Endlosschleifen-Prüfung: Bei dauerhaft ungültiger Sitzung darf `authFetch`
den Server nicht in einer Schleife aus 401 und Erneuerungsversuchen bombardieren.

**Die Tests haben sich am ersten Tag bezahlt gemacht** – sie fanden sofort zwei echte Fehler, die
beim Ausprobieren von Hand nicht auffallen konnten. Details im Fehlerprotokoll.

---

## Offene Punkte

- **Testdatenbank** für Integrationstests ab Sprint 1 – eigener Container oder Testcontainers,
  damit Tests nicht auf der Entwicklungsdatenbank laufen
- **Abdeckungsschwelle** in der CI festlegen (eine Zahl, die Verhalten steuert – bewusst wählen,
  nicht auf 100 % setzen)
- **Fixtures und Factories** für Testdaten, sobald Modelle mit Relationen dazukommen
