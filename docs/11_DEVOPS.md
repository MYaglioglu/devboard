# DevOps

Docker, Compose, CI/CD. Referenz zum Nachschlagen – wächst mit jedem Sprint.

---

## Grundbegriffe

| Begriff | Bedeutung |
|---|---|
| **Image** | Unveränderlicher Bauplan. Besteht aus Layern, die zwischen Images geteilt werden. |
| **Container** | Laufende Instanz eines Images. Flüchtig – Änderungen darin gehen beim Löschen verloren. |
| **Volume** | Speicher außerhalb des Container-Lebenszyklus. Was überleben muss, gehört hierhin. |
| **Registry** | Ablage für Images. Standard ist Docker Hub. |
| **Tag** | Beweglicher Zeiger auf ein Image (`postgres:18-alpine`). |
| **Digest** | Unveränderlicher Hash eines exakten Images (`@sha256:...`). |
| **Compose** | Beschreibt mehrere Services deklarativ in einer Datei. |

**Container ≠ VM:** Container teilen sich den Kernel des Wirtssystems und isolieren nur Prozesse,
Dateisystem und Netzwerk. Deshalb Start in Millisekunden statt Minuten.

**Unter Windows:** Docker Desktop betreibt über WSL2 eine schlanke Linux-VM. Dafür ist
Hardware-Virtualisierung nötig – im BIOS bei AMD `SVM Mode`, bei Intel `VT-x`. Auf einem
Linux-Server entfällt diese Zwischenschicht.

---

## Die lokale Umgebung

Definiert in `docker-compose.yml` im Wurzelverzeichnis. Aktuell ein Service: PostgreSQL 18.

Konfigurationswerte kommen aus `.env` (gitignored). `.env.example` liegt im Repository und
dokumentiert, welche Variablen gesetzt sein müssen.

### Erstinbetriebnahme nach dem Klonen

```bash
Copy-Item .env.example .env    # danach Werte eintragen
docker compose up -d
```

---

## Befehle, die man täglich braucht

### Starten und Stoppen

```bash
docker compose up -d         # startet im Hintergrund (detached)
docker compose up            # startet im Vordergrund, Logs im Terminal, Strg+C beendet
docker compose stop          # stoppt Container, behält sie
docker compose down          # stoppt und entfernt Container + Netzwerk. Daten bleiben.
docker compose down -v       # ZUSÄTZLICH: löscht die Volumes -> Datenbank ist weg
docker compose restart db    # einzelnen Service neu starten
```

> **`-v` ist der gefährliche Schalter.** `down` ohne `-v` ist der Normalfall. `down -v` nur, wenn
> ein sauberer Neuanfang gewollt ist.

### Nachsehen, was los ist

```bash
docker compose ps                        # Status aller Services des Projekts
docker ps                                # alle laufenden Container
docker ps -a                             # auch gestoppte
docker compose logs -f db                # Logs live mitlesen
docker logs devboard-db --tail 40        # letzte 40 Zeilen
docker inspect devboard-db --format "{{.State.Health.Status}}"
```

> **Bei jedem Container-Problem zuerst die Logs lesen.** Sie benennen die Ursache meist wörtlich.

### In den Container hinein

```bash
docker exec -it devboard-db psql -U devboard -d devboard   # psql-Sitzung öffnen
docker exec -it devboard-db sh                             # Shell im Container
docker exec devboard-db psql -U devboard -d devboard -c "SELECT version();"
```

`-it` = interaktiv mit Terminal. Ohne `-it` läuft der Befehl einmal durch und beendet sich.

### Aufräumen

```bash
docker images                # welche Images liegen herum
docker volume ls             # welche Volumes existieren
docker system df             # wie viel Platz belegt Docker
docker system prune          # entfernt ungenutzte Container, Netzwerke, Images
```

---

## Verifizieren statt annehmen

Ein Container, der abstürzt und neu startet, sieht auf den ersten Blick beschäftigt aus. „Läuft" hat
drei Stufen:

```bash
docker compose ps                                              # 1. Container existiert und läuft
docker inspect devboard-db --format "{{.State.Health.Status}}" # 2. healthy
docker exec devboard-db psql -U devboard -d devboard -c "SELECT 1;"  # 3. antwortet wirklich
```

Achte bei `docker compose ps` auf `Restarting` und bei `docker inspect` auf `RestartCount` – beides
sind Anzeichen für eine Absturzschleife.

### Persistenz beweisen

```bash
docker exec devboard-db psql -U devboard -d devboard -c "CREATE TABLE t (id int); INSERT INTO t VALUES (1);"
docker compose down          # ohne -v
docker compose up -d
docker exec devboard-db psql -U devboard -d devboard -c "SELECT * FROM t;"
```

Ist die Zeile noch da, funktioniert das Volume.

---

## Netzwerk – häufigste Fehlerquelle

Compose legt ein privates Netzwerk an. Jeder Service ist darin unter seinem **Service-Namen** per
DNS erreichbar.

```
Vom Windows-Host aus:          localhost:5432   (nur weil `ports:` den Port veröffentlicht)
Aus einem anderen Container:   db:5432          (Service-Name aus docker-compose.yml)
```

`localhost` innerhalb eines Containers bedeutet **dieser Container**, nicht der Wirt.

---

## CI-Pipeline

Definiert in `.github/workflows/ci.yml`. Läuft bei jedem Push auf `main` und bei **jedem Pull
Request** – der PR-Trigger ist der wichtige, denn er blockiert den Merge, wenn etwas rot ist.

### Zwei Ebenen von Qualitätssicherung

| Ebene | Werkzeug | Umfang | Dauer | Umgehbar? |
|---|---|---|---|---|
| **Lokal** | Husky + lint-staged | Formatierung der geänderten Dateien | ~2 s | ja (`--no-verify`) |
| **Remote** | GitHub Actions | Lint, Tests, Build, beide Projekte | ~1 min | nein |

Die Arbeitsteilung ist Absicht: Der Hook macht das **Schnelle**, die Pipeline das **Gründliche**.
Ein Pre-Commit-Hook, der zwei Minuten braucht, wird nach einer Woche abgeschaltet – und ein Hook ist
ohnehin nur Bequemlichkeit, keine Garantie. **Die Garantie ist die Pipeline.**

### Aufbau

Zwei parallele Jobs, `Backend` und `Frontend`. Parallel, weil sie nichts voneinander brauchen – das
halbiert die Laufzeit.

**Backend-Job:**

```
Repository auschecken
Node einrichten (mit npm-Cache)
npm ci
npx prisma generate
npx prisma migrate deploy
npm run lint:ci
npm test
npm run test:e2e
npm run build
```

Dazu ein **PostgreSQL-Service-Container** (`postgres:18-alpine`), der für die Dauer des Jobs läuft.
Kein Mock: Die E2E-Tests laufen gegen dieselbe Datenbankversion wie lokal und später in Produktion.
Der Healthcheck im Service ist Pflicht – ohne ihn starten die Tests, bevor Postgres Verbindungen
annimmt.

### Details, die im Gespräch gefragt werden

**`npm ci` statt `npm install`.** `ci` installiert exakt die Versionen aus dem Lockfile, löscht
`node_modules` vorher und **schlägt fehl**, wenn `package.json` und Lockfile auseinanderlaufen.
`install` würde das Lockfile stillschweigend anpassen – in einer Pipeline genau falsch, weil das
Ergebnis dann nicht mehr reproduzierbar ist.

**`lint:ci` ohne `--fix`.** Das lokale `lint` korrigiert automatisch. In der Pipeline wäre das
schädlich: Sie soll Fehler **melden**, nicht heimlich reparieren und dann grün werden.
`--max-warnings 0` sorgt dafür, dass auch Warnungen den Lauf rot machen – sonst sammeln sich
Warnungen jahrelang an, bis sie niemand mehr liest.

**`migrate deploy` statt `migrate dev`.** `deploy` wendet nur vorhandene Migrationen an und erzeugt
oder verwirft nichts. Das Einzige, was außerhalb der lokalen Entwicklung laufen darf.

**`concurrency` mit `cancel-in-progress`.** Kommen neue Commits nach, wird der laufende Durchlauf
abgebrochen. Spart Laufzeit und Wartezeit.

**Cache.** `actions/setup-node` mit `cache: npm` speichert den npm-Cache zwischen den Läufen.
Deshalb dauert der zweite Durchlauf spürbar kürzer als der erste.

### Branch-Schutz

Erst der Branch-Schutz macht die Pipeline wirksam. Ohne ihn kann man eine rote Pipeline einfach
ignorieren.

Aktiv auf `main`:

- Pflicht-Checks: `Backend` und `Frontend` müssen grün sein
- Branch muss aktuell mit `main` sein (`strict`)
- Kein Force-Push, kein Löschen des Branches
- Offene Kommentare müssen aufgelöst sein

**Bewusst nicht aktiv:** Pflicht-Reviews. GitHub lässt niemanden den eigenen Pull Request freigeben –
bei einer Einzelperson würde die Einstellung jeden Merge blockieren. Sobald jemand mitarbeitet, wird
sie eingeschaltet.

`enforce_admins` steht auf `false`, damit sich der Eigentümer nicht aussperrt. Einschalten mit:

```bash
gh api -X PUT repos/MYaglioglu/devboard/branches/main/protection/enforce_admins
```

---

## Offene Punkte für Produktion

- `ports: "5432:5432"` **entfernen** – in Produktion spricht nur das Backend über das interne
  Netzwerk mit der Datenbank. Ein am Internet hängender Postgres, geschützt nur durch ein Passwort,
  ist eine ernste Lücke.
- Secrets nicht aus `.env`-Dateien, sondern aus dem Secret-Store der Umgebung.
- Backup-Strategie für das Volume (`pg_dump` im Cronjob, plus Hetzner-Snapshots).
- Multi-Stage-Dockerfiles für Backend und Frontend (Sprint 6).
