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
