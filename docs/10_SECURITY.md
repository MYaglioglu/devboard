# Security

Security by Design – Sicherheit wird mitgebaut, nicht nachträglich aufgesetzt. Dieses Dokument
wächst mit jedem Sprint und hält fest, **welche Maßnahme welches Risiko adressiert**.

---

## Bereits umgesetzt (Sprint 0)

### Secrets liegen nie im Repository

`.env` steht in der `.gitignore`, im Repository liegt nur `.env.example` mit Platzhaltern. Vor jedem
Commit wird die Dateiliste geprüft.

**Wenn doch einmal ein Secret committet wurde:**
1. **Secret sofort rotieren** – Passwort oder Token ungültig machen. Das ist der einzige Schritt, der
   tatsächlich schützt.
2. Erst danach die Historie bereinigen (`git filter-repo` oder BFG) und Force-Push.

Die Reihenfolge ist entscheidend. Wer nur die Historie säubert, hat nichts gesichert – das Secret
liegt bereits in jedem Klon und potenziell in Caches von Hosting-Anbietern.

### Konfiguration wird validiert

Umgebungsvariablen werden beim Start gegen ein Zod-Schema geprüft. Verhindert, dass die Anwendung mit
halber Konfiguration hochkommt und sich unvorhersehbar verhält.

### Eindeutigkeit wird von der Datenbank erzwungen

`email` hat einen `UNIQUE`-Constraint. Eine Prüfung im Anwendungscode allein hätte eine Race
Condition zwischen Prüfen und Schreiben.

### Version gepinnt

`postgres:18-alpine` statt `latest`. Verhindert unbemerkte Versionssprünge – siehe ADR-004.

### CORS restriktiv konfiguriert

Das Backend erlaubt ausschließlich die in `CORS_ORIGIN` genannten Herkünfte – lokal
`http://localhost:3001`. **Kein `origin: '*'`**: Das erlaubte jeder beliebigen Webseite, im Namen
angemeldeter Nutzer Anfragen zu stellen und die Antworten auszulesen. In Verbindung mit
`credentials: true` verbietet die Spezifikation den Platzhalter ohnehin.

Wichtige Einordnung fürs Verständnis: CORS verhindert das **Auslesen** fremder Antworten, nicht das
Absenden der Anfrage. Gegen unerwünschte schreibende Aufrufe schützen `SameSite`-Cookies und
CSRF-Maßnahmen – das wird in Sprint 1 mit der Authentifizierung relevant.

### Authentifizierung (Sprint 1)

- Passwörter mit **argon2id** gehasht, Salt und Parameter im Hash enthalten
- **Access-Token** (JWT, HS256, 15 Minuten) – Verfahren serverseitig festgelegt, damit der
  `alg: none`-Angriff ausgeschlossen ist
- **Refresh-Token** (30 Tage) im `httpOnly`-Cookie mit `SameSite=Lax` und `Path=/auth`,
  serverseitig als SHA-256-Hash gespeichert und damit widerrufbar
- **Rotation mit Wiederverwendungs-Erkennung**: Ein erneut vorgelegter, verbrauchter Token führt
  zum Widerruf der gesamten Token-Familie
- **Generische Fehlermeldung beim Login** – und Schutz gegen Timing-Angriffe durch Prüfung gegen
  einen Platzhalter-Hash, auch wenn der Nutzer nicht existiert
- **Secure by Default**: Der Access-Token-Guard läuft global, einzelne Routen werden mit
  `@Oeffentlich()` freigegeben. Ein vergessener Guard führt zu 401, nicht zu einem offenen Endpoint.
- Zugangsnachweis über den `Authorization`-Header, nicht über ein Cookie – dadurch ist CSRF für
  geschützte Endpoints strukturell ausgeschlossen

### Härtung (Sprint 1, Scheibe 6)

**Rate Limiting** – 100 Anfragen pro Minute und IP global, **5 pro Minute** für Anmelden und
Registrieren.

Warum das nötig ist, obwohl argon2 schon bremst: argon2 macht **einen** Versuch teuer
(~50–100 ms) – das schützt gegen das Durchprobieren eines geklauten Hashes, nicht gegen jemanden,
der einfach viele Anfragen schickt. Rate Limiting begrenzt die **Anzahl**, argon2 die **Kosten pro
Versuch**. Erst beides zusammen macht Brute Force unwirtschaftlich.

Die strengen Grenzen stehen fest im Code (`auth/throttle.ts`), nicht in der Konfiguration: Das ist
eine Sicherheitsentscheidung, keine Betriebseinstellung. Wer sie pro Umgebung lockern kann, lockert
sie irgendwann versehentlich in Produktion.

**Guard-Reihenfolge:** Das Rate Limiting läuft **vor** der Token-Prüfung. Ein Angreifer, der den
Server flutet, soll abgewiesen werden, bevor für jede Anfrage eine Signatur geprüft wird – sonst
wäre die Prüfung selbst der Angriffspunkt.

**Security-Header (Helmet)** – unter anderem `X-Content-Type-Options: nosniff` (verbietet das
Erraten des Inhaltstyps), `X-Frame-Options` (Clickjacking), `Strict-Transport-Security` (erzwingt
HTTPS, wirkt erst in Produktion). Außerdem entfällt `X-Powered-By` – eine kostenlose Auskunft an
Angreifer darüber, wonach sie suchen sollen.

**Einheitliche Fehlerantworten** – ein globaler Exception-Filter. Absichtliche Fehler
(`HttpException`) werden unverändert durchgereicht, damit feldbezogene Validierungsmeldungen
erhalten bleiben. Alles andere wird vollständig **ins Log** geschrieben und nach außen zu
„Interner Serverfehler". Ein Stacktrace verrät Dateipfade, Bibliotheksversionen und Teile des
Quelltexts – genau daraus baut ein Angreifer sein Bild vom System.

> **Bekannte Grenze:** Der Zähler des Rate Limiters liegt im Arbeitsspeicher. Bei einer Instanz
> genügt das. Laufen später mehrere hinter einem Loadbalancer, hat jede ihren eigenen Zähler und
> die tatsächliche Grenze vervielfacht sich. Dann braucht es einen gemeinsamen Speicher (Redis).

### Keine Geheimnisse im Frontend-Bundle

Variablen mit `NEXT_PUBLIC_`-Präfix landen beim Build im Browser-Bundle und sind öffentlich lesbar.
Dort steht ausschließlich die API-Basis-URL.

---

## Bekannte offene Punkte

| Punkt | Risiko | Fällig |
|---|---|---|
| Port 5432 ist nach außen veröffentlicht | In Produktion hinge die Datenbank am Internet, geschützt nur durch ein Passwort | Sprint 6 |
| Kein Rate Limiting | Brute-Force auf Login möglich | Sprint 1 |
| Kein Helmet / Security-Header | XSS, Clickjacking | Sprint 1 |
| Keine einheitlichen Fehlerantworten | Stacktraces könnten nach außen gelangen | Sprint 1 |
| Secrets aus `.env`-Datei statt Secret-Store | in Produktion unzureichend | Sprint 6 |
| `WEBHOOK_ENCRYPTION_KEY` liegt neben den Daten | Wer Datenbank **und** Schlüssel hat, hat alle Webhook-Geheimnisse im Klartext | Sprint 6 |
| Keine Schlüsselrotation umgesetzt | Ein kompromittierter Schlüssel lässt sich nur mit Ausfall wechseln | Sprint 6 |
| ~~Keine Aufbewahrungsfrist für `webhook_deliveries`~~ | **umgesetzt in Scheibe 5.7** – siehe unten | 16.08.2026 |
| Das Abräumen läuft nicht von selbst | Ohne Scheduler muss es angestoßen werden | Sprint 6 |

Der erste Punkt ist der wichtigste und der am leichtesten zu vergessen: Eine
Entwicklungs-Einstellung, die niemand vor dem Deployment zurückdreht, ist eine der häufigsten
Ursachen echter Sicherheitsvorfälle.

### Zum Schlüssel neben den Daten – ausdrücklich benannt

Verschlüsselung im Ruhezustand schützt **deutlich weniger** als Hashing, und das gehört
hingeschrieben statt beschönigt. Sie schützt gegen ein geleaktes Backup, eine weggeworfene
Festplatte, einen Dump, der versehentlich in einem Ticket landet. Sie schützt **nicht** gegen einen
übernommenen Anwendungsserver – dort liegt der Schlüssel.

Bei argon2 gilt das nicht: Selbst mit vollem Zugriff bekommt niemand die Passwörter zurück. Der
Unterschied ist kein Versäumnis, sondern der Preis der Funktion – ein HMAC muss *nachgerechnet*
werden, und dafür braucht es den Klartext (ADR-014).

Was dagegen möglich war, ist umgesetzt: **jedes Projekt hat ein eigenes Geheimnis.** Ein einziges
aus der Konfiguration für alle wäre bequemer gewesen und hätte jedes Projekt zum Nachbarn jedes
anderen gemacht – wer eines kennt, könnte Ereignisse für alle signieren. Die `keyVersion`-Spalte
steht bereits im Schema, damit eine Rotation später ohne Ausfall möglich ist; benutzt wird sie
noch nicht.

### Aufbewahrungsfrist für `webhook_deliveries` (Scheibe 5.7)

Diese Tabelle ist die einzige im Projekt, die **fremde Rohdaten** speichert: Commit-Nachrichten,
Zweignamen, GitHub-Anmeldenamen, oft auch E-Mail-Adressen von Menschen, die nie etwas mit DevBoard
zu tun hatten. Erhoben haben wir davon nichts – es kam mit der Nutzlast.

Sie wächst unbegrenzt und wird nach der Verarbeitung nie wieder gelesen. Damit ist sie genau das,
wovor jede Datenschutzprüfung warnt: **ein Speicher ohne Zweck und ohne Ende.**

`raeumeAlteZustellungenAb(tage)` entfernt deshalb verarbeitete Zustellungen jenseits der Frist.
Empfohlen sind 30 Tage.

#### Was ausdrücklich **nicht** gelöscht wird

| Zustand | Warum er bleibt |
|---|---|
| `ACCEPTED` | Noch nicht verarbeitet. Löschen hieße, ein Ereignis zu verlieren, das nie im Feed ankam. |
| `FAILED` | Genau die Zeilen, derentwegen die Tabelle existiert. Wer sie nach 30 Tagen wegräumt, löscht die Fehler, die er noch nicht angesehen hat. |

Dass die Halde aus gescheiterten Zeilen damit unbegrenzt wachsen *kann*, ist der bewusst gewählte
Rest: **lieber eine Liste, die auffällt, als eine, die sich selbst aufräumt.**

#### Zwei Details mit Begründung

Die Frist läuft ab `receivedAt`, nicht ab `processedAt`. Sie beginnt, wenn wir die Daten
**bekommen** haben – wann wir sie verarbeitet haben, ist unsere Sache und darf die Aufbewahrung
nicht verlängern. Sonst hielte eine spät verarbeitete Zeile ihre Daten länger fest als eine
pünktliche.

Eine Frist unter einem Tag wird abgewiesen statt auf einen Vorgabewert zurückzufallen. `0` würde
alles Verarbeitete löschen – ein Tippfehler mit unumkehrbarer Wirkung soll ein Fehler sein, kein
stiller Rückfall.

**Der Feed bleibt unberührt.** Gelöscht werden die Rohdaten; die daraus entstandenen Aktivitäten
hängen an der Organisation und sind das, was fachlich zählt.

**Offen und benannt:** Es läuft nichts von selbst. Ohne Scheduler muss das Abräumen angestoßen
werden – dieselbe Lücke wie bei der Verarbeitung, und sie wird in Sprint 6 zusammen geschlossen,
wo mit dem Deployment ohnehin die Frage aufkommt, was regelmäßig laufen soll.

### Umgesetzt in Scheibe 5.3

- **HMAC-SHA256 über den Rohrumpf**, verglichen mit `timingSafeEqual` – ein abbrechender Vergleich
  verrät über die Laufzeit, wie viele Zeichen gestimmt haben
- Der Rumpf wird **erst nach** der Prüfung geparst. Bis dahin ist er nichts als Bytes aus dem
  Internet
- Unbekannte Verbindung, falsche Signatur und fehlende Kopfzeilen ergeben dieselbe **leere 404** –
  sonst wäre der Endpoint ein Orakel darüber, welche Verbindungs-IDs existieren
- `ping` wird beantwortet, aber **nach** der Signaturprüfung
- Protokolliert wird, *dass* eine Signatur nicht stimmte – nicht die gelieferte Signatur und erst
  recht nicht das Geheimnis. Ein Protokoll ist eine Datei, die kopiert und weitergereicht wird
- Mutationsprobe am Schutz selbst: Prüfung entfernt, genau die vier vorhergesagten Tests wurden rot

**Was eine Signatur hier beweist – und was nicht.** Sie beweist, dass der Absender das Geheimnis
kennt und der Rumpf unverändert ist. Sie beweist **nicht**, *wer* der Absender ist: HMAC ist
symmetrisch, beide Seiten haben denselben Schlüssel, also kann jede erzeugen, was die andere
erzeugen könnte. Praktisch genügt das, weil das Geheimnis nur wir und GitHub kennen – aber
„signiert" klingt umgangssprachlich nach Urheberschaft, und die ist es nicht.

| Neuer offener Punkt | Risiko | Fällig |
|---|---|---|
| Webhook-Endpoint unter dem globalen Rate Limit | Ein Push-Sturm kann 429 auslösen | offen, siehe unten |

Das ist derzeit vertretbar: GitHub stellt bei einem Fehlschlag erneut zu, die Zustellung geht also
nicht verloren, sondern verzögert sich. Ein eigenes, höheres Limit für diesen Endpoint wäre die
saubere Lösung – aber ein *abgeschaltetes* Limit wäre die falsche: Der Endpoint ist öffentlich, und
ohne Grenze wäre er eine Einladung, die Datenbank mit abgelehnten Anfragen zu beschäftigen.

### Umgesetzt in Scheibe 5.2

- Webhook-Geheimnis mit **AES-256-GCM** verschlüsselt, IV je Verschlüsselung neu gezogen
- Der Authentifizierungs-Tag von GCM macht eine veränderte Zeile in der Datenbank bemerkbar,
  statt stillschweigend Unsinn zu liefern – vier Unit-Tests halten das fest
- Geheimnis **einmalig** im Klartext ausgeliefert, danach über keinen Endpoint mehr abrufbar
- `WEBHOOK_ENCRYPTION_KEY` wird beim **Start** geprüft (genau 32 Byte), nicht beim ersten Zugriff
- Mandantenfilter in der `WHERE`-Bedingung, belegt durch eine Mutationsprobe (`12_TESTING.md`)

---

## Geplant

### Sprint 1 – Authentifizierung
- Passwörter mit **argon2** gehasht, niemals im Klartext gespeichert oder geloggt
- Kurzlebiger Access-Token, langlebiger Refresh-Token mit **Rotation** und Erkennung
  wiederverwendeter Token
- Refresh-Token serverseitig widerrufbar (Logout muss wirken)
- Rate Limiting auf Login und Registrierung
- Einheitliche Fehlerantworten – keine internen Details nach außen
- Security-Header über Helmet

### Sprint 2 – Autorisierung
- **Autorisierung auf Datenebene**, nicht nur am Endpoint. Jede Abfrage wird auf die Organisation des
  Nutzers eingeschränkt.
- Tests, die **fehlgeschlagene** Zugriffe absichern: fremde Organisation ⇒ 403/404. Sicherheit, die
  nicht getestet ist, ist eine Behauptung.
- Der häufigste kritische Fehler in B2B-SaaS ist ein vergessener Mandantenfilter in genau einer
  Abfrage. Deshalb gehört der Filter an eine zentrale Stelle, nicht in jede Methode einzeln.

### Autorisierung (Sprint 2, Scheibe 3) – umgesetzt

**Der `MitgliedschaftsGuard` läuft global.** Nicht per `@UseGuards` an der Route – dieselbe
Begründung wie beim `AccessTokenGuard`: Ein vergessener Guard ist ein offener Endpoint, und *niemand
merkt es*, weil alles funktioniert.

Möglich wird das durch ADR-008: Der Mandant steht immer als `:orgId` im Pfad, also gilt
*„Route hat `:orgId`" ⟺ „Route betrifft einen Mandanten"*. Es gibt keine Markierung, an die man sich
erinnern müsste.

**Die Kehrseite, ehrlich benannt:** Der Guard kann nicht vergessen werden, aber er kann *ins Leere
greifen*. Schriebe ein Controller `:organizationId` statt `:orgId`, fände der Guard nichts, gäbe
`true` zurück – und die Route wäre ungeschützt. Kein Fehler, keine Warnung.

Geschlossen über eine geteilte Konstante:

```ts
export const ORG_PARAM = 'orgId';                      // im Guard definiert
@Controller(`organizations/:${ORG_PARAM}`)             // im Controller benutzt
```

Damit lesen beide denselben Wert; ein Tippfehler wäre ein Compilerfehler.

**404 statt 403 bei fremder Organisation.** Der Guard unterscheidet absichtlich nicht zwischen
„existiert nicht" und „du bist kein Mitglied" – beides ist derselbe Zustand: *für dich existiert sie
nicht*. Ein `403` bestätigte die Existenz und ließe fremde Mandanten kartieren. Beide Fälle liefern
dieselbe Meldung, wortgleich; ein E2E-Test schreibt das fest.

`403` bleibt dem Fall vorbehalten, in dem die Mitgliedschaft steht und nur die Rolle nicht reicht.
Dann weiß der Anfragende ohnehin, dass es die Organisation gibt.

**Ein fehlender Nutzer im Guard wirft laut.** Stünde der Guard im `AppModule` vor dem
`AccessTokenGuard`, gäbe es keinen angemeldeten Nutzer. Er wirft dann einen echten Fehler (`500`)
statt stillschweigend `true` zurückzugeben. *Nutzerfehler leise, Programmierfehler laut* – ein
stiller `return true` wäre hier ein offener Endpoint.

**Die geprüfte Mitgliedschaft wird weitergereicht**, statt sie im Controller erneut zu laden. Nicht
wegen der gesparten Abfrage: Ein zweites Laden könnte eine *andere* Mitgliedschaft treffen als die
geprüfte. Geprüft und benutzt muss dasselbe Objekt sein. Konsequenz im Controller – niemals
`@Param('orgId')`, immer `mitgliedschaft.organizationId`.

**Keine Rangordnung auf dem Rollen-Enum.** `@Rollen(Role.OWNER, Role.ADMIN)` listet auf, statt
`rolle >= ADMIN` zu vergleichen. Ein Rangvergleich bricht still, sobald jemand einen Wert
dazwischenschiebt – und Rechte sind ohnehin keine saubere Kette („wer darf sich selbst entfernen?"
– jeder, auch `MEMBER`).

**Nachgewiesen statt behauptet:** Die Prüfung wurde versuchsweise auf `return true` gesetzt. Ein
Unit-Test und vier E2E-Tests schlagen fehl. Ein grüner Test beweist nur, dass er läuft.

### Einladungen (Sprint 2, Scheibe 6) – umgesetzt

- **Token nur als SHA-256-Hash gespeichert**, nie im Klartext – wie beim Refresh-Token. Der Rohwert
  existiert genau einmal, in der Antwort auf das Anlegen; erzwungen über zwei getrennte
  Rückgabetypen.
- **Keine User Enumeration:** Ob unter der Adresse ein Konto existiert, ändert weder Statuscode noch
  Antwortform. Sonst hätte jeder `ADMIN` einen Prüfdienst für fremde E-Mail-Adressen.
- **An eine Adresse gebunden, nicht an den Link:** Beim Einlösen muss die Kontoadresse übereinstimmen
  (`403` sonst). Ein weitergeleiteter Link ist damit kein Zugang.
- **`OWNER` ist nicht einladbar**, und ein `ADMIN` darf nur `MEMBER` einladen. Eine Einladung ist
  eine Rechtevergabe – wer sie ausspricht, darf nicht mehr vergeben, als er selbst hat.
- **Ablauf nach 7 Tagen.** Eine Einladung ohne Ablauf ist ein dauerhaft gültiger Zugang in einem
  Postfach, das irgendwann jemand anderem gehört.
- **`POST` statt `GET` zum Einlösen**, Token im Körper statt im Pfad – Pfade landen in Logs,
  Browserverlauf und `Referer`.
- **Mandantenfilter beim Zurückziehen:** `updateMany({ where: { id, organizationId } })`. Der Guard
  prüft die Organisation im Pfad, nicht die Zugehörigkeit der Ressource.

> **Bewusste Abweichung, offen:** Der Einladungs-Token steht derzeit in der HTTP-Antwort, damit der
> Flow ohne E-Mail-Versand benutzbar ist. Korrekt wäre: ausschließlich per E-Mail, sodass der
> Einladende ihn nie sieht und die Einladung nicht selbst einlösen kann. Geparkt in `06_BACKLOG.md`.

### Frontend-Einladungen und Weiterleitung (Sprint 2, Scheibe 9) – umgesetzt

**Open-Redirect-Schutz.** Wer einen Einladungslink öffnet, ist meist nicht angemeldet. Die
Anmeldeseite merkt sich das Ziel über `?weiter=` – und **prüft** es, statt ihm zu folgen:

```ts
if (!/^\/(?![/\])/.test(weiter)) return ersatz;   // genau ein führender Schrägstrich
```

Ohne diese Prüfung bestimmte der Absender des Links, wohin der Nutzer nach der Anmeldung geschickt
wird:

```
/login?weiter=https://devb0ard-anmeldung.example/login
```

Der Nutzer sieht eine **echte** DevBoard-Adresse, meldet sich an – und landet auf einer nachgebauten
Seite, die ihn erneut nach seinen Zugangsdaten fragt. Weil er den Anmeldevorgang selbst begonnen
hat, wirkt das plausibel. Eine Open-Redirect-Lücke stiehlt selbst nichts; sie verleiht einer
Phishing-Seite die Glaubwürdigkeit der echten Domain.

Abgewiesen werden: absolute Adressen, **protokollrelative** (`//fremder.host` – der Klassiker, den
eine Prüfung auf „beginnt mit `/`" durchlässt), Backslash-Varianten und Skript-Schemata. Eine
Positivliste ist hier sicherer als eine Sperrliste: Wer verbotene Muster aufzählt, vergisst eines.

Nachgewiesen: acht Tests auf der Hilfsfunktion plus einer auf Seitenebene; mit entfernter Prüfung
schlagen sechs davon fehl.

**Einmalige Anzeige des Einladungstokens.** Das Backend gibt den Rohwert genau einmal zurück; die
Oberfläche zeigt ihn in einem auffälligen Kasten, der ausdrücklich geschlossen werden muss. Ein
Kasten, der von selbst verschwindet, wäre hier eine Falle – der Wert ist danach unwiederbringlich
weg. Dieselbe Interaktion wie bei frisch erzeugten API-Schlüsseln bei GitHub oder Stripe, aus
derselben Ursache.

**Die Einlöseseite trägt bewusst keinen Anmeldezwang.** `<Geschuetzt>` würde den Besucher auf
`/login` werfen und dabei den Token aus der Adresszeile verlieren. Sie behandelt den abgemeldeten
Fall selbst und reicht das Ziel geprüft weiter.

### Sprint 5 – Webhooks
- HMAC-Signaturprüfung eingehender GitHub-Events, ungültige Signaturen werden abgewiesen
- Idempotenz gegen mehrfach zugestellte Events

### Sprint 6 – Betrieb
- Datenbank ohne veröffentlichten Port, nur im internen Docker-Netzwerk erreichbar
- HTTPS über nginx, Zertifikate automatisch erneuert
- Secrets aus dem Secret-Store der Umgebung (GitHub Actions Secrets, Docker Secrets)
- Regelmäßige Backups, Wiederherstellung mindestens einmal geprobt

---

## OWASP Top 10 – Bezug zum Projekt

| Risiko | Maßnahme im Projekt |
|---|---|
| Broken Access Control | Guards plus Mandantenfilter auf Datenebene (Sprint 2) |
| Cryptographic Failures | argon2 für Passwörter, HTTPS in Produktion |
| Injection | Prisma verwendet parametrisierte Abfragen; bei `$queryRaw` niemals String-Verkettung |
| Insecure Design | ADRs dokumentieren Entscheidungen; Bedrohungen pro Feature benannt |
| Security Misconfiguration | Konfiguration validiert, Versionen gepinnt, Ports in Produktion geschlossen |
| Vulnerable Components | `npm audit` in der CI |
| Identification & Auth Failures | Refresh-Token-Rotation, Rate Limiting |
| Software & Data Integrity | Lockfile im Repository, gepinnte Image-Versionen |
| Logging & Monitoring Failures | strukturierte Logs, Health-Checks |
| SSRF | derzeit nicht relevant – bei ausgehenden Aufrufen ab Sprint 5 neu bewerten |
