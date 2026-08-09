# Testing

Warum getestet wird, steht in `17_MISTAKES_AND_LESSONS.md`: Eine frisch gelaunchte Live-Seite wurde
durch ein ungetestetes Plugin lahmgelegt. Tests, Staging und Pipeline sind in diesem Projekt keine
Kür.

---

## Die Testpyramide

```
      /\        E2E          wenige, langsam, hoher Realitaetsgrad
     /  \
    /    \      Integration  einige, mittelschnell
   /      \
  /________\    Unit         viele, schnell, isoliert
```

Die Form ist eine Empfehlung, keine Vorschrift: **viele schnelle, wenige langsame Tests.** Wer die
Pyramide umdreht (fast nur E2E), bekommt eine Suite, die zwanzig Minuten braucht und bei jeder
Kleinigkeit rot wird, ohne die Ursache zu benennen.

| Art | Was geprüft wird | Abhängigkeiten | Laufzeit |
|---|---|---|---|
| **Unit** | eine Klasse isoliert | alle ersetzt (Attrappen) | Millisekunden |
| **Integration** | Zusammenspiel mehrerer Teile | teilweise echt | Sekunden |
| **E2E** | die laufende Anwendung über HTTP | echt | Sekunden bis Minuten |

---

## Aufbau im Projekt

```
backend/src/**/*.spec.ts     Unit-Tests, neben dem Code
backend/test/*.e2e-spec.ts   E2E-Tests
```

Unit-Tests liegen bewusst **neben** der getesteten Datei, nicht in einem separaten Testbaum. So
sieht man beim Öffnen eines Ordners sofort, ob es Tests gibt.

```bash
npm test           # Unit-Tests
npm run test:watch # im Watch-Modus waehrend der Entwicklung
npm run test:cov   # mit Abdeckungsbericht
npm run test:e2e   # E2E-Tests
```

---

## Warum Dependency Injection und Tests zusammenhängen

Der zentrale Punkt, an dem sich DI auszahlt:

```ts
{ provide: PrismaService, useValue: { isReachable } }
```

Der `HealthService` bekommt statt der echten Datenbank eine Attrappe. Folge: Der Test braucht keinen
Container, läuft in Millisekunden – und kann etwas prüfen, das mit echter Datenbank kaum herstellbar
wäre: **den Ausfall**. Genau dieser Fall („Datenbank down → Status degraded") ist im Betrieb der
interessante, und er ist nur mit einer Attrappe zuverlässig testbar.

Eine Klasse, die ihre Abhängigkeiten selbst erzeugt, lässt das nicht zu. Testbarkeit ist keine
Eigenschaft der Tests, sondern eine Eigenschaft des Designs.

---

## Was ein guter Test prüft

Nicht die Implementierung, sondern das **beobachtbare Verhalten**. Ein Test, der bei jedem Refactoring
bricht, obwohl das Verhalten gleich blieb, ist eine Belastung, kein Netz.

Nützliche Fragen beim Schreiben:
- Was passiert bei **fehlerhaften** Eingaben? (`validateEnv` lehnt `PORT: "dreitausend"` ab)
- Was passiert, wenn eine **Abhängigkeit ausfällt**? (Datenbank weg → `degraded`)
- Was passiert an den **Rändern**? (leer, null, negativ, doppelt)

Der Test `GET /` liefert 404 sieht albern aus, ist aber Absicht: Er hält fest, dass der
Hello-World-Endpoint **bewusst** entfernt wurde. Kommt er versehentlich zurück, schlägt der Test fehl.

Ab Sprint 2 kommt eine Kategorie dazu, die im Bewerbungsgespräch besonders zählt: Tests, die
**fehlgeschlagene** Zugriffe absichern – Zugriff auf eine fremde Organisation muss 403 oder 404
liefern. Sicherheitsverhalten muss getestet sein, sonst ist es nur eine Behauptung.

---

## Aktueller Stand

| Suite | Tests | Was abgedeckt ist |
|---|---|---|
| `env.schema.spec.ts` | 8 | Standardwerte, Typumwandlung, Ablehnung ungültiger Werte |
| `health.service.spec.ts` | 6 | Status bei erreichbarer und ausgefallener Datenbank |
| `health.e2e-spec.ts` | 2 | `/health` über echtes HTTP, entfernte Route |

---

## Offene Punkte

- **Testdatenbank** für Integrationstests ab Sprint 1 – eigener Container oder Testcontainers,
  damit Tests nicht auf der Entwicklungsdatenbank laufen
- **Abdeckungsschwelle** in der CI festlegen (eine Zahl, die Verhalten steuert – bewusst wählen,
  nicht auf 100 % setzen)
- **Fixtures und Factories** für Testdaten, sobald Modelle mit Relationen dazukommen
