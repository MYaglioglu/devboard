import { Prisma } from '../generated/prisma/client';

/**
 * ============================================================================
 * DIE SORTIERARITHMETIK DES BOARDS
 * ============================================================================
 * Bewusst eine eigene Datei ohne jede Abhaengigkeit zu Prisma-Abfragen oder
 * NestJS: Das hier ist reine Rechnung, und reine Rechnung laesst sich ohne
 * Datenbank, ohne Testmodul und ohne HTTP pruefen. Genau deshalb stehen die
 * Grenzfaelle in positionen.spec.ts und nicht im Service-Test.
 */

/**
 * Der Decimal-Typ, mit dem hier gerechnet wird.
 *
 * ============================================================================
 * WARUM NICHT EINFACH `Prisma.Decimal`
 * ============================================================================
 * Prisma bringt `decimal.js` mit, und dessen Voreinstellung ist
 * `precision: 20` - zwanzig signifikante Stellen. Die Spalte in PostgreSQL
 * fasst `numeric(65,30)`, also deutlich mehr. Ohne eigene Einstellung wuerde
 * die RECHNUNG runden, bevor die Datenbank ueberhaupt gefragt ist - genau der
 * Praezisionsverlust, wegen dem `numeric` statt `float8` gewaehlt wurde.
 *
 * `clone()` erzeugt einen eigenen Typ, statt die globale Einstellung zu
 * veraendern. Ein `Prisma.Decimal.set(...)` beim Laden dieser Datei wuerde
 * jeden Decimal im ganzen Prozess umkonfigurieren - eine Fernwirkung, die
 * niemand vermutet, der diese Datei nicht kennt.
 *
 * Protokolliert in 17_MISTAKES_AND_LESSONS.md, 13.08.2026.
 */
export const Genau = Prisma.Decimal.clone({ precision: 80 });

/** Der Abstand zwischen zwei frisch vergebenen Positionen. */
export const POSITIONS_ABSTAND = new Genau(1000);

/**
 * So viele Nachkommastellen fasst die Spalte - `numeric(65,30)`.
 *
 * Ab hier MUSS die Spalte neu verteilt werden. Der Wert ist keine Schaetzung,
 * sondern steht so in der Migration: Was darueber hinausgeht, wuerde von
 * PostgreSQL gerundet, und zwei Karten koennten dieselbe Position bekommen.
 */
export const MAX_NACHKOMMASTELLEN = 30;

/**
 * Die neue Position einer Karte zwischen ihren beiden kuenftigen Nachbarn.
 *
 * ============================================================================
 * DAS VERFAHREN: FRACTIONAL INDEXING
 * ============================================================================
 * Die Karte bekommt den MITTELWERT ihrer Nachbarn. Zwischen 1000 und 2000
 * wird 1500, zwischen 1000 und 1500 wird 1250, und so weiter.
 *
 * Der Gewinn: Verschieben schreibt EINE Zeile - unabhaengig davon, wie lang
 * die Spalte ist. Die naheliegende Alternative waere, die Spalte danach mit
 * 1, 2, 3 neu durchzunummerieren; das schreibt N Zeilen und macht aus jedem
 * Verschieben einen Konflikt mit jedem anderen gleichzeitigen Verschieben
 * derselben Spalte.
 *
 * Der Preis: Die Zahl wird bei jedem Einfuegen an derselben Stelle laenger.
 * Nach 30 Halbierungen ist die Spalte erschoepft - siehe `brauchtNeuverteilung`.
 *
 * Die vier Faelle:
 *
 *   oben eingefuegt   (kein Vorgaenger)  -> Position des Nachfolgers MINUS Abstand
 *   unten angehaengt  (kein Nachfolger)  -> Position des Vorgaengers PLUS Abstand
 *   dazwischen                           -> Mittelwert
 *   leere Spalte                         -> der Abstand selbst
 *
 * Dass ganz oben negative Positionen entstehen koennen, ist Absicht und kein
 * Fehler: `numeric` kennt kein Vorzeichenproblem, und die Reihenfolge ergibt
 * sich allein aus dem Vergleich. Eine Sonderbehandlung ("nicht unter 0") waere
 * eine erfundene Regel, die irgendwann eine Neuverteilung erzwingt, ohne dass
 * es noetig waere.
 */
export const berechnePosition = (
  vorgaenger: Prisma.Decimal | null,
  nachfolger: Prisma.Decimal | null,
): Prisma.Decimal => {
  // `new Genau(...)` um JEDEN gelesenen Wert: Prisma liefert Decimals mit der
  // voreingestellten Genauigkeit von 20 Stellen, und decimal.js uebernimmt bei
  // einer Rechnung die Einstellung des LINKEN Operanden. Ohne die Umhuellung
  // wuerde also doch gerundet.
  if (vorgaenger && nachfolger) {
    return new Genau(vorgaenger).plus(nachfolger).dividedBy(2);
  }

  if (nachfolger) {
    return new Genau(nachfolger).minus(POSITIONS_ABSTAND);
  }

  if (vorgaenger) {
    return new Genau(vorgaenger).plus(POSITIONS_ABSTAND);
  }

  return POSITIONS_ABSTAND;
};

/**
 * Ist die Spalte erschoepft?
 *
 * ============================================================================
 * WARUM DAS ÜBERHAUPT PASSIEREN KANN
 * ============================================================================
 * Halbieren in Basis 10 bricht nie ab: 1.5, 1.25, 1.125 - jede Halbierung
 * bringt hoechstens eine Nachkommastelle dazu. Wer 30-mal hintereinander an
 * DIESELBE Stelle einfuegt, hat 30 Nachkommastellen erreicht.
 *
 * Was dann passierte, wenn niemand hinsieht: PostgreSQL rundet auf 30 Stellen,
 * die neue Position waere gleich der eines Nachbarn - und die Reihenfolge der
 * beiden Karten waere ab da unbestimmt. Kein Fehler, keine Meldung, nur ein
 * Board, das nach dem Neuladen anders aussieht.
 *
 * Genau das ist der Unterschied zu `float8`: Dort gaebe es diese Grenze
 * ebenfalls, aber sie liesse sich nicht abfragen. Hier ist sie eine Zahl, die
 * man vergleichen kann - also behandelbar.
 */
export const brauchtNeuverteilung = (position: Prisma.Decimal): boolean =>
  position.decimalPlaces() > MAX_NACHKOMMASTELLEN;

/**
 * Die Positionen einer neu verteilten Spalte: 1000, 2000, 3000, ...
 *
 * Nach der Neuverteilung stehen wieder ganze Zahlen mit grossem Abstand da,
 * und es passen erneut rund 30 Halbierungen zwischen je zwei Nachbarn.
 *
 * Die Neuverteilung laeuft SYNCHRON in der Anfrage, die die Grenze erreicht -
 * ein seltener, dafuer langsamer Aufruf. Sauberer waere eine
 * Hintergrundaufgabe ausserhalb des Anfragepfades; die braucht einen
 * Job-Runner, den das Projekt nicht hat, und steht in 06_BACKLOG.md.
 */
export const neueVerteilung = (anzahl: number): Prisma.Decimal[] =>
  Array.from({ length: anzahl }, (_, index) =>
    POSITIONS_ABSTAND.times(index + 1),
  );
