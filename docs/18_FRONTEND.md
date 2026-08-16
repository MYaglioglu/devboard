# Frontend

Bis hierher war dieses Handbuch ein Backend-Buch. Das war eine Lücke: Die Frontend-Entscheidungen
lagen ausschließlich in Code-Kommentaren, und damit fand sie niemand, der nicht ohnehin in der Datei
war.

Dieses Kapitel holt sie heraus – und stellt daneben, wie dieselbe Frage in **Angular** beantwortet
wird.

---

## Zwei Teile, und was sie voneinander unterscheidet

> **Teil A – Next.js** ist das, was in DevBoard gebaut, getestet und im Browser angesehen wurde.
> Jede Aussage hat Code dahinter.
>
> **Teil B – Angular** ist eine **Gegenüberstellung ohne Projekt dahinter.** Es ist gelesenes und
> geordnetes Wissen, keine Erfahrung. Das steht hier ausdrücklich, weil der Rest dieses Handbuchs
> einen anderen Anspruch hat: dort gibt es zu jeder Behauptung eine Messung, einen Test oder einen
> Fehler, der sie erzwungen hat.
>
> **Im Vorstellungsgespräch ist dieser Unterschied wichtiger als der Inhalt.** „Das habe ich gebaut"
> und „das habe ich gelesen" sind zwei verschiedene Sätze, und wer sie verwechselt, wird bei der
> ersten Nachfrage darauf festgenagelt. Zu Angular ist der richtige Satz: *„Angular kenne ich
> konzeptionell – ich habe die Entsprechungen zu dem durchgearbeitet, was ich in React gebaut habe.
> Gebaut habe ich es nicht."*

Beide Teile behandeln **dieselben neun Themen in derselben Reihenfolge**. Wer eine Frage in einem
Teil nachschlägt, findet sie im anderen an derselben Stelle.

| # | Thema | Next.js | Angular |
|---|---|---|---|
| 1 | Struktur und Routing | Dateibasiert, App Router | `Routes`-Array, Standalone Components |
| 2 | Komponenten und Rendering | Server- und Client-Komponenten | Komponenten mit Change Detection |
| 3 | Serverdaten | TanStack Query | `HttpClient` + Signals / RxJS |
| 4 | Formulare | react-hook-form + Zod | Reactive Forms |
| 5 | Anmeldung im Browser | `authFetch` | `HttpInterceptor` |
| 6 | Gestaltung und Theming | Tailwind + CSS-Variablen | Komponenten-Styles + CSS-Variablen |
| 7 | Zugänglichkeit | von Hand, bewusst | von Hand, bewusst (Angular CDK) |
| 8 | Testen | Vitest + Testing Library | Jest/Vitest + TestBed |
| 9 | Grenzen zum Backend | – | – |

---

# Teil A – Next.js (gebaut)

## A1 · Struktur und Routing

Next.js leitet die Routen aus dem Dateibaum ab. Ein Ordner ist ein Pfadstück, `page.tsx` ist die
Seite, `layout.tsx` umschließt alles darunter.

Die Entscheidung, die in DevBoard etwas ausgemacht hat, ist die **Routengruppe**:

```
src/app/
  (app)/              <- taucht in der URL NICHT auf
    layout.tsx        <- Seitenleiste + Geschuetzt
    dashboard/page.tsx        -> /dashboard
    organizations/page.tsx    -> /organizations
  login/page.tsx              -> /login   (ohne Huelle)
```

**Warum das die richtige Lösung war:** Es gibt zwei Arten von Seiten – angemeldete mit Seitenleiste
und die zentrierte Karte für Anmelden, Registrieren, Einladung. Ohne Gruppe müsste jede Seite ihre
Hülle selbst mitbringen; genau so war es vorher, und der Inhalt sprang beim Navigieren.

Der Gewinn ist nicht nur Optik: `Geschuetzt` steht jetzt **im Layout**. Jede neue Seite unter `(app)`
ist geschützt, ohne dass jemand daran denken muss. Das ist derselbe Gedanke wie beim global
registrierten Guard im Backend – *ein Schutz, an den man denken muss, ist ein Schutz, den man
vergisst.*

## A2 · Server- und Client-Komponenten

Alles ist standardmäßig eine **Server-Komponente**: Sie läuft nur auf dem Server, schickt fertiges
HTML und **kein JavaScript** in den Browser. `'use client'` macht daraus eine Client-Komponente mit
Zustand, Effekten und Ereignissen.

DevBoard ist fast durchgehend `'use client'`, und das ist eine bewusste Wahl mit einem Preis:

Die Anwendung ist hinter einer Anmeldung, die Daten kommen von einem **getrennten** NestJS-Backend,
und der Zugriffstoken liegt aus gutem Grund nur im Speicher des Browsers (ADR-007). Eine
Server-Komponente hätte diesen Token nicht – sie müsste über das Cookie gehen und serverseitig
erneuern. Das wäre ein zweiter Anmeldeweg neben dem bestehenden.

**Der Preis, offen benannt:** Wir verschenken das, wofür der App Router gebaut wurde. Bei einer
öffentlichen Seite mit vielen Inhalten wäre die Entscheidung andersherum richtig.

## A3 · Serverdaten mit TanStack Query

Der wichtigste Satz zuerst: **Serverdaten sind kein Zustand deiner Anwendung.** Sie sind eine Kopie
von etwas, das woanders liegt und sich ohne dein Zutun ändert. Genau deshalb ist `useState` +
`useEffect` dafür die falsche Werkzeugwahl – man baut sonst Zwischenspeicher, Ladezustände,
Fehlerzustände und Entwertung selbst nach, jedes Mal etwas anders.

```ts
export function useProjekte(orgId: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: projekteKey(orgId),
    queryFn: () => authFetch<Projekt[]>(`/organizations/${orgId}/projects`),
  });
}
```

Drei Dinge daran sind Entscheidungen, keine Formsache:

**Der Schlüssel ist eine Funktion, keine Zeichenkette.** `projekteKey(orgId)` steht an einer Stelle.
Wer ihn an jeder Aufrufstelle neu tippt, hat irgendwo einen Tippfehler – und der äußert sich nicht
als Fehler, sondern als Zwischenspeicher, der nicht mehr entwertet wird.

**Der Zwischenspeicher wird geteilt.** Die Seitenleiste zeigt dieselbe Projektliste wie die
Projektseite und löst dafür **keine zweite Anfrage** aus.

**Was nicht hineingehört:** Beim Verbinden eines Repositories kommt das Geheimnis einmalig zurück.
Naheliegend wäre `setQueryData` – dann läge es im Zwischenspeicher, und jede Komponente, die diese
Abfrage liest, bekäme es mit. Stattdessen wird die Abfrage entwertet; das Backend liefert die
Verbindung ohne Geheimnis nach.

### Optimistische Updates

Beim Verschieben einer Karte wartet das Board nicht auf den Server. Es schreibt sofort, merkt sich
den alten Stand und stellt ihn bei einem Fehler wieder her. Beim `409` aus dem optimistischen Sperren
springt die Karte zurück.

**Die Regel:** Optimistisch nur dort, wo ein Rückschritt für den Nutzer harmlos ist. Bei einer
Zahlung wäre es das nicht.

## A4 · Formulare

`react-hook-form` mit `zod` über `@hookform/resolvers`. Der Gewinn ist nicht die Ersparnis an
Code, sondern dass **dasselbe Schema** im Frontend und im Backend dieselbe Regel ausdrückt – und
dass die Prüfung im Frontend ausdrücklich **Führung** ist, keine Sicherheit. Die verbindliche
Prüfung steht im Backend, und sie steht dort auch dann, wenn das Frontend sie vergisst.

**Kontrollierte Felder.** Der Wert lebt in React, nicht im DOM. Das hat einen praktischen
Nebeneffekt, den wir bei der Browser-Automatisierung gemerkt haben: Wer den DOM-Wert von außen setzt,
ohne Reacts `onChange` auszulösen, ändert nichts – React weiß davon nichts und überschreibt beim
nächsten Rendern.

## A5 · Anmeldung im Browser

Der Zugriffstoken liegt **im Speicher** (React-Kontext), der Refresh-Token in einem
`httpOnly`-Cookie. Kein `localStorage`: Was dort liegt, liest jedes Skript auf der Seite – ein
einziges kompromittiertes npm-Paket genügt.

`authFetch` hängt den Token an, und bei einem `401` erneuert es ihn **einmal** und wiederholt die
Anfrage. Das Wichtige daran ist der **Single Flight**: Laufen fünf Anfragen gleichzeitig in ein
`401`, darf es nur **eine** Erneuerung geben. Ohne das schickten fünf parallele
Erneuerungsversuche denselben Refresh-Token – und die Wiederverwendungs-Erkennung im Backend zieht
zu Recht die ganze Token-Familie zurück. Der Nutzer fliegt raus.

> Das war der teuerste Fehler aus Sprint 2, gefunden erst, als die Anwendung wirklich gestartet
> wurde. 155 grüne Tests hatten ihn nicht bemerkt.

## A6 · Gestaltung und Theming

Semantische Tokens als CSS-Variablen, in **drei** Blöcken:

```css
:root { --flaeche: #ffffff; --rand: #e4e4e7; --text: #18181b; }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { --flaeche: #09090b; }
}

:root[data-theme='dark'] { --flaeche: #09090b; }
```

Die Namen sagen die **Rolle**, nicht die Farbe. `--rand` ist das, was Bereiche trennt – ob hell- oder
dunkelgrau, entscheidet der Modus, nicht die Aufrufstelle.

Drei Blöcke statt zwei, damit ein Umschalter später eine Zeile ist. **Keine Farbe darf ihre einzige
Festlegung in einem der beiden unteren Blöcke haben** – sonst fehlt sie in genau einem der drei
Zustände.

## A7 · Zugänglichkeit als Entscheidung

Nichts davon ist Zierde; jedes hat einen Fall, in dem es den Unterschied macht:

| Maßnahme | Ohne sie |
|---|---|
| `aria-describedby` statt Fehler im `<label>` | Das Feld heißt „E-Mail Bitte eine gültige Adresse angeben" |
| `aria-invalid` | Der Fehlerzustand existiert nur für sehende Nutzer |
| `aria-current="page"` | Alle Navigationseinträge klingen gleich |
| Sprunglink | Auf jeder Seite erst durch zehn Projekte tabben |
| `:focus-visible` statt `:focus` | Ring bei jedem Mausklick – oder abgeschaltet, der häufigste Fehler |

## A8 · Testen

Vitest mit Testing Library. Die tragende Entscheidung ist die **Trennung**: Reine Rechnung
(`feed-satz.ts`, `board-logik.ts`) wird ohne einen einzigen gerenderten Knoten geprüft. Die
Testkosten liegen um eine Größenordnung auseinander, und deshalb stehen dort die Grenzfälle.

Zwei Lehren aus echten Fehlschlägen:

**Was nicht da ist, kann man nicht prüfen.** Ein Layoutfehler – die Projektliste fiel auf 68 Pixel
zusammen – blieb von 201 grünen Tests unbemerkt und war im Browser sofort sichtbar. *Die Anwendung
wird gestartet, nicht nur getestet.*

**Beim Erzeugen mit `never` auf Vollständigkeit prüfen, beim Empfangen nicht.** Ein Frontend, das
unbekannte Ereignistypen nicht erträgt, ist während **jedes** Deployments kaputt: Das Backend ist
schon neu, der Browser hält noch die alte Fassung.

## A9 · Die Grenze zum Backend

`payload` ist im Backend `jsonb` und von der Datenbank nicht geprüft. Im Frontend ist es deshalb
`unknown` und wird an **einer** Stelle vorsichtig gelesen. Fehlt ein Feld, gibt es einen
allgemeineren Satz statt eines Absturzes.

Der Grund ist nicht Vorsicht um ihrer selbst willen: Der Feed ist ein **Protokoll**. Seine Einträge
sind unveränderlich und überdauern jede Formatänderung. Ein Frontend, das den heutigen Aufbau
voraussetzt, bricht genau dann, wenn der Feed seinen Zweck erfüllt.

**Offen und benannt:** `FeedEintrag`, `Projekt` und `Kennzahlen` stehen als handgeschriebene Kopien
der Backend-Typen im Frontend. Zweite Wahrheit der gefährlichsten Sorte – beim Schreiben richtig,
still falsch, sobald das Backend ein Feld umbenennt. Die Lösung wäre ein erzeugter Typ aus einem
OpenAPI-Schema. Steht im Backlog.

---

# Teil B – Angular (Gegenüberstellung, nicht gebaut)

> Alles hier ist **konzeptionell**. Es gibt keinen Code in DevBoard, der es belegt.

## B1 · Struktur und Routing

Angular leitet Routen **nicht** aus dem Dateibaum ab, sondern aus einem ausdrücklichen Array:

```ts
export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: AppShellComponent,
    children: [
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard') },
    ],
  },
  { path: 'login', loadComponent: () => import('./login/login') },
];
```

**Die Entsprechung zur Routengruppe** ist eine Route mit `children` und einer Hüllen-Komponente, die
ein `<router-outlet>` enthält. Der Effekt ist derselbe: eine Hülle, viele Seiten.

**Der Unterschied, der zählt:** In Next.js *ist* der Ordner die Route – ein Tippfehler ist ein
404. In Angular ist die Route Konfiguration, und der Ordner kann heißen, wie er will. Das ist
flexibler und man muss die Verbindung selbst pflegen.

`canActivate` mit einem Guard ist die direkte Entsprechung zu `Geschuetzt` im Layout – und derselbe
Gedanke: Der Schutz hängt an der Elternroute, nicht an jeder Seite. Seit Angular 14/15 sind Guards
Funktionen, keine Klassen mehr.

## B2 · Komponenten und Change Detection

Es gibt **keine** Server/Client-Trennung wie in Next.js. Angular-Komponenten laufen im Browser;
Server-Side-Rendering ist ein Zusatz (Angular SSR / früher Universal), kein anderes Bauteil.

Dafür gibt es eine Frage, die es in React nicht gibt: **Wann rendert Angular neu?**

- Klassisch über **Zone.js**: Angular fängt jedes asynchrone Ereignis ab und prüft danach den
  Komponentenbaum.
- Modern über **Signals** (ab Angular 16) und `changeDetection: OnPush`: Es wird nur neu gerendert,
  was von einem geänderten Signal abhängt.

```ts
@Component({
  selector: 'app-kennzahlen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>{{ offen() }}</p>`,
})
export class KennzahlenComponent {
  offen = signal(0);
}
```

**Die Brücke zu dem, was du kennst:** Ein `signal` ist ungefähr `useState`, ein `computed` ist
`useMemo`, ein `effect` ist `useEffect`. Der Unterschied: Signals sind **feinkörnig** – Angular weiß
genau, welche Stelle im Template von welchem Signal abhängt, und rendert nur die neu. React rendert
die ganze Komponentenfunktion erneut.

`standalone: true` ist die wichtigste Neuerung der letzten Jahre: Komponenten brauchen kein
`NgModule` mehr. Wer in älterer Angular-Dokumentation liest, findet überall `@NgModule` – das ist
nicht mehr der empfohlene Weg.

## B3 · Serverdaten

Hier ist der Unterschied am größten – **Angular hat kein eingebautes TanStack Query.**

Der klassische Weg ist `HttpClient` mit RxJS:

```ts
@Injectable({ providedIn: 'root' })
export class ProjekteService {
  private http = inject(HttpClient);

  ladeProjekte(orgId: string) {
    return this.http.get<Projekt[]>(`/api/organizations/${orgId}/projects`);
  }
}
```

Das liefert ein `Observable` – einen Strom, kein Versprechen. Es startet erst beim Abonnieren, und
im Template abonniert man mit der `async`-Pipe oder seit Angular 17 mit `toSignal()`.

**Was dabei fehlt, und das ist der Punkt:** `HttpClient` ist ein reiner Transport. Kein
Zwischenspeicher, keine Entwertung, keine geteilten Ladezustände, kein Nachladen im Hintergrund. Das
alles, was TanStack Query mitbringt, baut man in Angular üblicherweise selbst – oder nimmt
`@tanstack/angular-query`, das es tatsächlich gibt.

> **Die Frage, die man im Gespräch dazu stellen würde:** „Wie verhindern Sie, dass zwei Komponenten
> dieselben Daten zweimal laden?" In React ist die Antwort der geteilte `queryKey`. In Angular ist
> die ehrliche Antwort: durch einen Service mit `shareReplay(1)` – oder durch eine Bibliothek.

`inject()` statt Konstruktor-Parameter ist der heutige Weg. Dependency Injection ist in Angular
eingebaut und dir aus **NestJS** bereits vertraut – NestJS hat sein DI-System bewusst von Angular
übernommen. Das ist die stärkste Brücke, die du hast: `@Injectable`, `providedIn: 'root'`,
Konstruktor-Injektion – du kennst das alles schon aus dem Backend.

## B4 · Formulare

**Reactive Forms** sind die Entsprechung zu react-hook-form, und sie sind eingebaut:

```ts
form = new FormGroup({
  email: new FormControl('', [Validators.required, Validators.email]),
  password: new FormControl('', [Validators.minLength(10)]),
});
```

Zwei Unterschiede:

**Die Regeln stehen als `Validators`, nicht als Schema.** Ein Zod-Schema lässt sich mit dem Backend
teilen und liefert obendrein den TypeScript-Typ. `Validators.minLength(10)` ist nur eine Prüfung –
den Typ schreibt man daneben. Wer beides will, baut sich einen Zod-Adapter.

**Angular hat auch Template-Driven Forms** (`ngModel`). Für alles jenseits eines Suchfelds sind
Reactive Forms die Wahl – sie sind prüfbar, ohne etwas zu rendern.

## B5 · Anmeldung im Browser

Die Entsprechung zu `authFetch` ist ein **`HttpInterceptor`**, und er ist strukturell sauberer:

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const mitToken = req.clone({
    setHeaders: { Authorization: `Bearer ${auth.token()}` },
  });

  return next(mitToken).pipe(
    catchError((fehler) =>
      fehler.status === 401 ? auth.erneuere().pipe(switchMap(() => next(mitToken))) : throwError(() => fehler),
    ),
  );
};
```

Der Vorteil: Er hängt an `HttpClient`, nicht an einer Funktion, die man aufrufen muss. Wer ihn
registriert, hat ihn überall – in React muss jede Stelle `authFetch` benutzen statt `fetch`.

**Und dasselbe Problem:** Das Single-Flight-Thema aus A5 gilt hier genauso. Fünf gleichzeitige
`401` dürfen nur **eine** Erneuerung auslösen. Der RxJS-Weg dorthin ist ein `shareReplay(1)` auf dem
Erneuerungs-Observable – eleganter als von Hand, aber genauso leicht zu vergessen.

## B6 · Gestaltung und Theming

Angular kapselt Styles je Komponente (**View Encapsulation**): Was in `styles` einer Komponente
steht, gilt nur dort – der Browser bekommt automatisch generierte Attribute.

**Für Tokens ändert das nichts.** CSS-Variablen auf `:root` durchdringen die Kapselung, weil sie
vererbt werden. Der Drei-Block-Aufbau aus A6 funktioniert in Angular unverändert.

Tailwind lässt sich einsetzen und wird es auch – aber die Angular-Welt neigt stärker zu
Komponenten-Styles und Bibliotheken wie **Angular Material**. Wer in einem Angular-Team anfängt,
trifft eher auf Material als auf Tailwind.

## B7 · Zugänglichkeit

Alles aus A7 gilt unverändert – es sind HTML- und ARIA-Eigenschaften, keine Framework-Themen.

Der Unterschied: Angular hat mit dem **CDK** (`@angular/cdk/a11y`) Bausteine dafür eingebaut –
`FocusTrap`, `LiveAnnouncer`, `cdkTrapFocus`. Die Fokusfalle, die wir für die Schublade von Hand
gebaut haben, ist dort eine Direktive.

> Das ist genau der Tausch, den ich bei shadcn/Radix beschrieben habe: Eine Bibliothek nimmt einem
> die Arbeit ab, die man einmal von Hand gemacht haben sollte, um zu wissen, was sie tut.

## B8 · Testen

`TestBed` ist der Kern – er baut eine Testumgebung mit Angulars DI auf:

```ts
TestBed.configureTestingModule({
  imports: [KennzahlenComponent],
  providers: [provideHttpClientTesting()],
});
```

**Die alte Welt** ist Jasmine + Karma (Browser). **Die heutige** ist Jest oder Vitest, und Angular
unterstützt Vitest inzwischen offiziell. Wer eine Stellenanzeige mit „Karma" liest, sieht damit
etwas über das Alter der Codebasis.

`provideHttpClientTesting` ist die eingebaute Entsprechung zu dem, was wir mit Attrappen von Hand
machen: Es fängt HTTP-Anfragen ab und lässt den Test die Antwort bestimmen.

**Was gleich bleibt:** Reine Rechnung ohne `TestBed` prüfen. Eine Funktion, die aus einem Ereignis
einen Satz macht, braucht kein Framework – in beiden Welten nicht.

## B9 · Die Grenze zum Backend

Identisch. `unknown` statt eines geratenen Typs, vorsichtig lesen, keine Vollständigkeitsprüfung
beim Empfangen. Das sind Eigenschaften der **Grenze**, nicht des Frameworks.

Angular hat dabei einen Vorteil, den man nutzen sollte: Über OpenAPI erzeugte Clients sind dort
verbreiteter, weil die Angular-Welt insgesamt stärker auf erzeugten Code setzt.

---

## Was in beiden Welten gilt

Wenn du aus diesem Kapitel drei Sätze mitnimmst, dann diese:

1. **Serverdaten sind kein Zustand.** Sie sind eine Kopie von etwas, das sich ohne dein Zutun
   ändert. Wer sie wie lokalen Zustand behandelt, baut Zwischenspeicher und Entwertung selbst nach –
   jedes Mal etwas anders.

2. **Prüfung im Frontend ist Führung, nicht Sicherheit.** Die verbindliche Prüfung steht im Backend,
   und sie steht dort auch dann, wenn das Frontend sie vergisst.

3. **Beim Empfangen nicht auf Vollständigkeit prüfen.** Ein Frontend, das unbekannte Werte nicht
   erträgt, ist während jedes Deployments kaputt.

Alle drei sind unabhängig vom Framework. Das ist der Grund, warum sich Frontend-Wissen übertragen
lässt – und warum „ich kenne React, nicht Angular" eine schwächere Aussage ist, als sie klingt.
