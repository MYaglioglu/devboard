# Deployment

Wo DevBoard läuft, wie es dorthin kommt und was dabei schiefgehen kann.

Die Entscheidung über die Aufteilung steht in **ADR-016**. Diese Datei beschreibt die Umsetzung.

---

## Zielbild

```
Browser
   │
   ├──→ Vercel .................. Next.js (Frontend)
   │       │
   │       └──→ HTTPS
   │              ↓
   └──→ Hetzner ................. Reverse Proxy → NestJS im Container
                                                     │
                                                     └──→ Neon (PostgreSQL)
```

Drei Anbieter, aufgeteilt nach Schadenshöhe: Was nur eine Wiederholung kostet, betreiben wir selbst.
Was unwiederbringlich ist – die Daten – liegt bei jemandem mit Backups.

| Teil | Wo | Kosten |
|---|---|---|
| Frontend | Vercel (Hobby) | 0 € |
| Backend | Hetzner CX22 | ~4 €/Monat |
| Datenbank | Neon (Free) | 0 € |
| Domain | – | ~10 €/Jahr |

---

## Stand der Umsetzung

| Scheibe | Inhalt | Status |
|---|---|---|
| 6.1 | Produktions-Image für das Backend | **fertig** (16.08.2026) |
| 6.2 | Server, Reverse Proxy, TLS, Neon angebunden | offen |
| 6.3 | Staging als zweite Umgebung | offen |
| 6.4 | Deploy aus GitHub Actions, Migrationen | offen |
| 6.5 | Zero-Downtime, Health-Gate, Rollback | offen |
| 6.6 | Frontend auf Vercel, CORS, Webhook-URL | offen |
| 6.7 | Backups, Uptime-Wächter, Doku | offen |

---

## 6.1 – Das Produktions-Image

`backend/Dockerfile`, fünf Stufen. Gebaut wird mit vollem Werkzeug, ausgeliefert wird nur das
Ergebnis.

```bash
docker build -t devboard-backend:lokal ./backend
```

### Warum Alpine hier gefahrlos ist

Bis Prisma 6 war Alpine ein Minenfeld: Die Query-Engine ist eine Rust-Binärdatei gegen **glibc**,
Alpine benutzt **musl**. Seit Prisma 7 spricht DevBoard über einen **Driver Adapter**
(`@prisma/adapter-pg`), also über den Node-Treiber `pg`. Es gibt keine Engine mehr, die zur
Plattform passen müsste. Die Entscheidung aus Sprint 1 zahlt hier zum ersten Mal aus.

### Die Größe – gemessen, nicht geschätzt

| Fassung | Image | `node_modules` |
|---|---|---|
| Erster Entwurf, Prisma-CLI im Image | **743 MB** | 385 MB |
| Ausgeliefert | **390 MB** | 115 MB |

Der Unterschied sind rund 270 MB Werkzeug, das **einmal pro Deploy** gebraucht wird:
`@prisma/engines`, `@prisma/dev` (enthält ein komplettes PostgreSQL als WebAssembly), `effect`
und `typescript`.

Der erste Entwurf hatte den Prisma-CLI mitgeliefert, damit `prisma migrate deploy` im Container
laufen kann – dafür mussten `prisma` und `dotenv` von den `devDependencies` zu den `dependencies`
wandern. Die Messung hat die Entscheidung widerlegt. Weil die Datenbank bei Neon liegt und damit
vom GitHub-Actions-Runner erreichbar ist (ADR-016), läuft die Migration in der Pipeline, und der
CLI bleibt draußen.

### Die Falle mit `--omit`

`npm ci --omit=dev` allein entfernt den Prisma-CLI **nicht**. Grund: `@prisma/client` führt `prisma`
und `typescript` als *optionale Peer-Abhängigkeiten*, und npm vermerkt sie im Lockfile als
`devOptional`. Der Eintrag gehört damit zu zwei Bäumen gleichzeitig.

Der naheliegende nächste Griff – `--omit=optional` – wirkt, **zerstört aber die Anwendung**:
`@node-rs/argon2` liefert seine native Binärdatei (`argon2.linux-x64-musl.node`) als
`optionalDependency` aus. So verteilen native Module ihre plattformabhängigen Varianten: Es sind
mehrere Pakete deklariert, und npm installiert schweigend nur das passende. Ohne die Datei startet
der Container nicht.

> **Der Unterschied in einem Satz:** `optional` sind Pakete, die fehlen *dürfen*. `peer` sind
> Pakete, die der Anwender bereitstellen *soll*. Der Prisma-CLI ist das Zweite, die
> argon2-Binärdatei das Erste. npm wirft sie im Lockfile trotzdem in einen Topf.

Gelöst durch gezieltes Zurückholen aus der Bau-Stufe:

```dockerfile
COPY --from=abhaengigkeiten /app/node_modules/@node-rs ./node_modules/@node-rs
```

Bewusst **nicht** per `npm install` nachinstalliert – das umginge das Lockfile und könnte eine
andere Version ziehen als die getestete.

### Was das Image außerdem tut

- **Läuft als `node` (UID 1000), nicht als root.** Der häufigste vermeidbare Fehler in
  Produktions-Images. Wer eine Lücke in der Anwendung findet, steht sonst als root im Container.
- **`HEALTHCHECK` gegen `/health`.** Der Endpoint prüft die Datenbank mit `SELECT 1` und antwortet
  503, wenn sie fehlt. `node -e` statt `curl`, weil Alpine kein curl mitbringt.
- **Exec-Form beim `CMD`**, kein `npm run start:prod`. In der Shell-Form wäre PID 1 eine Shell, die
  SIGTERM nicht weiterreicht – der Prozess würde beim Deploy nach Ablauf der Frist hart
  abgeschossen statt sauber herunterzufahren.

### Nachweis

Kein „startet vermutlich". Gegen das lokale PostgreSQL geprüft:

| Prüfung | Ergebnis |
|---|---|
| `GET /health` | `200`, `{"database":"up"}` |
| `POST /auth/register` | `201` |
| `POST /auth/login`, richtiges Passwort | `200` |
| `POST /auth/login`, falsches Passwort | `401` |
| Benutzer im Container | `uid=1000(node)` |

Registrierung und Login stehen bewusst in der Liste: Der Health-Check hasht kein Passwort. Ohne sie
wäre die argon2-Binärdatei nur *vorhanden* gewesen, nicht *nachweislich funktionsfähig* – und genau
darin bestand der Fehler des zweiten Entwurfs.

---

## Offen: was ab 6.2 gebraucht wird

Beides muss von Hand angelegt werden und blockiert 6.2:

1. **Hetzner Cloud Server** (CX22, Standort Nürnberg oder Falkenstein), SSH-Schlüssel hinterlegt,
   Passwort-Anmeldung abgeschaltet.
2. **Eine Domain.** Ohne sie kein TLS-Zertifikat.

---

## Bekannte Baustelle: Graceful Shutdown

Das Image reicht SIGTERM korrekt an Node weiter – aber `main.ts` ruft **`app.enableShutdownHooks()`
nicht auf**. Ohne diesen Aufruf führt NestJS beim Herunterfahren `onModuleDestroy` nicht aus, und
`PrismaService.$disconnect()` bleibt liegen.

Folge: Bei jedem Deploy bleiben Verbindungen im Pool der Datenbank hängen, bis sie auslaufen. Bei
Neon mit begrenzter Verbindungszahl ist das keine Kosmetik.

Gehört nach **Scheibe 6.5** (Zero-Downtime), zusammen mit der Frage, wie lange der Reverse Proxy
eine Instanz nach dem Signal noch bedienen darf.
