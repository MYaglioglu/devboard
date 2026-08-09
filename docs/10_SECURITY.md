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

---

## Bekannte offene Punkte

| Punkt | Risiko | Fällig |
|---|---|---|
| Port 5432 ist nach außen veröffentlicht | In Produktion hinge die Datenbank am Internet, geschützt nur durch ein Passwort | Sprint 6 |
| Kein Rate Limiting | Brute-Force auf Login möglich | Sprint 1 |
| Kein Helmet / Security-Header | XSS, Clickjacking | Sprint 1 |
| CORS nicht konfiguriert | sobald das Frontend dazukommt | Sprint 0, Schritt 4 |
| Keine einheitlichen Fehlerantworten | Stacktraces könnten nach außen gelangen | Sprint 1 |
| Secrets aus `.env`-Datei statt Secret-Store | in Produktion unzureichend | Sprint 6 |

Der erste Punkt ist der wichtigste und der am leichtesten zu vergessen: Eine
Entwicklungs-Einstellung, die niemand vor dem Deployment zurückdreht, ist eine der häufigsten
Ursachen echter Sicherheitsvorfälle.

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
