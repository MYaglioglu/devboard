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

---

# Von null auf HTTPS – die vollständige Einrichtung

Diese Anleitung beschreibt **jeden** Schritt, der aus einem leeren Hetzner-Konto einen laufenden,
öffentlich per HTTPS erreichbaren DevBoard-Server gemacht hat. Sie ist bewusst als Protokoll
geschrieben und nicht als Zusammenfassung: Wer den Server neu aufsetzen muss, arbeitet sie von oben
nach unten ab. Die Fehler, die dabei tatsächlich passiert sind, stehen an der Stelle, an der sie
passiert sind – ausführlich in `17_MISTAKES_AND_LESSONS.md`.

**Durchgeführt am 22.08.2026.** Reine Arbeitszeit etwa drei Stunden, davon ein erheblicher Teil
Warten auf Verifizierung und DNS.

## Was am Ende steht

```
Browser
   │
   └──→ api.devboard.info ──→ Hetzner CX23 (Nürnberg)
                                  │
                                  ├── Caddy      Port 80/443, TLS, Reverse Proxy
                                  └── NestJS     Port 3000, nur im Docker-Netz
                                        │
                                        └──→ Neon PostgreSQL (Frankfurt)
```

| Posten | Kosten |
|---|---|
| Hetzner CX23 | ~6,53 €/Monat |
| Domain `devboard.info` | ~2 € im ersten Jahr (Verlängerung deutlich teurer) |
| Neon PostgreSQL | 0 € |

---

# Teil 1 – Vorbereitung auf dem eigenen Rechner

## 1.1 SSH-Schlüsselpaar erzeugen

```
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\devboard -C "devboard-hetzner"
```

**PowerShell kennt die Tilde nicht.** `~/.ssh/devboard` scheitert mit „No such file or directory",
weil PowerShell den Text unverändert weiterreicht und es keinen Ordner namens `~` gibt.
`$env:USERPROFILE` ist das PowerShell-Gegenstück und löst sich zu `C:\Users\<Name>` auf.

Der `-f`-Teil ist wichtig: Ohne ihn bietet `ssh-keygen` an, einen vorhandenen Schlüssel zu
**überschreiben**. Ein eigener Schlüssel pro Zweck begrenzt den Schaden, wenn einer verloren geht,
und lässt sich einzeln zurückziehen.

Es entstehen zwei Dateien:

| Datei | Inhalt | darf weitergegeben werden |
|---|---|---|
| `devboard` | privater Schlüssel | **niemals** |
| `devboard.pub` | öffentlicher Schlüssel | überall |

Die `.pub`-Datei ist eine einzige Zeile aus drei Teilen: Verfahren (`ssh-ed25519`), das eigentliche
Schlüsselmaterial in base64, und ein freier Kommentar, den SSH nie liest.

### Zur Passphrase

`ssh-keygen` fragt zweimal danach. Eine Passphrase **verschlüsselt die Schlüsseldatei auf der
Platte**. Der Unterschied zu einem Passwort ist grundlegend:

| | Passwort | Passphrase |
|---|---|---|
| Wird geprüft von | dem Server | dem eigenen Rechner |
| Geht über die Leitung | ja | **nie** |

Ohne Passphrase **ist** die Datei der Zugang. Mit Passphrase ist sie nur die Hälfte davon – der
Dieb braucht zusätzlich etwas, das er nicht mitkopieren kann.

Der SSH-Agent hält den entschlüsselten Schlüssel für die Dauer der Sitzung, man tippt sie also
einmal nach dem Hochfahren und nicht bei jeder Verbindung:

```
ssh-add ~/.ssh/devboard
```

*In diesem Projekt wurde der Schlüssel bewusst ohne Passphrase angelegt – abgewogen gegen die Zeit.
Die Entscheidung ist vertretbar, solange sie eine Entscheidung ist. Nachrüsten heißt: neuen
Schlüssel erzeugen, hinterlegen, alten entfernen.*

## 1.2 Kurznamen in `~/.ssh/config` hinterlegen

Damit aus einer langen Zeile ein Wort wird:

```
Host devboard-root
    HostName 167.233.151.172
    User root
    IdentityFile ~/.ssh/devboard
    IdentitiesOnly yes

Host devboard
    HostName 167.233.151.172
    User devboard
    IdentityFile ~/.ssh/devboard
    IdentitiesOnly yes
```

Danach genügt `ssh devboard-root` beziehungsweise `ssh devboard`.

`IdentitiesOnly yes` ist kein Beiwerk: Ohne diese Zeile bietet SSH **alle** vorhandenen Schlüssel
der Reihe nach an. Bei mehreren Schlüsseln im Verzeichnis führt das zu „Too many authentication
failures", bevor der richtige überhaupt drankommt.

Zwei Einträge, weil der Benutzer `devboard` auf dem Server erst später existiert. Bis dahin geht
nur `root`.

---

# Teil 2 – Server bei Hetzner

## 2.1 Konto und Projekt

Konto auf `console.hetzner.cloud`. **Die Verifizierung dauert** – von Minuten bis zu einem Tag.
Deshalb ist das der erste Schritt, den man anstößt und dann liegen lässt.

Danach ein eigenes Projekt `devboard`. Ein Projekt ist bei Hetzner die Abrechnungs- und
Zugriffsgrenze; ein API-Token gilt immer nur innerhalb eines Projekts. Ein verlorenes Token reicht
damit nicht an andere Dinge heran.

## 2.2 Öffentlichen Schlüssel hinterlegen

**Security → SSH Keys → Add SSH Key**, den Inhalt von `devboard.pub` einfügen.

Das muss **vor** dem Erstellen des Servers passieren – nur dann kann man den Schlüssel im nächsten
Schritt auswählen. Wählt man keinen aus, verschickt Hetzner ein Root-Passwort per E-Mail, und dann
steht ein passwortgeschützter SSH-Zugang im Internet, der binnen Minuten durchprobiert wird.

## 2.3 Server erstellen

| Feld | Wahl | Begründung |
|---|---|---|
| Location | **Nürnberg** | Daten in Deutschland, kurze Wege zur Datenbank in Frankfurt |
| Image | **Ubuntu 24.04 LTS** | LTS heißt Sicherheitsupdates bis 2029 |
| Typ | **CX23** (2 vCPU, 4 GB, 40 GB) | siehe Warnung unten |
| Networking | IPv4 **und** IPv6 | ohne IPv4 erreichen viele Netze den Server nicht |
| SSH Key | der aus 2.2 | **kein** Passwort-Login |
| Volumes / Backups / Placement | nichts | siehe unten |
| Name | `devboard-prod` | |

### Die Falle: CX oder CAX

Hetzner bietet daneben die **CAX**-Reihe an – gleicher Preis, oft mehr Leistung. Das sind
**ARM**-Prozessoren.

Für dieses Projekt wäre das falsch: Das Docker-Image wird ab Scheibe 6.4 von GitHub Actions gebaut,
und deren Runner sind x86. **Ein Image ist an die Prozessorarchitektur gebunden.** Auf ARM müsste
per Cross-Building für zwei Architekturen gebaut werden – lösbar, aber eine Baustelle ohne
Lerngewinn.

### Warum keine Backups

Hetzner bietet Backups für +20 % an. Auf diesem Server liegt **nichts Unersetzliches**: Die Daten
sind bei Neon, der Code auf GitHub, das Image entsteht aus dem Code. Der Server ist ersetzbar – und
genau das ist der Sinn von Containern.

## 2.4 Firewall

Beim Erstellen eine Firewall anlegen, **eingehend** nur:

| Port | Wofür |
|---|---|
| 22 | SSH |
| 80 | HTTP – nur für die Let's-Encrypt-Prüfung und die Umleitung auf HTTPS |
| 443 | HTTPS |

Ausgehend alles erlauben – der Server muss Neon erreichen und Images ziehen.

Dass **5432 fehlt**, ist Absicht: Auf diesem Server läuft keine Datenbank.

---

# Teil 3 – Den Server härten

## 3.1 Erste Anmeldung

```
ssh devboard-root
```

Beim ersten Mal fragt SSH nach dem Fingerabdruck des Servers und merkt ihn sich in `known_hosts`.
Ändert er sich **später** ohne Grund, ist das eine ernste Warnung – dann antwortet jemand anders
unter dieser Adresse.

### Wenn stattdessen nach einem Passwort gefragt wird

```
devboard@167.233.151.172's password:
```

**Ein Passwort-Prompt heißt fast immer: Die Schlüssel-Anmeldung ist gescheitert.** Er ist der
Rückfall, nicht ein zusätzlicher Schritt. Häufigste Ursachen: falscher Benutzername (der Benutzer
existiert noch nicht), falscher Schlüssel, oder der Schlüssel liegt nicht auf dem Server. Wer hier
anfängt, Passwörter zu raten, sucht an der falschen Stelle.

## 3.2 System aktualisieren

```
apt update && apt upgrade -y
```

Keine Formalität: Ein Image ist so alt wie sein Erstellungsdatum, dazwischen liegen
Sicherheitsupdates. Steht danach `*** System restart required ***` im Login-Banner, wurde der
Kernel erneuert – der wird erst nach einem Neustart benutzt (siehe 3.8).

## 3.3 Einen Benutzer anlegen, der nicht root ist

```
adduser --disabled-password --gecos "" devboard
usermod -aG sudo devboard
rsync --archive --chown=devboard:devboard ~/.ssh /home/devboard
```

- `--disabled-password` – das Konto hat **kein** Passwort, mit dem man sich anmelden könnte.
- `--gecos ""` – überspringt die Rückfragen nach Name, Zimmernummer, Telefon.
- `rsync` – überträgt den hinterlegten Schlüssel, sonst wäre der neue Benutzer ausgesperrt.

Warum überhaupt: Als root ist jeder Tippfehler endgültig. Als normaler Benutzer braucht ein
gefährlicher Befehl ein bewusstes `sudo` davor – eine Sekunde Nachdenken an der richtigen Stelle.

## 3.4 Ein Passwort für `sudo` vergeben

```
passwd devboard
```

Das klingt wie ein Widerspruch zu `--disabled-password`, ist aber keiner. Zwei verschiedene Dinge:

- **SSH-Anmeldung per Passwort** – wird in 3.6 abgeschaltet.
- **Lokale Authentisierung für `sudo`** – braucht ein Passwort.

Ein mit `--disabled-password` angelegtes Konto hat ein *gesperrtes* Passwortfeld. `sudo` fragt dann
nach etwas, das es nicht gibt, und scheitert. Ohne diesen Schritt wäre der Benutzer nach dem
Abschalten des Root-Zugangs handlungsunfähig.

Aufgefallen ist das nur, weil auffiel, dass alle bisherigen `sudo`-Aufrufe **als root** liefen –
dort fragt sudo gar nicht.

Gegenprobe in einer Sitzung als `devboard`:

```
sudo whoami
```

Muss `root` ausgeben.

## 3.5 Prüfen, BEVOR root abgeschaltet wird

**Zweites Terminal öffnen, das erste offen lassen:**

```
ssh devboard
```

Wer sich hier aussperrt, kommt nur noch über die **Web-Konsole** im Hetzner-Dashboard hinein (das
`>_`-Symbol neben dem Servernamen) – ein Terminal im Browser, das ohne SSH funktioniert. Gut zu
wissen, bevor man es braucht.

## 3.6 SSH härten

### Erst messen, was überhaupt gilt

Ein `grep` in `/etc/ssh/sshd_config` ist **nicht** die Wahrheit. Ubuntu 24.04 hat dort ganz oben
`Include /etc/ssh/sshd_config.d/*.conf`, und bei OpenSSH gilt für jedes Schlüsselwort der **zuerst**
gefundene Wert. Was in einer Include-Datei steht, überstimmt also die Hauptdatei.

Die tatsächlich wirksame Konfiguration rechnet `sshd -T` zusammen:

```
sudo sshd -T | grep -E "^permitrootlogin|^passwordauthentication|^pubkeyauthentication"
```

Auf `devboard-prod` ergab das:

```
permitrootlogin prohibit-password     ← root nur per Schlüssel (Hetzner-Vorgabe)
pubkeyauthentication yes
passwordauthentication yes            ← der einzige offene Punkt
```

Und `/etc/ssh/sshd_config.d/` war leer – es gab also nichts, was unsere Änderung überstimmen konnte.

### Die Änderung als eigene Datei

```
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/01-devboard-haertung.conf
```

Eigene Datei statt Hauptdatei, weil ein Paketupdate `sshd_config` ersetzen kann. Der Name beginnt
mit `01`, weil der **erste** Wert gewinnt – die Datei muss alphabetisch vor allem stehen, was Ubuntu
später dort ablegt.

`KbdInteractiveAuthentication` gehört dazu: ein zweiter Weg, über den Passwörter abgefragt werden.
Wer nur `PasswordAuthentication` schließt, lässt die Nebentür offen.

### Syntax prüfen, dann neu laden

```
sudo sshd -t
```

Keine Ausgabe heißt: in Ordnung. **Dieser Schritt ist nicht optional** – eine kaputte Konfiguration
heißt, dass der Dienst nicht mehr startet, und dann hilft nur die Web-Konsole.

```
sudo systemctl reload ssh
```

```
sudo sshd -T | grep -E "^permitrootlogin|^passwordauthentication|^kbdinteractive"
```

Erwartet: dreimal `no`.

### Der Beweis gehört in ein neues Fenster

`reload` wirft laufende Verbindungen **nicht** hinaus – ein Fehler fällt erst beim nächsten Anmelden
auf. Deshalb:

- `ssh devboard` muss funktionieren
- `ssh devboard-root` muss mit `Permission denied (publickey)` **scheitern**

Das Scheitern ist hier das Prüfergebnis, nicht der Fehler.

## 3.7 Firewall auf dem Server

```
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

```
sudo ufw status verbose
```

Erwartet: `Status: active`, `Default: deny (incoming)`, und die drei Ports jeweils für **IPv4 und
IPv6**. Eine Firewall, die nur v4 absichert, ist ein klassisches Loch – der Server ist über beide
Protokolle erreichbar.

Das ist die zweite Schicht hinter der Hetzner-Firewall. Nicht doppelt gemoppelt, sondern
**Verteidigung in der Tiefe**: Ein Fehlgriff im Dashboard öffnet dann nicht sofort alles.

## 3.8 Neu starten

```
sudo reboot
```

Der beste Zeitpunkt ist jetzt, solange nichts läuft, was ausfallen könnte. Nach etwa 30 Sekunden
wieder verbinden. Nebenbei ist es ein echter Test: Wer nach dem Neustart wieder hineinkommt, weiß,
dass die SSH-Härtung einen Neustart übersteht.

---

# Teil 4 – Docker installieren

```
curl -fsSL https://get.docker.com | sudo sh
```

```
sudo usermod -aG docker devboard
```

Danach **einmal ab- und wieder anmelden**, sonst greift die Gruppenmitgliedschaft nicht.

Aus dem offiziellen Skript und nicht `apt install docker.io`: Das Ubuntu-Paket hinkt regelmäßig
mehrere Hauptversionen hinterher.

> Ein Skript aus dem Netz in eine Shell zu leiten, ist normalerweise genau das, was man nicht tut.
> Hier ist es das offizielle Installationsskript von Docker über HTTPS von deren eigener Domain –
> vertretbar, aber es bleibt eine bewusste Vertrauensentscheidung.

Docker warnt bei der Installation ausdrücklich, dass Zugriff auf den Docker-Daemon gleichbedeutend
mit Root-Zugriff auf dem Wirt ist. Das stimmt und ist der Grund, warum nur **ein** Benutzer in die
`docker`-Gruppe kommt – wer da drin ist, ist praktisch root. Die strengere Variante wäre rootless
Docker; sie bringt aber Einschränkungen bei Ports unter 1024 mit, und genau die braucht Caddy.
Bewusste Entscheidung, kein Übersehen.

### Ein typischer Stolperstein

```
usermod: user 'devboard' does not exist
```

Das passiert, wenn Docker vor Schritt 3.3 installiert wurde. Kein Schaden – der `usermod`-Befehl
wird nach dem Anlegen des Benutzers einfach nachgeholt.

Und die verwandte Verwirrung: Nach einer **neuen** SSH-Sitzung startet man wieder im
Heimatverzeichnis. Ein `cd devboard` aus einer früheren Sitzung gilt nicht mehr, und dann meldet
`git pull` „not a git repository". Die erste Frage bei solchen Meldungen ist nicht *was ist kaputt*,
sondern **wo bin ich**:

```
pwd
```

---

# Teil 5 – Die Datenbank bei Neon

## 5.1 Konto anlegen – und die Vercel-Falle

Beim ersten Versuch war der Knopf **New project** gesperrt, mit dem Hinweis *„To create a new
project, use the Neon Postgres integration in Vercel"*. Die Organisation hieß
„Vercel: <name>'s projects".

Ursache: Die Anmeldung war über Vercel erfolgt. Damit ist das Neon-Konto ein von Vercel verwalteter
Bereich – Projekte entstehen über den Vercel-Marktplatz und werden dort abgerechnet, nicht in der
Neon-Konsole.

Zwei Auswege:

1. Über den Organisationsumschalter oben links prüfen, ob daneben eine **persönliche** Organisation
   existiert.
2. Sonst direkt auf `neon.tech` mit einem eigenen Konto anmelden – ausdrücklich **nicht** über
   „Continue with Vercel".

**Gewählt wurde der zweite Weg**, und zwar aus einem inhaltlichen Grund: ADR-016 entscheidet drei
Anbieter, jeder einzeln austauschbar. Eine Datenbank, die über Vercel läuft, obwohl sie von Vercel
gar nicht benutzt wird – sie spricht ja mit dem Hetzner-Server –, koppelt zwei Dinge aneinander,
die nichts miteinander zu tun haben. Ein Wechsel des Frontend-Anbieters hätte dann die Datenbank
mitgezogen.

## 5.2 Projekt anlegen

| Feld | Wahl |
|---|---|
| Project name | `devboard` |
| Postgres version | **18** – dieselbe wie lokal und in der CI |
| Region | **AWS Europe Central 1 (Frankfurt)** |
| Enable Neon Auth | **aus** |

### Warum Neon Auth aus bleibt

Neon Auth legt eine fertige Benutzerverwaltung samt Tabellen für Konten und Sitzungen an. Genau das
existiert in DevBoard bereits – Registrierung, argon2id, JWT, Refresh-Rotation mit
Wiederverwendungs-Erkennung, globaler Guard, Rate Limiting.

Einschalten hätte drei Wirkungen, alle unerwünscht:

1. Es löst ein gelöstes Problem – das `AuthModule` bleibt zuständig.
2. Es legt fremde Tabellen in die Datenbank, die Prisma nicht verwaltet. Das Schema wäre nicht mehr
   die vollständige Wahrheit über die Datenbank.
3. Es bindet an Neon. Ohne Neon Auth ist Neon austauschbar – es ist einfach PostgreSQL.

> **Eine eingeschaltete Funktion, die niemand benutzt, ist keine Reserve, sondern eine
> Verbindlichkeit.** Sie muss verstanden, gepflegt und bei jedem Sicherheitsvorfall mitbewertet
> werden.

## 5.3 Zwei Verbindungsstrings, nicht einer

Im Dialog **Connect** gibt es den Regler **Connection pooling**. Er entscheidet über den Hostnamen:

| Regler | Hostname | wofür |
|---|---|---|
| an | `...-pooler.c-5.eu-central-1.aws.neon.tech` | die **laufende Anwendung** |
| aus | `....c-5.eu-central-1.aws.neon.tech` | **Migrationen** |

Der Unterschied ist nicht kosmetisch. Ein **Pooler** hält wenige Verbindungen offen und verteilt sie
reihum – ideal für viele kurze Abfragen. **Migrationen** brauchen das Gegenteil: Sie halten Sperren
über mehrere Anweisungen hinweg (`ALTER TABLE`, dann `CREATE INDEX`, dann `UPDATE`). Schiebt der
Pooler zwischendurch eine andere Verbindung unter, sind die Sperren weg und die Migration bricht
mittendrin ab – mit halbem Schema.

> **Pooler für viele kurze Sachen, direkte Verbindung für eine lange.**

Die beiden Adressen unterscheiden sich in genau einem Wort; man kann `-pooler` auch von Hand
entfernen statt den Regler zu benutzen.

## 5.4 Migrationen einspielen

Die Neon-Datenbank ist zunächst **leer**. Das Produktions-Image enthält bewusst keinen Prisma-CLI
(siehe 6.1 – das war die 350-MB-Entscheidung). Das ist kein Problem, sondern der Entwurf aus
ADR-016: **Neon ist öffentlich erreichbar, also können Migrationen von außen laufen.** Heute vom
Entwicklungsrechner, ab Scheibe 6.4 von GitHub Actions – derselbe Weg.

```
cd D:\DevBoard\backend
```

```
$env:DATABASE_URL='postgresql://neondb_owner:PASSWORT@ep-....aws.neon.tech/neondb?sslmode=verify-full'; npx prisma migrate deploy
```

Einfache Anführungszeichen, nicht doppelte: In doppelten deutet PowerShell alles nach einem `$` als
Variable. Ein Passwort mit `$` wäre still verstümmelt, und der Fehler sähe aus wie ein
Verbindungsproblem.

### Die Zeile, die man prüfen MUSS

Prisma gibt zu Beginn aus, **wohin** es sich verbindet:

```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-....aws.neon.tech"
```

Dort muss `neon.tech` stehen. Steht dort `localhost`, sofort abbrechen.

### Der Fehler, der hier tatsächlich passiert ist

Statt den Wert nur für diesen einen Aufruf zu setzen, wurde die Neon-Adresse in die lokale `.env`
geschrieben – **neben** die bereits vorhandene Zeile für die Entwicklungsdatenbank. Die Datei
enthielt `DATABASE_URL` danach zweimal.

Bei `.env`-Dateien gewinnt der **letzte** Eintrag. `prisma migrate deploy` meldete „Database schema
is up to date!" – und das stimmte sogar, nur für `localhost`. In Neon stand weiterhin nichts. Keine
Fehlermeldung, kein Syntaxfehler, eine stille Überschreibung.

Gefährlich war daran nicht das falsche Migrationsziel, sondern die Zeile selbst: Solange eine
Produktions-URL in der lokalen `.env` steht, trifft sie **jeden** lokalen Befehl. `npm run test:e2e`
räumt zwischen den Tests Tabellen leer.

> **Produktionszugangsdaten kommen nie in eine Datei, die bei jedem Befehl gelesen wird.**

Nach dem Aufräumen liefen alle acht Migrationen gegen Neon durch. Gegenprobe:

```
npx prisma migrate status
```

Erwartet: `8 migrations found` und `Database schema is up to date!` – diesmal mit `neon.tech` in der
Datenquellen-Zeile. Im Dashboard unter **Tables** stehen danach `users`, `organizations`,
`projects`, `tasks`, `activities`, `repository_connections` und `webhook_deliveries`.

---

# Teil 6 – Domain und DNS

## 6.1 Die Domain kaufen

Gewählt: **`devboard.info`** bei IONOS. Der Name entspricht dem Projekt, ist kurz, ohne Bindestrich
und am Telefon vorlesbar. Technisch ist die Endung gleichgültig – Let's Encrypt stellt für `.info`
dasselbe Zertifikat aus wie für `.de`.

### Die Preisfalle

Angeboten wurde „0,17 €/Monat für 12 Monate", regulär 3,50 €/Monat. Auf das Jahr gerechnet:

| | pro Monat | pro Jahr |
|---|---|---|
| Erstes Jahr | 0,17 € | **~2 €** |
| Ab dem zweiten | 3,50 € | **~42 €** |

**Domains werden jährlich abgerechnet.** Ein Monatspreis in großer Schrift ist eine
Darstellungsentscheidung, keine Zahlungsweise.

> **Wenn ein Preis in einer ungewöhnlichen Einheit angegeben wird, ist die gewöhnliche Einheit
> unangenehm.**

Bewusst angenommen, mit Kalendereintrag für Monat 11: dann umziehen oder auslaufen lassen. Ein
Domainumzug ist ein normaler Vorgang – man zahlt beim neuen Anbieter ein Jahr, und die Laufzeit
verlängert sich um genau dieses Jahr. Günstigere Anbieter mit stabilen Preisen sind Netcup, INWX,
Porkbun oder Cloudflare (verkauft zum Einkaufspreis).

Zwei Dinge beim Kauf: **nur die Domain** (keine Hosting-Pakete dazubuchen) und **WHOIS-Schutz**
prüfen – bei `.info` sind die Inhaberdaten sonst öffentlich abrufbar. Bei `.de` erledigt das die
DENIC von selbst.

## 6.2 Den A-Eintrag setzen

In der IONOS-Domainverwaltung, **Record hinzufügen**:

| Feld | Wert |
|---|---|
| Typ | `A` |
| Hostname | `api` |
| Wert | `167.233.151.172` |
| TTL | der kleinste angebotene Wert |

Der Hostname ist nur `api`, **nicht** `api.devboard.info` – der Anbieter hängt die Domain selbst an.
Wer den vollen Namen einträgt, erzeugt `api.devboard.info.devboard.info`.

Kleiner TTL während der Einrichtung: Der Wert bestimmt, wie lange andere Server die Antwort
zwischenspeichern. Korrekturen greifen dann schneller.

### Was nicht angefasst wird

Die vom Anbieter angelegten Einträge bleiben stehen:

| Einträge | Bedeutung |
|---|---|
| `A`/`AAAA` auf `@` | Parkseite der Hauptdomain – zeigt in Scheibe 6.6 auf Vercel |
| `MX`, `TXT` (SPF), `_dmarc`, `dkim`, `autodiscover` | E-Mail für die Domain |
| `_domainconnect`, `_dep_ws_mutex` | Interna des Anbieters |

**DNS funktioniert pro Name.** `api.devboard.info` und `devboard.info` sind zwei verschiedene Namen;
der `@`-Eintrag kommt dem Server nicht in die Quere. Löschen würde nichts verbessern und im Fall der
Mail-Einträge E-Mail an die Domain kaputtmachen.

Bewusst **kein** `AAAA` für `api`, obwohl der Server IPv6 hat: So läuft die Let's-Encrypt-Prüfung
über IPv4 – ein Weg statt zwei, also eine Fehlerquelle weniger.

## 6.3 DNS-Diagnose: „löst nicht auf" ist keine Diagnose

Stundenlang lieferte `nslookup api.devboard.info` keine Antwort – auch die Hauptdomain nicht.
Naheliegender Schluss: Der Eintrag ist noch nicht durch.

Der richtige Weg ist, die Kette von oben abzuklopfen. Zuerst: Sind die Nameserver überhaupt
delegiert?

```
nslookup -type=NS devboard.info
```

Antwort: `ns1073.ui-dns.org` und Geschwister. Die Domain war also längst bekannt.

Dann den zuständigen Nameserver **direkt** fragen, am eigenen Zwischenspeicher vorbei:

```
nslookup api.devboard.info ns1073.ui-dns.org
```

Antwort: `167.233.151.172`. Der Eintrag war seit Stunden korrekt.

Die Ursache war ein **negativer Cache**: Eine frühere Abfrage hatte „gibt es nicht" ergeben, und
genau diese Nichtexistenz war gespeichert. Auch Negativantworten werden zwischengespeichert.

> **„Löst nicht auf" heißt nicht „ist nicht eingetragen".** Wer den zuständigen Nameserver direkt
> fragt, weiß, ob das Problem an der Quelle liegt oder unterwegs.

Praktisch entscheidend: **Let's Encrypt benutzt seine eigenen Resolver.** Der eigene verdorbene
Cache ist dafür ohne Bedeutung – die Zertifikatsanforderung konnte sofort laufen.

---

# Teil 7 – Die Anwendung ausrollen

## 7.1 Repository holen

```
git clone https://github.com/MYaglioglu/devboard.git && cd devboard
```

## 7.2 Konfiguration anlegen

```
cp .env.produktion.example .env.produktion && chmod 600 .env.produktion && nano .env.produktion
```

`chmod 600` heißt: nur der Besitzer darf lesen und schreiben. Bei einer Datei mit
Produktionsgeheimnissen ist das kein Zierat.

Auszufüllen:

| Variable | Wert |
|---|---|
| `API_DOMAIN` | `api.devboard.info` |
| `ACME_EMAIL` | eigene E-Mail-Adresse |
| `PUBLIC_BASE_URL` | `https://api.devboard.info` |
| `CORS_ORIGIN` | vorläufig die Domain – der richtige Wert ist die Vercel-Adresse (Scheibe 6.6) |
| `DATABASE_URL` | die **pooled** Neon-Adresse |
| `JWT_SECRET` | neu erzeugen |
| `WEBHOOK_ENCRYPTION_KEY` | neu erzeugen |

**Die ganze `DATABASE_URL`-Zeile ersetzen**, nicht stückweise anpassen: Die Datenbank heißt bei Neon
`neondb` und nicht `devboard`. Wer nur Benutzer und Passwort austauscht, behält den falschen
Datenbanknamen.

## 7.3 Geheimnisse erzeugen – auf dem Server

```
openssl rand -base64 48
```

```
openssl rand -hex 32
```

Auf dem Server erzeugt, damit sie nirgendwo sonst existieren. **Nichts aus der lokalen `.env`
kopieren** – ein Geheimnis, das auf dem Entwicklungsrechner liegt, ist keins mehr für Produktion.

Beide Ergebnisse sind zufällig **64 Zeichen lang**, aus verschiedenen Gründen: Base64 packt 3 Byte
in 4 Zeichen (48 → 64), Hex braucht 2 Zeichen pro Byte (32 → 64). Vertauscht man sie, fällt es
nicht an der Länge auf, sondern erst daran, dass der Webhook-Schlüssel Zeichen enthält, die es im
Hexadezimalsystem nicht gibt.

Gegenprobe ohne die Werte auszugeben:

```
for k in JWT_SECRET WEBHOOK_ENCRYPTION_KEY; do printf "%-24s %s Zeichen\n" "$k" "$(grep "^$k=" .env.produktion | cut -d= -f2- | tr -d '\n\r' | wc -c)"; done
```

Zweimal 64. `WEBHOOK_ENCRYPTION_KEY` muss **genau** so lang sein – AES-256 verlangt 32 Byte, und
das Backend verweigert bei jeder anderen Länge den Start. Absichtlich beim Start und nicht erst beim
ersten Webhook.

Ein Hinweis zu `nano`: speichern mit `Strg+O`, Enter, verlassen mit `Strg+X`. Das `^` in der
Hilfeleiste bedeutet Strg. Einfügen in Windows Terminal mit **Rechtsklick** oder
`Strg+Umschalt+V` – ein einfaches `Strg+V` blättert in nano eine Seite weiter.

## 7.4 Das Backend starten

Zunächst **ohne** den Proxy, weil ohne funktionierendes DNS kein Zertifikat zu holen ist:

```
docker compose -f docker-compose.produktion.yml up -d --build backend
```

Der erste Bau dauert einige Minuten: Node-Image holen, Abhängigkeiten installieren, TypeScript
übersetzen – die Stufen aus `backend/Dockerfile`.

## 7.5 Der Nachweis heißt `healthy`, nicht `running`

```
docker compose -f docker-compose.produktion.yml ps
```

```
docker inspect --format '{{.State.Health.Status}}' devboard-prod-backend-1
```

Direkt nach dem Start steht dort `starting` – der Check hat 20 Sekunden Schonfrist, weil NestJS
seinen Modulgraphen aufbaut.

**`healthy` beweist vier Dinge auf einmal:**

1. Der Prozess läuft – und zwar das gebaute Artefakt, nicht der Quelltext.
2. NestJS ist vollständig hochgefahren.
3. Die Datenbank ist erreichbar und **antwortet** – der Endpoint fragt mit `SELECT 1` und liefert
   `503`, wenn sie fehlt.
4. Die Konfiguration ist vollständig – die Fail-Fast-Prüfung hätte den Start sonst verweigert.

`running` hätte nichts davon gesagt.

Im Log stehen dieselben Aussagen ausgeschrieben:

```
[PrismaService] Datenbankverbindung hergestellt
[NestApplication] Nest application successfully started
[Bootstrap] Backend laeuft auf http://localhost:3000
```

`localhost:3000` ist dabei die Adresse **im Container**. Von außen ist dort nichts erreichbar.

## 7.6 Der Fund im Log: `sslmode=require` prüft nichts

Unter den Startmeldungen stand eine Warnung des PostgreSQL-Treibers: Die Modi `prefer`, `require`
und `verify-ca` würden derzeit wie `verify-full` behandelt, in der nächsten Hauptversion aber nach
libpq-Bedeutung ausgelegt – mit schwächeren Garantien.

Der Verbindungsstring kam so aus dem Neon-Dashboard.

| Modus | verschlüsselt | prüft Zertifikat | prüft Hostname |
|---|---|---|---|
| `require` | ja | **nein** | **nein** |
| `verify-ca` | ja | ja | nein |
| `verify-full` | ja | ja | ja |

`require` schützt gegen Mitlesen, aber nicht gegen jemanden, der sich dazwischenschaltet und ein
eigenes Zertifikat vorzeigt. Bei einer Datenbank über das offene Internet ist genau das der Fall,
auf den es ankommt.

```
sed -i 's/sslmode=require/sslmode=verify-full/' .env.produktion
```

```
docker compose -f docker-compose.produktion.yml up -d backend
```

Kein Neubau nötig – nur die Konfiguration ändert sich. Danach stand die Verbindung unverändert, und
die Warnung war weg.

> **Ein `npm update` hätte diese Verbindung stillschweigend abgeschwächt.** Sicherheitsverhalten,
> das nur aus der großzügigen Auslegung einer Bibliothek folgt, ist nicht abgesichert.

---

# Teil 8 – Caddy und das TLS-Zertifikat

## 8.1 Den Proxy dazunehmen

```
docker compose -f docker-compose.produktion.yml up -d
```

Ohne Dienstnamen am Ende – dann startet Compose alles aus der Datei, also zusätzlich Caddy.

```
docker compose -f docker-compose.produktion.yml logs -f caddy
```

Mitlesen beenden mit `Strg+C`; das beendet nur die Anzeige, nicht den Container.

## 8.2 Was in dieser Minute passiert

Caddy sieht einen öffentlichen Domainnamen in seiner Konfiguration und handelt von selbst:

1. Er fordert bei Let's Encrypt ein Zertifikat für `api.devboard.info` an.
2. Let's Encrypt stellt eine Aufgabe: Lege unter dieser Domain auf **Port 80** eine bestimmte Datei
   ab.
3. Caddy legt sie ab. Let's Encrypt löst den Namen über **seine** Resolver auf, ruft den Server an
   und findet sie.
4. Damit ist die Kontrolle über die Domain bewiesen – Zertifikat ausgestellt, gültig 90 Tage.
5. Caddy legt es im Volumen `caddy-data` ab und erneuert es künftig selbsttätig.

Deshalb musste Port 80 in beiden Firewalls offen sein, obwohl über HTTP nichts ausgeliefert wird.

Die Bestätigung im Log:

```
{"logger":"tls.obtain","msg":"certificate obtained successfully","identifier":"api.devboard.info",
 "issuer":"acme-v02.api.letsencrypt.org-directory"}
```

## 8.3 Der Nachweis von außen

Weil der eigene Resolver noch die alte Negativantwort hielt, wurde der Name für die Prüfung fest auf
die IP gezeigt – das umgeht DNS, ohne etwas zu verändern:

```
curl -sS --resolve api.devboard.info:443:167.233.151.172 https://api.devboard.info/health
```

| Prüfung | Ergebnis |
|---|---|
| `GET /health` über HTTPS | `200` · `{"status":"ok","checks":{"database":"up"}}` |
| Zertifikatsprüfung (`ssl_verify_result`) | `0` – gültig, Kette vollständig |
| Aussteller | `Let's Encrypt`, `CN=api.devboard.info` |
| Gültigkeit | 22.08.2026 bis 20.11.2026 |
| `http://api.devboard.info/health` | `308` → `https://...` |
| Port 3000 von außen | **geschlossen** |

Die letzten beiden Zeilen sind die interessanten. Die Umleitung hat niemand konfiguriert – Caddy
macht sie, sobald HTTPS eingerichtet ist. Und Port 3000 ist nicht durch eine Regel gesperrt, sondern
**nicht vorhanden**: In der Compose-Datei steht beim Backend `expose` statt `ports`, der Port
existiert also nur im Docker-Netz.

> **Eine Firewall verbietet einen Weg, der existiert. `expose` sorgt dafür, dass der Weg gar nicht
> entsteht.** Das Zweite kann man nicht versehentlich abschalten.

---

# Teil 12 – Automatisches Deployment (Scheibe 6.4)

Was bis hierher von Hand lief – migrieren, ziehen, bauen, umschalten – erledigt ab jetzt GitHub
Actions bei jedem Merge auf `main`.

```
Merge auf main
   │
   ├─ Backend-Tests  ─┐
   ├─ Frontend-Tests ─┤  beide gruen?
   │                  ↓
   └─────────────→ Deploy
                     ├─ 1. Image bauen, nach ghcr.io schieben
                     ├─ 2. Migrationen gegen Neon
                     ├─ 3. per SSH: Image ziehen, umschalten
                     └─ 4. von aussen pruefen: /health == 200
```

Der Deploy-Job hängt über `needs` an beiden Test-Jobs. **Ein roter Test rollt nicht aus** – nicht
weil eine Regel es verbietet, sondern weil der Job dann gar nicht startet.

## 12.1 Was einmalig einzurichten ist

### Einen eigenen Deploy-Schlüssel erzeugen

**Nicht** den persönlichen Schlüssel verwenden. Ein Automat braucht einen eigenen, ohne Passphrase –
er kann keine tippen – und dafür einen, der nur diesen einen Zweck hat und einzeln zurückziehbar
ist.

Auf dem eigenen Rechner:

```
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\devboard-deploy -C "github-actions" -N '""'
```

Den **öffentlichen** Teil auf dem Server hinterlegen:

```
ssh devboard "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys" < $env:USERPROFILE\.ssh\devboard-deploy.pub
```

### Den Fingerabdruck des Servers holen

```
ssh-keyscan -t ed25519 167.233.151.172
```

Die Ausgabe wird gleich zum Geheimnis `DEPLOY_KNOWN_HOSTS`.

> **Warum das nicht im Workflow selbst passiert:** Ein `ssh-keyscan` unmittelbar vor der Verbindung
> prüft nichts – er glaubt dem, der gerade antwortet. Die Prüfung hat nur dann Wert, wenn der
> erwartete Fingerabdruck **vorher** festgelegt wurde. Vergleich ihn deshalb einmal mit dem, den dir
> deine eigene `known_hosts` schon nennt.

### Die Geheimnisse im Repository setzen

**Settings → Environments → `Production` → Add environment secret:**

Ausdrücklich **Environment secrets**, nicht Repository secrets. Der Unterschied:

| | sichtbar für |
|---|---|
| Repository-Secret | **jeden** Job in **jedem** Workflow |
| Environment-Secret | nur Jobs, die diese Umgebung ausdrücklich anfordern |

Für einen Zugang zum Produktionsserver ist das Zweite richtig: Der Schlüssel soll nicht in einem
beliebigen Testjob lesbar sein, den irgendwann jemand hinzufügt. Der Deploy-Job fordert die Umgebung
über `environment: Production` an – **ohne diese Zeile wären die Werte leer**, und der Lauf
scheiterte mit einer irreführenden Meldung wie „Permission denied (publickey)".


| Name | Wert |
|---|---|
| `DEPLOY_SSH_KEY` | Inhalt von `devboard-deploy` (der **private** Teil, inklusive der BEGIN/END-Zeilen) |
| `DEPLOY_KNOWN_HOSTS` | Ausgabe von `ssh-keyscan` |
| `DEPLOY_USER` | `devboard` |
| `DEPLOY_HOST` | `167.233.151.172` |
| `DEPLOY_BASE_URL` | `https://api.devboard.info` |
| `MIGRATION_DATABASE_URL` | Neon-Adresse **ohne** `-pooler` |

Für die Registry braucht es **kein** Geheimnis: GitHub stellt jedem Lauf einen `GITHUB_TOKEN` aus,
der nur für dieses Repository gilt und mit dem Lauf abläuft.

### Das Image-Paket sichtbar machen

Nach dem ersten Lauf erscheint unter **Packages** das Paket `devboard-backend`. Es ist zunächst
**privat** – der Server könnte es also nicht ziehen.

Unter **Package settings → Change visibility → Public** umstellen.

Das ist vertretbar, weil das Repository ohnehin öffentlich ist und im Image nachweislich keine
Geheimnisse liegen (siehe `.dockerignore` und Scheibe 6.1). Die Alternative wäre, sich auf dem
Server mit einem lesenden Token an der Registry anzumelden – dann läge ein weiteres langlebiges
Geheimnis auf der Maschine, für nichts, was nicht ohnehin einsehbar ist.

## 12.2 Was sich am Server ändert

**Er baut nicht mehr.** In `docker-compose.produktion.yml` steht kein `build:` mehr, sondern:

```yaml
image: ghcr.io/myaglioglu/devboard-backend:${DEVBOARD_TAG:-latest}
```

Der Tag ist die **Commit-Kennung**, nicht `latest`. `latest` ist ein beweglicher Zeiger: Man weiß
hinterher nicht, was läuft, und ein Rücksprung auf die vorige Fassung ist unmöglich. Mit der Kennung
ist beides eindeutig – und Scheibe 6.5 kann darauf einen Rollback bauen.

Der Deploy-Schritt setzt sie:

```
DEVBOARD_TAG=<commit> docker compose -f docker-compose.produktion.yml up -d backend
```

Von Hand starten geht weiterhin – dann greift der Rückfall auf `latest`.

## 12.3 Die Reihenfolge im Job, und warum sie so ist

**Erst bauen, dann migrieren, dann umschalten.**

Das Bauen zuerst, damit ein Fehler im Bau die Datenbank gar nicht erst erreicht. Die Migration vor
dem Umschalten, weil der Zwischenzustand dann der harmlose ist: Für einen Moment läuft die **alte**
Anwendung gegen das **neue** Schema.

Andersherum – neuer Code, altes Schema – wäre die Anwendung zwischen beiden Schritten kaputt.

Daraus folgt eine Regel, die ab jetzt für jede Migration gilt: **Sie muss abwärtskompatibel sein.**
Spalte hinzufügen ist unkritisch. Spalte umbenennen geht nur in zwei Schritten über zwei Deployments
(neue Spalte anlegen, beide schreiben, umstellen, alte entfernen). Das nennt sich Expand/Contract.

## 12.4 Der Nachweis gehört dazu

Der letzte Schritt fragt `https://api.devboard.info/health` **von außen** ab, bis `200` mit
`"database":"up"` kommt – höchstens hundert Sekunden lang.

Ohne diesen Schritt hieße „Deployment erfolgreich" nur, dass kein Befehl fehlgeschlagen ist. Der
Container kann laufen und trotzdem nicht antworten; er kann antworten und die Datenbank nicht
erreichen. Geprüft wird deshalb über dieselbe Adresse wie bei einem Besucher – samt Reverse Proxy
und TLS.

**Was dieser Schritt noch nicht tut:** zurückrollen. Er meldet den Fehlschlag, die kaputte Fassung
läuft aber weiter. Der Rückweg ist Scheibe 6.5 – und er ist erst dadurch möglich, dass jedes Image
unter seiner Commit-Kennung liegt.

## 12.5 Wenn etwas schiefgeht

| Meldung | Ursache |
|---|---|
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` fehlt oder passt nicht zum Server |
| `Permission denied (publickey)` | Der öffentliche Deploy-Schlüssel liegt nicht in `authorized_keys` |
| `denied: ... pull access` beim `pull` | Das Paket ist noch privat (siehe 12.1) |
| `migrate deploy` scheitert | `MIGRATION_DATABASE_URL` zeigt auf die gepoolte statt die direkte Adresse |
| Health-Check läuft in die Zeitgrenze | `docker compose logs backend` auf dem Server – meist eine fehlende Umgebungsvariable |

---

# Teil 9 – Betrieb im Alltag

```
docker compose -f docker-compose.produktion.yml ps
```

```
docker compose -f docker-compose.produktion.yml logs -f backend
```

```
docker compose -f docker-compose.produktion.yml restart backend
```

Neue Fassung ausrollen (bis Scheibe 6.4 von Hand):

```
git pull && docker compose -f docker-compose.produktion.yml up -d --build
```

## Was auf diesem Server bewusst NICHT läuft

- **PostgreSQL** – liegt bei Neon (ADR-016). Deshalb ist 5432 nirgends offen.
- **Node** – nur im Container. Auf dem Wirt ist keins installiert.
- **Ein zweiter Weg zum Backend** – siehe oben.

## Was noch offen ist

- **`caddy-data` ist das wichtigste Volumen auf diesem Server.** Dort liegen Zertifikate und private
  Schlüssel. Geht es verloren, werden alle Zertifikate neu angefordert – und Let's Encrypt begrenzt
  das auf fünf gleiche Zertifikate pro Woche. Ein unbedachtes `docker compose down -v` sperrt die
  Domain für Tage aus.
- **Der Server baut das Image selbst.** Vorläufig; ab Scheibe 6.4 baut GitHub Actions, und der
  Server zieht nur noch das fertige Image.
- **`app.enableShutdownHooks()` fehlt** in `main.ts`. Das Signal kommt an, wird aber nicht
  ausgewertet, deshalb bleiben beim Deploy Verbindungen im Neon-Pool hängen. Gehört zu Scheibe 6.5.
- **Kein Uptime-Wächter.** Fällt der Server nachts aus, erfährt es niemand. Scheibe 6.7.
