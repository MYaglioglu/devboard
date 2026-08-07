# Architektur

Stand: Sprint 0. Wächst mit jedem Sprint.

---

## Gesamtbild

```
Browser
   │  HTTPS
   ▼
Next.js  (Frontend, Port 3001)
   │  REST + JSON
   ▼
NestJS   (Backend, Port 3000)
   │  Prisma
   ▼
PostgreSQL  (Container, Port 5432)
```

Frontend und Backend sind **getrennte Anwendungen** mit eigenem Build und eigenem Container. Das
Frontend rendert und ruft die API; die gesamte Fachlogik und jede Autorisierungsentscheidung liegt
im Backend.

Warum nicht die API-Routes von Next.js? Weil das genau die Schichtentrennung verhindert, die hier
gelernt werden soll – und weil ein eigenständiges Backend der Normalfall in Stellenausschreibungen
ist. Siehe ADR-002.

### Netzwerk

Innerhalb des Docker-Netzwerks sprechen die Dienste über ihre **Service-Namen** miteinander
(`db:5432`), nicht über `localhost`. `localhost` bedeutet innerhalb eines Containers immer den
Container selbst.

---

## Backend – Schichten

```
Controller   nimmt HTTP entgegen, validiert Eingaben, gibt Antworten zurück
    │        kennt HTTP, kennt keine Fachlogik
    ▼
Service      enthält die Fachlogik
    │        kennt kein HTTP
    ▼
Repository   Datenzugriff (über Prisma)
    │
    ▼
Datenbank
```

**Regel: Controller dünn, Service dick.** Ein Controller nimmt entgegen, gibt weiter, antwortet.
Die Logik liegt im Service – dadurch ist sie auch aus einem Cronjob, einem Queue-Worker oder einem
Unit-Test heraus aufrufbar. Ein Service, der `request` und `response` kennt, kann das nicht.

Die Abhängigkeiten zeigen **nur nach unten**. Ein Service darf keinen Controller aufrufen.

---

## Dependency Injection

Klassen erzeugen ihre Abhängigkeiten nicht selbst, sondern bekommen sie hineingereicht:

```ts
@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}
}
```

Nest liest beim Start die Konstruktor-Typen aus (möglich durch `emitDecoratorMetadata` in der
`tsconfig.json`), erzeugt jede registrierte Klasse einmal und verdrahtet sie miteinander. Der Ort,
an dem dieser Objektgraph entsteht, ist die **Composition Root** in `main.ts`.

**Warum das nicht optional ist:** Eine Klasse, die `new PrismaService()` selbst aufruft, ist an eine
echte Datenbank gekettet. Sie lässt sich nicht isoliert testen, Fehlerfälle lassen sich nicht
simulieren, die Implementierung nicht austauschen. Genau deshalb sind Enterprise-Backends so gebaut.

Provider sind standardmäßig **Singletons** – eine Instanz für die gesamte Anwendung.

---

## Feature-basierte Modulstruktur

Nicht nach technischen Schichten gruppieren, sondern nach Fachlichkeit:

```
backend/src/
  main.ts                  Composition Root
  app.module.ts            Wurzelmodul, hängt Feature-Module ein
  config/                  Umgebungsvariablen + Validierung (Zod)
  health/                  health.module.ts, health.controller.ts
  auth/                    Sprint 1
  organizations/           Sprint 2
  projects/                Sprint 3
  tasks/                   Sprint 3
  prisma/                  PrismaService (globales Modul)
```

**Warum nicht `controllers/`, `services/`, `repositories/`?** Weil bei einer Änderung an „Tasks"
dann drei entfernte Ordner angefasst werden. Bei feature-basierter Gliederung liegt alles zu einem
Thema beieinander, Module lassen sich als Ganzes verstehen, verschieben oder entfernen. Das ist in
modernen Backends der Standard.

Jedes Modul deklariert selbst, was es nach außen sichtbar macht (`exports`). Was nicht exportiert
ist, bleibt privat – Kapselung auf Modulebene.

---

## Konfiguration

Umgebungsvariablen werden beim Start **validiert**. Fehlt eine Variable oder enthält sie Unsinn,
bricht die Anwendung sofort ab, statt halb zu funktionieren.

**Fail fast:** Ein Fehler soll so früh und so nah an seiner Ursache wie möglich auftreten. Ein
Container, der wegen fehlender Konfiguration gar nicht erst hochkommt, ist besser als einer, der
scheinbar läuft und Stunden später an unerwarteter Stelle umfällt.

Werte kommen aus der Umgebung, nie aus dem Code. Lokal aus `.env` (gitignored), in Produktion aus
dem Secret-Store der Umgebung.

---

## Leitplanken

- **Vertikale Slices:** ein Feature komplett durch alle Schichten, statt Schicht für Schicht.
- **Autorisierung auf Datenebene**, nicht nur am Endpoint. Jede Abfrage wird auf die Organisation des
  Nutzers eingeschränkt (ab Sprint 2).
- **Was sich aus dem Repository erzeugen lässt, gehört nicht ins Repository** (`node_modules`, `dist`).
- **Infrastruktur als Code:** Eine Konfiguration, die nicht im Repository steht, existiert nicht.
