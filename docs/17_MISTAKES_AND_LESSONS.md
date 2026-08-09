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
