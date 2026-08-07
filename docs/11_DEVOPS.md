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

## Offene Punkte für Produktion

- `ports: "5432:5432"` **entfernen** – in Produktion spricht nur das Backend über das interne
  Netzwerk mit der Datenbank. Ein am Internet hängender Postgres, geschützt nur durch ein Passwort,
  ist eine ernste Lücke.
- Secrets nicht aus `.env`-Dateien, sondern aus dem Secret-Store der Umgebung.
- Backup-Strategie für das Volume (`pg_dump` im Cronjob, plus Hetzner-Snapshots).
- Multi-Stage-Dockerfiles für Backend und Frontend (Sprint 6).
