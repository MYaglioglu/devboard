# =============================================================================
# DevBoard Backend - Produktions-Image
# =============================================================================
#
# WARUM MEHRSTUFIG ("multi-stage")?
#
# Zum Bauen brauchen wir Werkzeug: TypeScript, den Nest-CLI, den Prisma-CLI,
# Jest, ESLint. Zum *Laufen* brauchen wir davon nichts - nur fertiges
# JavaScript und die Laufzeit-Abhaengigkeiten.
#
# Eine einstufige Fassung wuerde all das mit ausliefern. Das kostet drei Dinge:
#
#   1. Groesse - jeder Deploy zieht das ueber die Leitung.
#   2. Angriffsflaeche - jede mitgelieferte Bibliothek ist eine, die eine
#      Sicherheitsluecke haben kann, auch wenn sie nie aufgerufen wird.
#   3. Vertraulichkeit - der Quelltext selbst waere im Image. Wer es zieht,
#      liest ihn.
#
# Mit mehreren Stufen wird gebaut, und danach wandert nur das *Ergebnis* in
# ein frisches Image. Alles andere bleibt zurueck und landet nie in einer
# Schicht des Endprodukts.
#
# Bauen:   docker build -t devboard-backend:lokal ./backend
# Starten: siehe docker-compose.produktion.yml (Scheibe 6.2)
# =============================================================================

# syntax=docker/dockerfile:1


# -----------------------------------------------------------------------------
# Stufe 1: Basis
# -----------------------------------------------------------------------------
# Alpine statt des vollen Debian-Images: ~50 MB statt ~350 MB. Das ist hier
# gefahrlos, weil Prisma 7 ueber einen Driver Adapter (`@prisma/adapter-pg`)
# spricht - also ueber den Node-Treiber `pg`, nicht ueber eine Rust-Binaerdatei.
# Bis Prisma 6 war genau das der Grund, warum Alpine reihenweise scheiterte:
# Die Engine ist gegen glibc gebaut, Alpine benutzt musl. Die Entscheidung aus
# Sprint 1 zahlt hier zum ersten Mal aus.
#
# Version festgenagelt, nicht `node:latest`. Ein Image, das sich unter dem
# gleichen Namen aendert, macht Builds unreproduzierbar - und der Tag, unter
# dem es gestern noch ging, existiert dann nicht mehr.
FROM node:24-alpine AS basis

WORKDIR /app

# Nur die beiden Manifest-Dateien, nicht der ganze Quelltext.
#
# Das ist der wichtigste Trick fuer schnelle Builds: Docker cached jede Schicht
# und baut ab der ersten Aenderung neu. Kaeme der Quelltext vor `npm ci`, wuerde
# jede geaenderte Zeile Code eine komplette Neuinstallation ausloesen. So laeuft
# `npm ci` nur dann neu, wenn sich tatsaechlich Abhaengigkeiten geaendert haben.
COPY package.json package-lock.json ./


# -----------------------------------------------------------------------------
# Stufe 2: Alle Abhaengigkeiten (inklusive Werkzeug)
# -----------------------------------------------------------------------------
FROM basis AS abhaengigkeiten

# `npm ci` statt `npm install` - dieselbe Begruendung wie in der CI:
# installiert exakt die Versionen aus dem Lockfile und schlaegt fehl, wenn
# package.json und Lockfile auseinanderlaufen. `npm install` wuerde das
# Lockfile bei Bedarf still anpassen, und dann baut das Image etwas anderes
# als der Entwicklungsrechner.
RUN npm ci


# -----------------------------------------------------------------------------
# Stufe 3: Bauen
# -----------------------------------------------------------------------------
FROM abhaengigkeiten AS build

COPY . .

# REIHENFOLGE IST HIER PFLICHT, NICHT GESCHMACK.
#
# Der Prisma-Client wird nach `src/generated/prisma` erzeugt (siehe
# schema.prisma) und ist TypeScript. Er muss also *vorhanden* sein, bevor
# `nest build` laeuft - sonst kompiliert TypeScript gegen einen Import, den es
# nicht gibt, und der Build bricht ab.
#
# Genau umgekehrt zur Intuition: Man erzeugt den Datenbank-Client, ohne dass
# eine Datenbank erreichbar ist. `generate` liest nur das Schema, es verbindet
# sich mit nichts. `migrate deploy` ist der Befehl, der eine Datenbank braucht -
# und der laeuft spaeter beim Deploy, nicht hier.
RUN npx prisma generate

RUN npm run build


# -----------------------------------------------------------------------------
# Stufe 4: Nur die Laufzeit-Abhaengigkeiten
# -----------------------------------------------------------------------------
# Eine eigene Stufe, damit `node_modules` ohne Werkzeug entsteht. Man koennte
# stattdessen in Stufe 2 nachtraeglich `npm prune --omit=dev` aufrufen - das
# waere aber langsamer und stuende auf einer Schicht, die die Dev-Pakete schon
# enthaelt. Weggeworfene Dateien verschwinden aus einer Schicht nicht.
FROM basis AS produktions-abhaengigkeiten

# `--omit=peer` ist hier NICHT kosmetisch, sondern der eigentliche Hebel.
#
# `@prisma/client` fuehrt `prisma` und `typescript` als *optionale
# Peer-Abhaengigkeiten*. npm vermerkt sie im Lockfile als `devOptional` - also
# "gehoert zum Dev-Baum ODER zum Peer-/Optional-Baum". `--omit=dev` allein
# laesst sie deshalb stehen, und der ganze CLI-Rattenschwanz kommt mit:
# @prisma/engines, @prisma/dev (ein Postgres als WebAssembly), effect,
# typescript. Gemessen: 743 MB statt 389 MB.
#
# Das war nicht offensichtlich: package.json war korrekt, das Image blieb
# trotzdem exakt gleich gross. Sichtbar wurde es erst durch Nachmessen IM
# Container.
#
# WARUM NICHT `--omit=optional`, der naheliegende erste Griff:
# Genau das war der erste Versuch, und er hat die Anwendung zerstoert.
# `@node-rs/argon2` liefert seine native Binaerdatei
# (argon2.linux-x64-musl.node) als *optionalDependency* aus - so verteilen
# native Module ihre plattformabhaengigen Varianten. `--omit=optional` warf
# also mit dem Prisma-CLI auch das Passwort-Hashing weg. Der Container startete
# nicht mehr.
#
# `--omit=peer` waere der praezisere Schalter gewesen - er wirkt hier aber
# nicht, weil npm beide im Lockfile als `devOptional` fuehrt und nicht als
# `peer`. Gemessen: unveraendert 734 MB. Der einzige Schalter, der greift, ist
# `--omit=optional`.
#
# Der nimmt aber die argon2-Binaerdatei mit. Deshalb wird sie in der
# Laufzeit-Stufe gezielt aus der vollstaendigen Installation zurueckgeholt -
# siehe dort. Nicht per `npm install` nachinstalliert: Das umginge das
# Lockfile und koennte eine andere Version ziehen als die getestete.
RUN npm ci --omit=dev --omit=optional && npm cache clean --force


# -----------------------------------------------------------------------------
# Stufe 5: Laufzeit - das ist das Image, das ausgeliefert wird
# -----------------------------------------------------------------------------
# Bewusst wieder von `node:24-alpine` und NICHT von `basis`: So faengt diese
# Stufe frisch an. Nichts aus den Bau-Stufen ist hier, ausser dem, was
# ausdruecklich hereinkopiert wird.
FROM node:24-alpine AS laufzeit

# Setzt Express und viele Bibliotheken in den Produktionsmodus (weniger
# Protokollierung, keine ausfuehrlichen Fehlerseiten). Nicht kosmetisch:
# Ein Stacktrace in einer HTTP-Antwort verraet Pfade und Versionen.
ENV NODE_ENV=production

WORKDIR /app

COPY --from=produktions-abhaengigkeiten /app/node_modules ./node_modules

# Die native argon2-Binaerdatei zurueckholen, die `--omit=optional` entfernt hat.
#
# `@node-rs/argon2` ist eine Rust-Bibliothek mit Node-Anbindung. Sie liefert
# fuer jede Plattform ein eigenes Paket (hier argon2.linux-x64-musl.node) und
# deklariert diese Varianten als optionalDependencies - so installiert npm nur
# die passende und ignoriert die uebrigen ohne Fehler.
#
# Quelle ist bewusst die Stufe `abhaengigkeiten`: Dort entstand sie durch
# `npm ci` aus dem Lockfile, in genau der Version, gegen die die Tests liefen.
# Das ist der Unterschied zwischen Zurueckholen und Nachinstallieren.
COPY --from=abhaengigkeiten /app/node_modules/@node-rs ./node_modules/@node-rs

COPY --from=build /app/dist ./dist

# Node liest aus package.json das Feld `"type"`. Ohne die Datei deutet Node
# die .js-Dateien im Zweifel als ESM statt CommonJS - und Nest kompiliert
# nach CommonJS.
COPY package.json ./

# WARUM HIER KEIN PRISMA-CLI UND KEIN prisma/-VERZEICHNIS LIEGT
#
# Der erste Entwurf hat beides mitgeliefert, damit `prisma migrate deploy` im
# Container laufen kann. Dafuer mussten `prisma` und `dotenv` aus den
# devDependencies zu den dependencies wandern. Gemessen statt geschaetzt:
#
#     mit CLI im Image     743 MB
#     ohne CLI im Image    siehe docs/13_DEPLOYMENT.md
#
# Der CLI zieht `@prisma/engines`, `@prisma/dev` (mit einem kompletten
# Postgres als WebAssembly), `effect` und `typescript` hinter sich her - rund
# 270 MB fuer einen Befehl, der EINMAL PRO DEPLOY laeuft und danach nie wieder.
#
# Die Migration laeuft deshalb nicht hier, sondern im Deploy-Workflow (6.4).
# Das geht nur, weil die Datenbank bei Neon liegt und damit vom
# GitHub-Actions-Runner aus erreichbar ist (ADR-016). Laege Postgres auf dem
# eigenen Server hinter einer Firewall, waere diese Abkuerzung zu, und es
# braeuchte ein eigenes Migrations-Image.
#
# Der Preis dieser Trennung, und er ist echt: Migration und neuer Code werden
# zu verschiedenen Zeitpunkten wirksam. Fuer einen kurzen Moment laeuft die
# ALTE Anwendung gegen das NEUE Schema. Migrationen muessen deshalb
# abwaertskompatibel sein - Spalte hinzufuegen ja, Spalte umbenennen nur in
# zwei Schritten. Das ist Thema von Scheibe 6.5.

# NICHT als root laufen.
#
# Der Standard in einem Container ist root, und das ist der haeufigste
# vermeidbare Fehler in Produktions-Images. Wer eine Luecke in der Anwendung
# findet, steht sonst als root im Container - und von dort ist der Weg zum
# Host je nach Konfiguration kurz.
#
# Der Benutzer `node` (UID 1000) ist im offiziellen Image bereits angelegt.
# Er besitzt die kopierten Dateien nicht, aber er darf sie lesen und
# ausfuehren - und schreiben soll die Anwendung ohnehin nirgends.
USER node

# Reine Dokumentation, keine Wirkung: EXPOSE oeffnet nichts. Es haelt fest,
# auf welchem Port dieses Image lauscht, damit der Reverse Proxy in 6.2 nicht
# raten muss.
EXPOSE 3000

# Der Container sagt selbst, ob er gesund ist. Der Endpoint prueft die
# Datenbank mit `SELECT 1` und antwortet 503, wenn sie fehlt - ein
# Health-Check, der nur "Prozess laeuft" meldet, waere wertlos.
#
# `node -e` statt `curl`, weil Alpine kein curl mitbringt und wir es fuer eine
# Zeile nicht nachinstallieren. Node ist ohnehin da.
#
# start-period: NestJS baut beim Start seinen Modulgraphen auf und verbindet
# sich mit der Datenbank. Ohne diese Schonfrist gilt der Container waehrend des
# normalen Starts als krank.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec-Form (JSON-Array), nicht Shell-Form.
#
# In der Shell-Form waere PID 1 eine Shell, und die reicht Signale nicht an
# Node weiter. Beim Deploy schickt Docker erst SIGTERM und wartet - der
# Prozess bekaeme es nie zu sehen und wuerde nach der Frist hart abgeschossen.
# Fuer sauberes Herunterfahren ist das die Voraussetzung.
#
# Kein `npm run start:prod`: npm waere ein zusaetzlicher Prozess dazwischen,
# der genau dasselbe Signalproblem erzeugt.
CMD ["node", "dist/main"]
