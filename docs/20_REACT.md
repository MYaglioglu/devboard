# React

Dieses Kapitel ist das, was in `18_FRONTEND.md` vorausgesetzt wird. Dort beginnt die Erzählung bei
Next.js, beim App Router und bei TanStack Query – und setzt stillschweigend voraus, dass JSX, Hooks
und Schlüssel bekannt sind. Diese Lücke schließt dieses Kapitel.

**Voraussetzungen:** JavaScript (Funktionen, Objekte, Arrays, `map`, Destrukturierung,
Pfeilfunktionen) und ein Grundverständnis von TypeScript. Kein React.

**Abgrenzung – was hier *nicht* steht:**

| Thema | Steht in |
|---|---|
| App Router, Server- und Client-Komponenten | `18_FRONTEND.md`, A1 und A2 |
| TanStack Query, optimistische Updates | `18_FRONTEND.md`, A3 |
| Die Entscheidungen in DevBoard und ihre Gründe | `18_FRONTEND.md`, `16_DECISIONS.md` |
| Angular als Gegenüberstellung | `18_FRONTEND.md`, Teil B |

Hier geht es um **React selbst**: die Idee dahinter, die Syntax, die Bausteine, und die Fehler, die
fast jeder einmal macht. Jedes Beispiel stammt aus DevBoard – mit Datei und Zeile, damit man es im
eigenen Code nachsehen kann.

**Version:** React 19. An den Stellen, an denen sich etwas gegenüber React 17/18 geändert hat, steht
das ausdrücklich dabei – ältere Anleitungen im Netz zeigen dort noch den alten Weg.

---

## R0 · Die eine Idee, aus der alles folgt

Vor React beschrieb man eine Oberfläche als **Folge von Änderungen**: Element suchen, Text setzen,
Klasse hinzufügen, Kind einhängen.

```js
// So sah das vorher aus - jQuery-Denkweise
document.querySelector('#zaehler').textContent = anzahl;
if (anzahl > 10) document.querySelector('#warnung').classList.add('sichtbar');
```

Das Problem daran ist nicht der Aufwand, sondern dass **der Zustand doppelt existiert**: einmal in
deinen Variablen und einmal im DOM. Beide können auseinanderlaufen, und der Fehler sieht dann aus
wie „manchmal bleibt die Warnung stehen".

React dreht das um. Du beschreibst **nicht**, was sich ändern soll, sondern **wie es aussieht**:

```tsx
<span>{anzahl}</span>
{anzahl > 10 && <p className="warnung">Zu viele</p>}
```

Der Satz, auf den sich alles zurückführen lässt:

> **Die Oberfläche ist eine Funktion des Zustands.** Du schreibst die Funktion, React kümmert sich
> um den Unterschied zum vorherigen Ergebnis.

Daraus folgt alles Weitere: warum man Zustand nicht direkt verändert (R4), warum Listen Schlüssel
brauchen (R3), warum Effekte die Ausnahme sind und nicht die Regel (R6).

**Was „rendern" heißt.** React ruft deine Komponentenfunktion auf und bekommt eine Beschreibung
zurück. Es vergleicht sie mit der vorigen Beschreibung und ändert im DOM nur das, was sich
unterscheidet. Ein Rendern ist also **kein** Neuzeichnen der Seite – es ist ein Funktionsaufruf.

Das ist wichtig, weil es eine Erwartung korrigiert, die fast jeder mitbringt: *„Ich darf nicht zu
oft rendern, das ist teuer."* Ein Rendern ist billig. Teuer ist, was **du** in der Funktion tust.

---

## R1 · JSX

JSX sieht aus wie HTML in JavaScript und ist keines. Es ist Syntax, die der Übersetzer in
Funktionsaufrufe umschreibt.

```tsx
<span className="text-still">{datum.getDate()}</span>
```

wird zu einem Aufruf, der ein Objekt zurückgibt – eine *Beschreibung* eines Elements, nicht das
Element selbst. Deshalb gilt: **JSX ist ein Ausdruck.** Man kann es in eine Variable legen, aus
einer Funktion zurückgeben, in ein Array stecken.

### Die acht Unterschiede zu HTML, die man kennen muss

| HTML | JSX | Warum |
|---|---|---|
| `class` | `className` | `class` ist ein reserviertes Wort in JavaScript |
| `for` | `htmlFor` | ebenso |
| `onclick="…"` | `onClick={…}` | camelCase, und der Wert ist eine **Funktion**, kein String |
| `style="color: red"` | `style={{ color: 'red' }}` | ein Objekt, Eigenschaften in camelCase |
| `<br>` | `<br />` | jedes Element muss geschlossen werden |
| `tabindex` | `tabIndex` | camelCase |
| `<!-- Kommentar -->` | `{/* Kommentar */}` | JSX hat keine eigene Kommentarsyntax |
| mehrere Wurzelelemente | `<>…</>` | eine Funktion gibt genau einen Wert zurück |

### Die geschweiften Klammern

`{}` in JSX heißt: *„hier kommt JavaScript"*. Alles darin ist ein **Ausdruck**, keine Anweisung –
`if` und `for` funktionieren dort nicht.

```tsx
<span>{datum.getDate()}</span>              {/* Ausdruck - geht */}
<span>{if (x) …}</span>                     {/* Anweisung - geht NICHT */}
```

Fallunterscheidungen schreibt man deshalb als Ausdruck:

```tsx
{/* Entweder-oder */}
{istHeute ? <strong>{tag}</strong> : <span>{tag}</span>}

{/* Nur-wenn - aus Monatskalender */}
{termine.length > 2 && <span>+{termine.length - 2}</span>}
```

### Die Falle bei `&&`

`bedingung && <Element />` funktioniert, weil React `false`, `null` und `undefined` nicht ausgibt.
Eine **Zahl** gibt es aber aus:

```tsx
{termine.length && <Liste />}    // bei 0 Terminen erscheint eine "0" auf der Seite
{termine.length > 0 && <Liste />} // richtig
```

Das ist einer der häufigsten Anfängerfehler und er sieht im Code völlig unverdächtig aus. Die Regel:
**Links von `&&` gehört ein echter Wahrheitswert**, kein `length`, kein `count`.

### Was React ausgibt und was nicht

| Wert | Erscheint auf der Seite |
|---|---|
| `null`, `undefined`, `false`, `true` | nichts |
| `0` | **die Ziffer 0** |
| `''` (leerer String) | nichts Sichtbares |
| `NaN` | `NaN` |

### Attribute mit `undefined` verschwinden

```tsx
aria-invalid={fehler ? true : undefined}
```

→ [ui.tsx:70](../frontend/src/components/ui.tsx:70)

Setzt man ein Attribut auf `undefined` oder `null`, lässt React es **weg**. Setzt man es auf
`false`, hängt das Ergebnis vom Attribut ab:

- **Echte boolesche HTML-Attribute** wie `disabled`: `false` entfernt sie.
- **ARIA-Attribute** sind Zeichenketten-Attribute. `aria-invalid={false}` erzeugt
  `aria-invalid="false"` – gültig, aber überflüssig. `aria-describedby={false}` erzeugt
  `aria-describedby="false"`, und das zeigt auf eine ID, die es nicht gibt. Die Beschreibung geht
  **still** verloren.

Deshalb steht in DevBoard an dieser Stelle `undefined` und nicht `false`.

---

## R2 · Komponenten und Props

Eine Komponente ist eine Funktion, die JSX zurückgibt. Ihr Name beginnt **groß** – daran
unterscheidet JSX sie von einem HTML-Element.

```tsx
function Tageszelle({ datum, imMonat }: { datum: Date; imMonat: boolean }) {
  return <td>{datum.getDate()}</td>;
}
```

→ [monatskalender.tsx](../frontend/src/components/monatskalender.tsx)

`<tageszelle />` wäre ein unbekanntes HTML-Element und würde stillschweigend nichts tun. Das ist
kein Stilthema, sondern Syntax.

### Props sind die Parameter

Alles, was eine Komponente von außen bekommt, kommt als **ein** Objekt an, das üblicherweise direkt
destrukturiert wird. Props sind **nur lesbar** – eine Komponente ändert sie nie.

```tsx
<Monatskalender
  monat={monat}
  eintraege={termine ?? []}
  heute={heute}
  orgId={aktive.id}
  beiTagKlick={(tag) => setzeAngeklicktenTag(vorgabeFuerTag(tag))}
/>
```

→ [kalender/page.tsx](../frontend/src/app/\(app\)/kalender/page.tsx)

Beachtenswert ist die letzte Zeile: **Funktionen sind ganz normale Props.** So meldet ein Kind etwas
nach oben, ohne zu wissen, was oben damit geschieht. `Monatskalender` weiß nicht, dass ein Dialog
aufgeht – es meldet nur „dieser Tag wurde geklickt".

### `children`

Was zwischen Anfangs- und Endetikett steht, kommt als Prop `children` an:

```tsx
<SeitenKopf titel="Kalender">
  <Monatskalender … />
</SeitenKopf>
```

Damit baut man Rahmen, die nicht wissen müssen, was in ihnen steckt. In DevBoard ist das
`SeitenKopf`, `Karte` und `AuthProvider`.

### Komposition statt Vererbung

React kennt keine Komponentenvererbung. Wiederverwendung entsteht durch **Verschachteln** und durch
**Props**. Wer aus einer anderen Sprache mit Klassenhierarchien kommt, sucht danach – es gibt sie
nicht, und man braucht sie nicht.

---

## R3 · Listen und der Schlüssel

Listen entstehen mit `map`:

```tsx
{wochentagsNamen().map((name) => (
  <th key={name} scope="col">{name}</th>
))}
```

→ [monatskalender.tsx](../frontend/src/components/monatskalender.tsx)

### Wofür `key` wirklich da ist

`key` ist **keine** Formalität zur Beruhigung der Konsolenwarnung. React benutzt ihn, um zwischen
zwei Renderdurchgängen zu erkennen, **welches Element welches ist**. Ohne diese Zuordnung vergleicht
React die Listen nach Position – und bei einer Einfügung am Anfang hält es jedes Element für
verändert.

Das ist nicht nur langsamer, sondern **falsch**, sobald die Elemente eigenen Zustand haben:

```tsx
{aufgaben.map((a, index) => <Karte key={index} … />)}
```

Fügt man oben eine Aufgabe ein, behält `key={0}` seinen Platz – aber der Inhalt darunter ist ein
anderer. Ein offenes Eingabefeld, eine markierte Zeile, ein laufendes Einblenden: all das bleibt am
falschen Element hängen.

**Die Regel:** Der Schlüssel muss **stabil** sein (bei jedem Rendern derselbe für dasselbe Ding) und
**eindeutig unter Geschwistern**. Eine ID aus der Datenbank erfüllt beides.

```tsx
<Tageszelle key={tag.datum.getTime()} … />
```

Hier ist es der Zeitstempel des Tages – für denselben Tag immer dieselbe Zahl, und im Raster kommt
jeder Tag genau einmal vor.

**Wann der Index doch in Ordnung ist:** Wenn die Liste sich nie umsortiert, nie etwas eingefügt oder
gelöscht wird, und die Einträge keinen eigenen Zustand haben. Das trifft seltener zu, als man denkt.

### Der zweite Nutzen von `key`: Zustand absichtlich wegwerfen

Ändert sich der `key` eines Elements, verwirft React die alte Instanz samt Zustand und baut eine
neue. Das ist ein Werkzeug, kein Unfall:

```tsx
<Formular key={aufgabeId} />   {/* bei neuer Aufgabe: Formular frisch, nicht vorbefüllt */}
```

---

## R4 · Zustand mit `useState`

```tsx
const [monat, setzeMonat] = useState<Monatszeiger>(() => {
  const jetzt = new Date();
  return { jahr: jetzt.getFullYear(), monat: jetzt.getMonth() };
});
```

→ [kalender/page.tsx](../frontend/src/app/\(app\)/kalender/page.tsx)

`useState` gibt ein Paar zurück: den aktuellen Wert und eine Funktion, um ihn zu setzen. Das Setzen
löst ein erneutes Rendern aus.

### Fünf Dinge, die man dazu wissen muss

**1 · Der Wert ändert sich nicht sofort.**

```tsx
setzeZahl(1);
console.log(zahl);   // immer noch der alte Wert
```

`zahl` ist eine **Konstante dieses Renderdurchgangs**. Der neue Wert existiert erst im nächsten.
Wer das nicht weiß, baut irgendwann ein `setTimeout` ein, damit es „funktioniert" – und hat dann
einen Fehler, der nur unter Last auftritt.

**2 · Aufeinander aufbauende Änderungen brauchen die Funktionsform.**

```tsx
setzeZahl(zahl + 1);
setzeZahl(zahl + 1);   // Ergebnis: +1, nicht +2

setzeZahl((z) => z + 1);
setzeZahl((z) => z + 1);   // Ergebnis: +2
```

In DevBoard steht deshalb überall dort, wo der neue Wert vom alten abhängt, die Funktionsform:

```tsx
beiKlick={() => setzeMonat((m) => verschiebeMonat(m, -1))}
```

**3 · Zustand wird nicht verändert, sondern ersetzt.**

```tsx
termine.push(neuer);        // FALSCH - React sieht keine Änderung
setzeTermine([...termine, neuer]);   // richtig
```

React vergleicht mit `Object.is`. Ein Array, in das man hineingeschrieben hat, ist dasselbe Objekt –
also „unverändert". Die Oberfläche aktualisiert sich nicht, und das Debuggen dauert eine Stunde.

**4 · Die Startfunktion statt des Startwerts.**

```tsx
useState(teureBerechnung())      // läuft bei JEDEM Rendern, Ergebnis wird verworfen
useState(() => teureBerechnung()) // läuft genau einmal
```

Im Kalender steht die Funktionsform, obwohl `new Date()` billig ist – als Gewohnheit, weil derselbe
Aufruf anderswo eine teure Rechnung sein kann.

**5 · Mehr Zustand als nötig ist der häufigste Entwurfsfehler.** Siehe R8.

---

## R5 · Wo der Zustand hingehört

Zustand lebt in **einer** Komponente. Brauchen ihn zwei Geschwister, wandert er zum gemeinsamen
Elternteil – das nennt sich *lifting state up*.

In DevBoard liegt der angeklickte Tag in der **Seite**, nicht im Dialog:

```tsx
const [angeklickterTag, setzeAngeklicktenTag] = useState<Date | null>(null);
```

→ [kalender/page.tsx](../frontend/src/app/\(app\)/kalender/page.tsx)

Der Grund steht dort im Kommentar und ist lehrreich: Hielte der Dialog seinen Zustand selbst, müsste
ihn jede der 42 Tageszellen kennen, um ihn zu öffnen – oder es gäbe 42 Dialoge.

**Die Faustregel:** Zustand gehört so weit unten wie möglich und so weit oben wie nötig. Zu weit
oben bedeutet unnötige Renderdurchgänge; zu weit unten bedeutet, dass Geschwister ihn nicht sehen.

**Der Nebengewinn, auf den es ankommt:** Weil `Monatskalender` nur meldet und nichts entscheidet,
braucht sein Test keine Attrappe. Er reicht eine Funktion hinein und sieht nach, ob sie mit dem
richtigen Datum gerufen wurde.

> **Was eine Komponente nicht selbst beschafft, muss ein Test nicht fälschen.**

---

## R6 · Rendern, Effekte und Aufräumen

### Was in einer Komponente nichts zu suchen hat

Der Rumpf einer Komponente soll **rein** sein: gleiche Props, gleiches Ergebnis, keine Nebenwirkung.
Verboten ist deshalb alles, was nach außen wirkt oder bei jedem Aufruf etwas anderes liefert –
Netzwerkanfragen, Schreiben ins DOM, `localStorage`, Zufallszahlen.

`new Date()` im Rumpf ist ein Grenzfall: Es ist bei jedem Aufruf anders, aber in DevBoard
ausdrücklich erlaubt und hineingereicht statt ermittelt:

```tsx
heute={heute}    // die Seite ermittelt es, die Komponente bekommt es
```

→ [monatskalender.tsx](../frontend/src/components/monatskalender.tsx)

Der Grund ist der Test: *„hebt heute hervor"* wäre sonst nur an dem Tag prüfbar, an dem man ihn
schreibt.

### `useEffect` – und wann man ihn nicht braucht

Ein Effekt läuft **nach** dem Rendern und ist für alles da, was außerhalb von React passiert.

```tsx
useEffect(() => {
  if (!tag) {
    dialog.current?.close();
    return;
  }
  reset({ … });
  dialog.current?.showModal();
}, [tag, reset]);
```

→ [termin-dialog.tsx](../frontend/src/components/termin-dialog.tsx)

Das ist ein **guter** Grund für einen Effekt: `showModal()` ist ein imperativer Aufruf an das DOM,
den React nicht aus dem Zustand ableiten kann.

**Die meisten Effekte, die man im Alltag sieht, sind aber keine guten.** Drei Beispiele, die man
streichen kann:

```tsx
// FALSCH: abgeleiteter Wert im Effekt
const [vollerName, setzeVollerName] = useState('');
useEffect(() => { setzeVollerName(`${vor} ${nach}`); }, [vor, nach]);

// RICHTIG: einfach ausrechnen
const vollerName = `${vor} ${nach}`;
```

```tsx
// FALSCH: Zustand aus Props spiegeln
useEffect(() => { setzeWert(props.wert); }, [props.wert]);

// RICHTIG: props.wert direkt benutzen, oder key zum Zurücksetzen (R3)
```

```tsx
// FALSCH: auf ein Ereignis reagieren
useEffect(() => { if (abgeschickt) zeigeMeldung(); }, [abgeschickt]);

// RICHTIG: im Ereignisbehandler, wo es passiert ist
const absenden = () => { … zeigeMeldung(); };
```

> **Ein Effekt ist dafür da, React mit etwas außerhalb zu synchronisieren. Nicht dafür, auf eigene
> Zustandsänderungen zu reagieren.**

Genau diese Regel steht in DevBoard als bestandener Fall im Code: Die erste Fassung des Dialogs
leerte die Fehlermeldung im Effekt, und ESLint strich das an
(`react-hooks/set-state-in-effect`). Die Meldung wird jetzt beim **Schließen** geleert, also in
einem Ereignis.

### Die Abhängigkeitsliste

Das zweite Argument sagt, wann der Effekt erneut läuft.

| Liste | Verhalten |
|---|---|
| fehlt | nach **jedem** Rendern |
| `[]` | genau einmal nach dem ersten Rendern |
| `[a, b]` | wenn sich `a` oder `b` geändert hat |

Verglichen wird mit `Object.is` – also bei Objekten und Funktionen nach **Identität**, nicht nach
Inhalt. Ein bei jedem Rendern neu gebautes Objekt ist jedes Mal ein anderes, und der Effekt läuft
endlos. Dagegen hilft `useMemo`/`useCallback` (R8) oder: den Wert gar nicht erst zum Objekt machen.

**Die Liste nicht künstlich kürzen.** Wer eine Abhängigkeit weglässt, um ein erneutes Laufen zu
verhindern, erzeugt eine *stale closure*: Der Effekt arbeitet mit einem alten Wert, den er beim
ersten Lauf eingefangen hat. Der Fehler zeigt sich als „die Anzeige hängt eine Änderung hinterher".

### Aufräumen

Gibt der Effekt eine Funktion zurück, läuft sie vor dem nächsten Durchgang und beim Entfernen der
Komponente:

```tsx
document.addEventListener('keydown', beiTaste);
document.addEventListener('mousedown', beiKlick);

return () => {
  document.removeEventListener('keydown', beiTaste);
  document.removeEventListener('mousedown', beiKlick);
};
```

→ [seitenleiste.tsx](../frontend/src/components/seitenleiste.tsx)

Der Kommentar dort sagt, warum es keine Formsache ist: *Ohne das blieben nach jedem Öffnen zwei
Zuhörer am Dokument hängen.*

Aufräumen gehört zu: Zuhörern, Zeitgebern, Abonnements, offenen Verbindungen, laufenden Anfragen.

### Effekte laufen in der Entwicklung doppelt

Im Strict Mode baut React jede Komponente beim ersten Mal auf, ab und wieder auf. Das ist **Absicht**
und deckt genau die Effekte auf, die nicht aufräumen. Ein Effekt, der doppelt stört, ist kaputt –
nicht der Strict Mode.

---

## R7 · `useRef`

Zwei Verwendungen, die wenig miteinander zu tun haben.

**1 · Ein Griff ans DOM-Element.**

```tsx
const dialog = useRef<HTMLDialogElement>(null);
…
<dialog ref={dialog}>…</dialog>
…
dialog.current?.showModal();
```

→ [termin-dialog.tsx](../frontend/src/components/termin-dialog.tsx)

**2 · Ein Wert, der ein Rendern überdauert, ohne eines auszulösen.** Für Dinge, die die Anzeige
nicht betreffen – eine Zeitgeber-Kennung, der vorherige Wert, ein Zähler.

**Der Unterschied zu `useState` in einem Satz:** `useState` sagt React Bescheid, `useRef` nicht.
Wenn die Anzeige sich ändern soll, ist es Zustand. Wenn nicht, ist es eine Referenz.

**Nicht während des Renderns lesen oder schreiben.** `ref.current` ist beim ersten Rendern noch
`null` – das Element existiert erst danach. Zugriffe gehören in Effekte und Ereignisbehandler.

> **React 19:** `ref` ist jetzt eine ganz normale Prop. Das frühere `forwardRef` braucht man für
> neuen Code nicht mehr. Ältere Anleitungen zeigen es noch.

---

## R8 · Ableiten statt speichern

Der häufigste Entwurfsfehler in React ist **zu viel Zustand**.

```tsx
// FALSCH
const [termine, setzeTermine] = useState([]);
const [anzahl, setzeAnzahl] = useState(0);        // kann veralten
const [istLeer, setzeIstLeer] = useState(true);   // kann veralten

// RICHTIG
const [termine, setzeTermine] = useState([]);
const anzahl = termine.length;
const istLeer = termine.length === 0;
```

Jeder gespeicherte abgeleitete Wert ist eine zweite Wahrheit, die man von Hand nachführen muss – und
die erste Stelle, an der man es vergisst, erzeugt eine Anzeige, die nicht zu den Daten passt.

**Die Frage, die man sich stellt:** *Lässt sich dieser Wert aus anderem Zustand ausrechnen?* Wenn
ja, ist es kein Zustand.

### `useMemo`

Erst wenn die Ableitung teuer ist **oder ihre Identität zählt**, kommt `useMemo`:

```tsx
const zeitraum = useMemo(() => rasterZeitraum(monatsraster(monat)), [monat]);
```

→ [kalender/page.tsx](../frontend/src/app/\(app\)/kalender/page.tsx)

Die Begründung dort ist nicht die Rechenzeit – 42 `Date`-Objekte sind billig. Es ist die
**Identität**: `von` und `bis` gehen in den Abfrage-Schlüssel und in Abhängigkeitslisten. Ein bei
jedem Rendern neu gebautes Objekt wäre dort der Unterschied zwischen „einmal fragen" und „immer
wieder fragen".

### `useCallback`

Dasselbe für Funktionen. Lohnt sich, wenn die Funktion in einer Abhängigkeitsliste steht oder an
eine memoisierte Komponente geht. Sonst ist sie Lärm.

> **Nicht vorsorglich memoisieren.** `useMemo` und `useCallback` kosten selbst etwas und machen den
> Code schwerer lesbar. Sie sind eine Antwort auf ein gemessenes Problem, keine Gewohnheit.

---

## R9 · Eigene Hooks

Ein eigener Hook ist eine Funktion, deren Name mit `use` beginnt und die andere Hooks aufruft. Mehr
ist es nicht – es gibt keine besondere Syntax.

```tsx
export function useKalender(orgId: string | undefined, von: string, bis: string) {
  const { authFetch } = useAuth();

  return useQuery({
    queryKey: kalenderKey(orgId ?? 'keine', von, bis),
    queryFn: () => { … },
    enabled: Boolean(orgId),
    retry: false,
  });
}
```

→ [kalender.ts](../frontend/src/lib/kalender.ts)

In DevBoard gibt es ein gutes Dutzend davon – `useAufgaben`, `useProjekte`, `useMitglieder`,
`useKennzahlen`, `useAktiveOrganisation`. Alle folgen demselben Muster: **Die Komponente fragt nach
Daten, nicht nach HTTP.**

**Was ein eigener Hook teilt, ist Logik – nicht Zustand.** Zwei Komponenten, die denselben Hook
aufrufen, bekommen jeweils eigenen Zustand. Wer gemeinsamen Zustand will, braucht Context (R10) oder
einen Zwischenspeicher wie TanStack Query.

**Die Namensregel ist nicht Kosmetik.** Der Linter erkennt an `use`, dass die Regeln der Hooks (R12)
gelten. Eine Funktion namens `ladeKalender`, die `useQuery` aufruft, wird nicht geprüft – und der
erste bedingte Aufruf fällt dann zur Laufzeit auf.

---

## R10 · Context

Context löst ein Problem: Ein Wert wird weit unten gebraucht und ist weit oben bekannt. Ohne Context
reicht man ihn durch jede Ebene durch (*prop drilling*).

Drei Teile:

```tsx
const AuthContext = createContext<AuthZustand | null>(null);        // 1. anlegen

export function AuthProvider({ children }) {                         // 2. bereitstellen
  …
  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>;
}

export function useAuth() {                                          // 3. lesen
  const kontext = useContext(AuthContext);
  if (!kontext) throw new Error('useAuth ausserhalb des AuthProvider');
  return kontext;
}
```

→ [auth-context.tsx](../frontend/src/lib/auth-context.tsx)

**Beachtenswert ist Punkt 3.** Der Context wird nicht roh herausgegeben, sondern hinter einem
eigenen Hook, der prüft, ob es einen Provider gibt. Ohne diese Prüfung bekäme man `null` und einen
Absturz drei Ebenen später – mit ihr eine Meldung, die sagt, was fehlt.

**Wofür Context *nicht* da ist:** als allgemeiner Datenspeicher. Jede Änderung am `value` rendert
**alle** Verbraucher neu. Serverdaten gehören deshalb in TanStack Query, nicht in einen Context.
In DevBoard steckt im Context nur, was wirklich global und selten ist: der angemeldete Nutzer und
die Funktion, mit der man authentifiziert anfragt.

**Der häufigste Context-Fehler:** ein Objektliteral als `value`.

```tsx
<AuthContext.Provider value={{ nutzer, anmelden }}>   // neues Objekt bei JEDEM Rendern
```

Damit rendert jeder Verbraucher bei jedem Rendern des Providers neu. Richtig ist ein `useMemo` um
den Wert.

> **React 19:** `<AuthContext>` funktioniert direkt als Provider, `.Provider` ist nicht mehr nötig.
> DevBoard benutzt noch die ausführliche Form – beides ist korrekt.

---

## R11 · Formulare

### Kontrolliert und unkontrolliert

**Kontrolliert** heißt: React hält den Wert, das Feld zeigt ihn an.

```tsx
<input value={wert} onChange={(e) => setzeWert(e.target.value)} />
```

**Unkontrolliert** heißt: Das DOM hält den Wert, React liest ihn bei Bedarf.

Der häufigste Fehler ist das Dazwischen:

```tsx
<input value={wert} />          // ohne onChange - das Feld lässt sich nicht tippen
<input value={undefined} />     // React warnt beim Wechsel kontrolliert <-> unkontrolliert
```

Ein kontrolliertes Feld braucht **immer** `onChange`, und sein Wert darf nie `undefined` werden –
dafür nimmt man `''`.

### Was DevBoard stattdessen macht

```tsx
<Feld label="Titel" fehler={errors.title?.message} {...register('title')} />
```

→ [termin-dialog.tsx](../frontend/src/components/termin-dialog.tsx)

`react-hook-form` arbeitet **unkontrolliert**: Die Felder behalten ihre Werte selbst, die Bibliothek
liest sie beim Absenden. Dadurch rendert nicht die ganze Seite bei jedem Tastendruck neu.

Die Prüfung macht ein Zod-Schema über `zodResolver` – dasselbe Schema-Werkzeug wie im Backend.

### Ereignisse

```tsx
<form onSubmit={absenden} noValidate>
```

`onSubmit` am Formular, nicht `onClick` am Knopf – sonst funktioniert die Eingabetaste nicht.
`noValidate` schaltet die Browser-Prüfung ab, damit die eigene Prüfung die einzige Wahrheit ist.

React hängt nicht an jedes Element einen Zuhörer, sondern einen an die Wurzel. Für den Alltag heißt
das nur: `e.preventDefault()` funktioniert wie erwartet, `return false` nicht.

---

## R12 · Die Regeln der Hooks

Zwei Regeln, und beide sind absolut.

**1 · Hooks nur auf oberster Ebene einer Komponente oder eines eigenen Hooks.** Nicht in `if`, nicht
in Schleifen, nicht nach einem vorzeitigen `return`, nicht in verschachtelten Funktionen.

```tsx
if (angemeldet) {
  const [x, setX] = useState(0);   // VERBOTEN
}
```

**2 · Hooks nur aus React-Funktionen.** Aus einer Komponente oder einem `use…`-Hook, nicht aus einer
gewöhnlichen Hilfsfunktion.

### Warum das so streng ist

React merkt sich die Hooks einer Komponente **in der Aufrufreihenfolge** – als Liste, nicht unter
Namen. Beim zweiten Rendern wird der erste `useState` dem ersten gespeicherten Wert zugeordnet, der
zweite dem zweiten.

Fällt ein Aufruf durch eine Bedingung weg, verrutscht alles dahinter um eine Stelle. Dann bekommt ein
`useState` den Wert eines anderen, und der Fehler sieht aus wie Spuk.

**Das ist kein theoretisches Problem.** Genau deshalb steht in DevBoard `useTerminAnlegen(orgId)`
und nicht `useAufgabeAnlegen(orgId, projektId)`: Das Projekt wird im Dialog erst ausgewählt, ein
Hook mit festem Projekt müsste also je Auswahl neu aufgerufen werden – und das geht nicht. Also
wandert `projektId` vom Hook in die Mutation.

→ [kalender.ts](../frontend/src/lib/kalender.ts)

**Der Linter prüft beides.** `eslint-plugin-react-hooks` ist kein Komfort, sondern die einzige
Absicherung gegen eine Fehlerklasse, die zur Laufzeit kaum zu diagnostizieren ist.

---

## R13 · Katalog typischer Fehler

Nach Häufigkeit sortiert, mit der Fassung, die stattdessen richtig ist.

### 1 · Zustand direkt verändern

```tsx
termine.push(neu);  setzeTermine(termine);     // nichts passiert
setzeTermine([...termine, neu]);                // richtig
```

Auch bei Objekten: `{ ...objekt, feld: neu }`.

### 2 · `0` erscheint auf der Seite

```tsx
{liste.length && <Liste />}        // zeigt "0"
{liste.length > 0 && <Liste />}    // richtig
```

### 3 · Index als Schlüssel bei veränderlichen Listen

Siehe R3. Symptom: Eingaben oder Markierungen bleiben beim falschen Element hängen.

### 4 · Veralteter Wert in einer Closure

```tsx
useEffect(() => {
  const id = setInterval(() => setzeZahl(zahl + 1), 1000);   // zahl ist eingefroren
  return () => clearInterval(id);
}, []);

// richtig: Funktionsform, dann braucht der Effekt `zahl` gar nicht
setzeZahl((z) => z + 1);
```

### 5 · Effekt für etwas, das keiner ist

Abgeleitete Werte, gespiegelte Props, Reaktion auf eigene Ereignisse – siehe R6.

### 6 · Objekt oder Funktion in der Abhängigkeitsliste

```tsx
useEffect(() => { … }, [{ von, bis }]);   // jedes Mal ein neues Objekt -> Endlosschleife
useEffect(() => { … }, [von, bis]);       // richtig: die Einzelwerte
```

### 7 · Fehlendes Aufräumen

Zuhörer, Zeitgeber, Abonnements. Symptom: Es wird mit jedem Öffnen langsamer, oder ein Zuhörer
feuert mehrfach.

### 8 · `async` direkt am Effekt

```tsx
useEffect(async () => { … }, []);          // gibt ein Promise zurück, nicht die Aufräumfunktion

useEffect(() => {                          // richtig
  void (async () => { … })();
}, []);
```

### 9 · Kontrolliertes Feld ohne `onChange`

Siehe R11. Symptom: Man kann nicht tippen.

### 10 · Komponente klein geschrieben

`<tageszelle />` ist für JSX ein HTML-Element und tut stillschweigend nichts.

### 11 · Komponente innerhalb einer Komponente definiert

```tsx
function Seite() {
  function Zeile() { … }      // bei jedem Rendern eine NEUE Komponente
  return <Zeile />;           // -> Zustand darin geht jedes Mal verloren
}
```

Komponenten gehören auf Modulebene.

### 12 · `useState` für Serverdaten

Laden, Fehler, Nachladen, Entwerten, Mehrfachabfragen – all das baut man dann von Hand nach. Dafür
gibt es TanStack Query (`18_FRONTEND.md`, A3).

---

## R14 · Wo das in DevBoard steht

| Thema | Datei |
|---|---|
| JSX, Bedingungen, Listen | `frontend/src/components/monatskalender.tsx` |
| `useState`, Funktionsform, Startfunktion | `frontend/src/app/(app)/kalender/page.tsx` |
| `useEffect` mit gutem Grund, `useRef` ans DOM | `frontend/src/components/termin-dialog.tsx` |
| Aufräumen von Zuhörern | `frontend/src/components/seitenleiste.tsx` |
| `useMemo` wegen Identität | `frontend/src/app/(app)/kalender/page.tsx` |
| Eigene Hooks | `frontend/src/lib/kalender.ts`, `aufgaben.ts`, `organisationen.ts` |
| Context mit Prüfung | `frontend/src/lib/auth-context.tsx` |
| Formulare, Prüfung mit Zod | `frontend/src/components/termin-dialog.tsx` |
| Zugängliche Felder | `frontend/src/components/ui.tsx` |
| Reine Rechnung ohne React | `frontend/src/lib/kalender-raster.ts`, `board-logik.ts` |

---

## R15 · Fragen zum Selbstprüfen

Wer die Antworten ohne Nachschlagen geben kann, hat das Kapitel verstanden.

1. Warum ist `{liste.length && <X />}` ein Fehler, `{liste.length > 0 && <X />}` aber nicht?
2. Was passiert, wenn man in einer Liste den Array-Index als `key` benutzt und oben etwas einfügt?
3. Warum ergibt zweimal `setzeZahl(zahl + 1)` nur ein Plus eins?
4. Warum merkt React nichts, wenn man `push` auf einem Zustands-Array aufruft?
5. Nenne drei Effekte, die man streichen kann, und was stattdessen richtig ist.
6. Warum dürfen Hooks nicht in einem `if` stehen?
7. Was ist der Unterschied zwischen `useState` und `useRef` in einem Satz?
8. Warum steht `aria-invalid={fehler ? true : undefined}` dort und nicht `: false`?
9. Wann lohnt sich `useMemo` – und was ist der Grund, der nichts mit Rechenzeit zu tun hat?
10. Warum laufen Effekte in der Entwicklung doppelt, und was sagt es aus, wenn das stört?

Antworten in den jeweiligen Abschnitten; die Interviewfassung mehrerer davon steht in
`07_INTERVIEW_NOTES.md`.
