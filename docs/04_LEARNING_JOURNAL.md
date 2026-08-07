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
