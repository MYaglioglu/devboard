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

| Bereich | Tests |
|---|---|
| Backend, Unit | 81 |
| Backend, E2E (echte Datenbank) | 39 |
| Frontend, Komponenten und Hooks | 26 |
| **Gesamt** | **146** |

Alle laufen bei jedem Pull Request in der CI. Der Backend-Job startet dafür einen echten
PostgreSQL-Container.

---

## Frontend: Vitest und Testing Library

```bash
cd frontend
npm test         # einmaliger Lauf
npm run test:watch
```

**Warum Vitest und nicht Jest?** Next.js baut mit einem Vite-nahen Unterbau; Vitest versteht TSX,
Pfad-Aliasse und ESM ohne zusätzliche Übersetzer. Bei Jest bräuchte es dafür Babel- oder
SWC-Konfiguration. Im Backend bleibt Jest – es kam mit NestJS mit und funktioniert dort einwandfrei.
Zwei Testläufer in einem Repository sind kein Schönheitsfehler, sondern die Folge davon, dass beide
Projekte eigenständig sind (ADR-005).

### Testing Library fragt ab, wie ein Mensch liest

`getByLabelText('E-Mail')`, `getByRole('button', { name: 'Anmelden' })` – gesucht wird über das,
was ein Nutzer sieht oder ein Screenreader vorliest, nicht über CSS-Klassen oder `data-testid`.

Das hat zwei Folgen: Ein Refactoring am Markup bricht die Tests nicht, solange die Bedeutung gleich
bleibt. **Und Zugänglichkeitsfehler fallen nebenbei auf** – genau so wurde hier ein falsch
aufgebautes Label entdeckt (siehe `17_MISTAKES_AND_LESSONS.md`).

Wer eine solche fehlschlagende Abfrage mit `getByTestId` „repariert", schaltet genau diese Warnung
ab.

### Was geprüft wird

| Datei | Schwerpunkt |
|---|---|
| `lib/auth-context.test.tsx` | stilles Erneuern, Bearer-Token, **genau eine** Wiederholung bei 401, Abmelden bei Serverausfall |
| `app/login/page.test.tsx` | Validierung ohne Serveranfrage, Fehlermeldung des Servers unverändert, `aria-invalid` |
| `components/geschuetzt.test.tsx` | keine Weiterleitung während der Prüfung, kein Aufblitzen von Inhalten |

Der wichtigste ist die Endlosschleifen-Prüfung: Bei dauerhaft ungültiger Sitzung darf `authFetch`
den Server nicht in einer Schleife aus 401 und Erneuerungsversuchen bombardieren.

**Die Tests haben sich am ersten Tag bezahlt gemacht** – sie fanden sofort zwei echte Fehler, die
beim Ausprobieren von Hand nicht auffallen konnten. Details im Fehlerprotokoll.

---

## Offene Punkte

- **Testdatenbank** für Integrationstests ab Sprint 1 – eigener Container oder Testcontainers,
  damit Tests nicht auf der Entwicklungsdatenbank laufen
- **Abdeckungsschwelle** in der CI festlegen (eine Zahl, die Verhalten steuert – bewusst wählen,
  nicht auf 100 % setzen)
- **Fixtures und Factories** für Testdaten, sobald Modelle mit Relationen dazukommen
