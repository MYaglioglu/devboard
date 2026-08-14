/**
 * ============================================================================
 * DER CURSOR - EINE STELLE IN DER SORTIERUNG, KEINE SEITENZAHL
 * ============================================================================
 * Offset-Paginierung (`?page=3`) hat zwei Probleme, und nur eines davon ist
 * die Geschwindigkeit:
 *
 *   1. `OFFSET 10000` liest zehntausend Zeilen und wirft sie weg. Die Kosten
 *      steigen mit der Seitenzahl, obwohl das Ergebnis immer gleich gross ist.
 *   2. Der schlimmere: Kommt zwischen zwei Seitenaufrufen ein neuer Eintrag
 *      OBEN dazu, verschiebt sich alles um eins nach hinten - und der Nutzer
 *      sieht auf Seite 2 einen Eintrag, den er auf Seite 1 schon gelesen hat.
 *      Bei einem Feed, in den staendig geschrieben wird, ist das der
 *      Normalfall und nicht der Ausnahmefall.
 *
 * Ein Cursor bezeichnet stattdessen eine STELLE: "weiter nach genau diesem
 * Eintrag". Neue Eintraege oben aendern daran nichts - sie liegen ausserhalb
 * dessen, was noch gelesen wird.
 *
 * ============================================================================
 * WARUM ER AUS ZEITSTEMPEL UND ID BESTEHT
 * ============================================================================
 * `createdAt` allein bezeichnet keine Stelle, sondern eine GRUPPE: Die Spalte
 * ist `timestamp(3)`, und mehrere Eintraege aus derselben Transaktion teilen
 * sich regelmaessig eine Millisekunde. "Alles aelter als 14:03:22.150" wuerde
 * die gleichzeitigen Eintraege je nach Ausgang doppelt zeigen oder
 * ueberspringen.
 *
 * Mit der `id` als zweitem Bestandteil ist die Ordnung total - genau die
 * Reihenfolge, die auch im Index steht.
 */

/** Die Stelle, an der weitergelesen wird. */
export interface CursorStelle {
  createdAt: Date;
  id: string;
}

/**
 * ============================================================================
 * WARUM DER CURSOR UNDURCHSICHTIG IST - UND WAS DAS NICHT BEDEUTET
 * ============================================================================
 * Nach aussen ist er eine Zeichenkette ohne erkennbare Struktur. Das ist
 * ABSICHT, aber nicht aus Geheimhaltung: Waere der Aufbau sichtbar, wuerden
 * Clients anfangen, ihn selbst zu bauen ("einfach den Zeitstempel einsetzen").
 * Damit waere das Format Teil der Schnittstelle, und der Tag, an dem der Feed
 * ein drittes Sortierkriterium bekommt, braeche jeden dieser Clients.
 *
 * Base64 ist KEINE Verschluesselung - jeder kann den Inhalt lesen. Das ist
 * hier auch nicht noetig, und der Grund dafuer ist die wichtigste Zeile dieser
 * Datei:
 *
 *   DER CURSOR TRAEGT DEN MANDANTEN NICHT.
 *
 * Er sagt nur, WO weitergelesen wird - nicht, WORIN. Die Organisation kommt
 * ausschliesslich aus der vom Guard geprueften Mitgliedschaft und steht in der
 * WHERE-Bedingung. Ein manipulierter Cursor kann die Stelle innerhalb der
 * eigenen Daten verschieben, aber nicht in fremde Daten zeigen - dort sucht
 * die Abfrage gar nicht erst.
 *
 * Genau deshalb braucht er auch keine Signatur. Ein signierter Cursor waere
 * die Antwort auf ein Problem, das erst entstuende, wenn man den Mandanten
 * hineinschriebe - und das waere der eigentliche Fehler. Ein Wert, der aus dem
 * Browser kommt, darf nie darueber entscheiden, WESSEN Daten man sieht.
 */
export const kodiereCursor = (stelle: CursorStelle): string =>
  Buffer.from(`${stelle.createdAt.toISOString()}|${stelle.id}`).toString(
    'base64url',
  );

/**
 * Liest einen Cursor - oder meldet, dass er unbrauchbar ist.
 *
 * Rueckgabe `null` statt einer Ausnahme: Diese Datei ist rein rechnend und
 * kennt kein HTTP. Was ein ungueltiger Cursor bedeutet - 400, oder still von
 * vorne anfangen - entscheidet der Aufrufer. Wuerde hier eine
 * `BadRequestException` fliegen, waere die Funktion an NestJS gebunden und
 * nur noch mit dessen Testaufbau pruefbar.
 *
 * `base64url` und nicht `base64`: Der Wert steht in einem Query-Parameter.
 * Normales Base64 verwendet `+` und `/`, und `+` bedeutet in einer Query
 * ein Leerzeichen - der Cursor kaeme beschaedigt an, je nachdem, wie der
 * Client kodiert. Ein Fehler, der nur bei bestimmten Zufallswerten auftritt,
 * ist teurer als jeder, der immer auftritt.
 */
export const dekodiereCursor = (roh: string): CursorStelle | null => {
  let entpackt: string;

  try {
    entpackt = Buffer.from(roh, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  // Die ID ist eine UUID und enthaelt selbst kein `|`, der Zeitstempel
  // ebenfalls nicht. Getrennt wird trotzdem nur am ERSTEN Vorkommen: Sonst
  // koennte ein manipulierter Wert mit zusaetzlichem Trennzeichen einen
  // Teilstring erzeugen, der zufaellig als gueltig durchgeht.
  const teiler = entpackt.indexOf('|');
  if (teiler === -1) {
    return null;
  }

  const zeitstempel = new Date(entpackt.slice(0, teiler));
  const id = entpackt.slice(teiler + 1);

  // `new Date('unsinn')` wirft NICHT, sondern liefert ein Date-Objekt, dessen
  // Zeitwert NaN ist. Ohne diese Pruefung ginge der Unsinn bis in die
  // WHERE-Bedingung durch, und Postgres meldete einen Syntaxfehler - aus einer
  // schlicht falschen Eingabe wuerde ein 500er.
  if (Number.isNaN(zeitstempel.getTime())) {
    return null;
  }

  // Die ID wird hier bewusst NICHT gegen ein UUID-Muster geprueft. Sie geht
  // als Parameter in eine vorbereitete Anweisung, nicht in zusammengebautes
  // SQL - eine ungueltige ID findet schlicht nichts. Eine Formatpruefung waere
  // eine zweite Wahrheit neben dem Datenbankschema, die beim naechsten
  // Schluesselformat vergessen wuerde.
  if (id.length === 0) {
    return null;
  }

  return { createdAt: zeitstempel, id };
};
