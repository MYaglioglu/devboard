# Coding Standards

Verbindlich für dieses Projekt. Werkzeuge erzwingen, was sich erzwingen lässt – der Rest ist
Vereinbarung.

---

## Automatisiert

| Werkzeug | Aufgabe |
|---|---|
| **ESLint** (typed) | findet Fehler, nicht nur Stilfragen – typbewusste Regeln |
| **Prettier** | Formatierung. Über Format wird nicht diskutiert. |
| **TypeScript strict** | keine impliziten `any`, keine stillen Fehler |
| **Jest** | Tests |

```bash
npm run lint    # prueft und korrigiert
npm run build   # Typpruefung inklusive
npm test
```

Ab Sprint 0, Schritt 5 laufen genau diese drei Befehle in der CI und blockieren den Merge.

**Warum Formatierung nicht diskutiert wird:** Jede Minute Diskussion über Zeilenumbrüche ist
verlorene Zeit. Prettier entscheidet, alle akzeptieren, das Thema ist erledigt.

---

## Benennung

| Was | Konvention | Beispiel |
|---|---|---|
| Dateien | kebab-case, Zweck im Namen | `health.controller.ts` |
| Klassen, Typen, Interfaces | PascalCase | `HealthService`, `HealthStatus` |
| Variablen, Funktionen | camelCase | `isReachable` |
| Konstanten aus der Umgebung | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| Prisma-Modelle | PascalCase, Singular | `User` |
| Datenbanktabellen | snake_case, Plural | `users` |
| Branches | `typ/kurzbeschreibung` | `feat/auth-login` |
| Commits | Conventional Commits | `feat(auth): add login endpoint` |

**Bezeichner auf Englisch, Kommentare und Dokumentation auf Deutsch.** Code liest sich mit
englischen Namen flüssiger und passt zu Bibliotheken und Frameworks. Die Erklärungen sind für den
Lernzweck dieses Projekts auf Deutsch.

---

## Struktur

- **Feature-basiert**, nicht schichtbasiert: `health/`, `auth/`, `projects/` – nicht `controllers/`,
  `services/`.
- **Ein Modul pro Feature**, mit eigenem Controller und Service.
- **`exports` sparsam** – was nicht exportiert ist, bleibt privat. `@Global` nur für echte
  Querschnittsthemen (Config, Prisma).
- **Controller dünn, Service dick.** Der Controller kennt HTTP, der Service kennt Fachlogik – und
  kein HTTP.
- **Abhängigkeiten zeigen nach unten.** Ein Service ruft keinen Controller auf.

---

## Regeln, die aus Erfahrung stammen

**Keine Abhängigkeit selbst erzeugen.** `new PrismaClient()` im Rumpf einer Klasse macht sie
untestbar. Abhängigkeiten kommen über den Konstruktor.

**Kein `any`, kein stilles `as`.** Wo eine Fremdbibliothek `any` liefert (etwa `response.body` bei
supertest), wird einmal explizit auf einen benannten Typ gecastet – danach wird typsicher gearbeitet.

**Konfiguration validieren, nicht hoffen.** Werte kommen aus `ConfigService`, nie direkt aus
`process.env`. Fehlt etwas, bricht die Anwendung beim Start ab.

**Fehlerfälle gehören in Tests.** Der interessante Test ist nicht der, bei dem alles funktioniert.

**Nichts Generiertes und nichts Geheimes ins Repository.** `node_modules`, `dist`,
`src/generated`, `.env`.

**Kein `latest` in Versionsangaben**, die andere ausführen – weder bei Docker-Images noch bei
Abhängigkeiten.

---

## Kommentare

Kommentare erklären **warum**, nicht **was**. Was der Code tut, steht im Code.

```ts
// schlecht: setzt den Status auf ok
// gut:     503 statt 200, damit ein Loadbalancer die Instanz
//          aus dem Verkehr nehmen kann
```

Erklärungsbedürftig sind: nicht offensichtliche Entscheidungen, Umgehungen von
Framework-Eigenheiten, und alles, was beim nächsten Lesen wie ein Fehler aussieht, aber keiner ist.

---

## Commits und Pull Requests

- **Ein Commit, ein Thema.** Braucht die Commit-Nachricht ein „und", sind es zwei Commits.
- **Code und Dokumentation getrennt committen.**
- **Kein Push auf `main`.** Jede Änderung über einen Branch und einen PR.
- **Vor jedem PR die Dateiliste prüfen** – liegt hier etwas, das nicht hineingehört?
- **Historie umschreiben nur vor dem Push.**
