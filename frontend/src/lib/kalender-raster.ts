/**
 * ============================================================================
 * DAS MONATSRASTER - REINE RECHNUNG, OHNE REACT UND OHNE UHR
 * ============================================================================
 * Dieselbe Aufteilung wie bei `positionen.ts` und `board-logik.ts`: Was sich
 * ohne Datenbank und ohne Browser ausrechnen laesst, steht in einer eigenen
 * Datei und wird dort geprueft.
 *
 * Der Grund ist nicht die Architekturlehre, sondern der Preis: Ein Test fuer
 * "der September 2026 beginnt an einem Dienstag" braucht hier drei Zeilen. Als
 * Komponententest braeuchte er einen gerenderten Kalender, einen Zwischen-
 * speicher, einen angemeldeten Nutzer - und wuerde bei einem Fehler nicht
 * sagen, WAS falsch gerechnet wurde.
 *
 * ============================================================================
 * KEINE DATUMSBIBLIOTHEK
 * ============================================================================
 * date-fns oder Luxon koennten das hier auch. Sie waeren fuer diese Rechnung
 * aber ein zusaetzliches Paket, um `Date` genau die Dinge tun zu lassen, die
 * `Date` von sich aus kann: einen Monat weiterspringen und den Wochentag
 * nennen.
 *
 * Wo eine Bibliothek richtig waere: sobald wir Termine in einer ANDEREN Zone
 * als der des Betrachters anzeigen wollten ("Berliner Zeit, egal wo du
 * sitzt"). Zeitzonen selbst zu rechnen ist der Fehler, den man nicht machen
 * will - dafuer gibt es `Intl` und Bibliotheken. Solange der Kalender die
 * LOKALE Zone des Betrachters meint, rechnet `Date` sie von selbst richtig.
 */

/**
 * Ein Zeiger auf einen Monat.
 *
 * ============================================================================
 * `monat` IST NULLBASIERT - 0 IST JANUAR
 * ============================================================================
 * Das ist unschoen und trotzdem die richtige Wahl. `Date` selbst zaehlt so,
 * und jede Umrechnung an der Grenze waere eine Stelle, an der ein
 * Plus-eins-Minus-eins verrutschen kann. Ein Kalender, der im Dezember den
 * Januar zeigt, ist der Klassiker dieser Sorte Fehler.
 *
 * Die Regel lautet deshalb: Wir uebernehmen die Zaehlweise der Plattform und
 * schreiben sie hin, statt eine eigene daneben zu stellen. Nach aussen sichtbar
 * wird sie nie - der Nutzer sieht "September 2026".
 */
export interface Monatszeiger {
  jahr: number;
  /** 0 = Januar, 11 = Dezember - wie bei `Date`. */
  monat: number;
}

/** Ein Tag im Raster. */
export interface Kalendertag {
  /**
   * Mitternacht dieses Tages in der LOKALEN Zone des Betrachters.
   *
   * `new Date(2026, 8, 1)` ist der 01.09.2026 um 00:00 Uhr Ortszeit - nicht
   * UTC. Genau das ist gewollt: Ein Kalendertag ist eine Aussage ueber den
   * Ort, an dem jemand sitzt.
   */
  datum: Date;
  /**
   * Gehoert der Tag zum angezeigten Monat, oder ist er Vor- beziehungsweise
   * Nachlauf?
   *
   * Die Unterscheidung steht hier und nicht in der Komponente, weil sie eine
   * Aussage ueber das Raster ist und nicht ueber die Darstellung. Die
   * Komponente entscheidet nur, dass Nachbarmonate blasser aussehen.
   */
  imMonat: boolean;
}

/** Wie viele Zeilen das Raster immer hat - siehe Begruendung in `monatsraster`. */
const WOCHEN_IM_RASTER = 6;

const TAGE_JE_WOCHE = 7;

/**
 * Der Wochentag als Zahl, **montagsbasiert**.
 *
 * `Date.getDay()` liefert 0 fuer Sonntag - amerikanische Zaehlweise. In einem
 * deutschen Kalender beginnt die Woche am Montag, und ohne diese Umrechnung
 * stuende der erste Tag jedes Monats um einen Platz verschoben.
 *
 * `(tag + 6) % 7` verschiebt den Sonntag von 0 auf 6 und alles andere um eins
 * nach unten: Montag 0, Dienstag 1, ... Sonntag 6.
 */
export const wochentagAbMontag = (datum: Date): number =>
  (datum.getDay() + 6) % TAGE_JE_WOCHE;

/**
 * Baut das Raster eines Monats - immer sechs volle Wochen.
 *
 * ============================================================================
 * WARUM IMMER SECHS ZEILEN UND NICHT SO VIELE WIE NOETIG
 * ============================================================================
 * Ein Monat braucht je nach Laenge und Startwochentag vier bis sechs Zeilen.
 * Der Februar 2027 beginnt an einem Montag und hat 28 Tage - er passt in
 * genau vier.
 *
 * Wuerde das Raster mitwachsen, aenderte der Kalender beim Blaettern seine
 * Hoehe. Der Inhalt darunter springt, und der Knopf "naechster Monat" liegt
 * nach dem Klick woanders als davor - man klickt zweimal, weil der erste
 * Klick den Knopf wegbewegt hat.
 *
 * Feste sechs Zeilen kosten in manchen Monaten eine leere Zeile am Ende und
 * sparen dafuer jedes Springen. Dasselbe Prinzip wie bei den grauen Balken
 * beim Laden in der Seitenleiste: Platz reservieren, statt ihn entstehen zu
 * lassen.
 *
 * 42 Tage sind ausserdem bequem unterhalb der 92-Tage-Grenze des Endpoints -
 * eine Monatsansicht kann sie also nie reissen.
 */
export function monatsraster({ jahr, monat }: Monatszeiger): Kalendertag[] {
  const erster = new Date(jahr, monat, 1);

  // Wie viele Tage aus dem Vormonat vor dem Ersten stehen. Beginnt der Monat
  // an einem Montag, sind es null - dann startet das Raster direkt.
  const vorlauf = wochentagAbMontag(erster);

  return Array.from(
    { length: WOCHEN_IM_RASTER * TAGE_JE_WOCHE },
    (_, index) => {
      // `new Date(jahr, monat, 0)` waere der letzte Tag des VORmonats, und
      // negative Tageszahlen gehen entsprechend weiter zurueck. Diese
      // Ueberlaufrechnung ist keine Spielerei, sondern der Grund, warum hier
      // nirgends "wie viele Tage hat der Vormonat" steht: `Date` rechnet
      // Monats- und Jahresgrenzen selbst, inklusive Schaltjahr.
      const datum = new Date(jahr, monat, 1 - vorlauf + index);

      return { datum, imMonat: datum.getMonth() === monat };
    },
  );
}

/**
 * Der Zeitraum, den der Kalender vom Server holen muss.
 *
 * ============================================================================
 * DAS RASTER, NICHT DER MONAT
 * ============================================================================
 * Naheliegend waere, den Monat abzufragen. Dann blieben aber genau die Vor-
 * und Nachlauftage leer, die im Raster sichtbar sind - der 31.08. staende im
 * September-Kalender ohne seine Termine, und niemand saehe, dass dort welche
 * sind.
 *
 * ============================================================================
 * HIER PASSIERT DIE ZEITZONEN-UMRECHNUNG - AN GENAU EINER STELLE
 * ============================================================================
 * `datum` ist Mitternacht ORTSZEIT. `toISOString()` macht daraus den
 * zugehoerigen Zeitpunkt in UTC: Aus dem 01.09.2026 00:00 in Berlin wird
 * `2026-08-31T22:00:00.000Z`.
 *
 * Genau so will es der Server. Er kennt die Zone des Betrachters nicht und
 * rechnet ausdruecklich nicht damit - er vergleicht nur Zeitpunkte
 * (09_API.md). Welcher Kalendertag ein Zeitpunkt ist, entscheidet allein
 * diese Datei.
 *
 * `bis` ist der Tag NACH dem letzten Rastertag, weil der Zeitraum halboffen
 * ist (`von <= dueDate < bis`). Wuerde hier der letzte Tag selbst stehen,
 * fehlten alle Termine dieses Tages ausser dem um Punkt Mitternacht.
 */
export function rasterZeitraum(raster: Kalendertag[]): {
  von: string;
  bis: string;
} {
  const erster = raster[0].datum;
  const letzter = raster[raster.length - 1].datum;

  const nachDemLetzten = new Date(
    letzter.getFullYear(),
    letzter.getMonth(),
    letzter.getDate() + 1,
  );

  return { von: erster.toISOString(), bis: nachDemLetzten.toISOString() };
}

/**
 * Einen Monat vor oder zurueck.
 *
 * `new Date(2026, 12, 1)` ist der Januar 2027 - `Date` normalisiert den
 * Ueberlauf selbst. Deshalb steht hier keine Sonderbehandlung fuer Dezember,
 * und deshalb gibt es hier auch keinen Fehler, wenn jemand elf Monate
 * weiterblaettert.
 */
export function verschiebeMonat(
  { jahr, monat }: Monatszeiger,
  schritte: number,
): Monatszeiger {
  const verschoben = new Date(jahr, monat + schritte, 1);

  return { jahr: verschoben.getFullYear(), monat: verschoben.getMonth() };
}

/**
 * Liegen zwei Zeitpunkte am selben LOKALEN Kalendertag?
 *
 * ============================================================================
 * WARUM NICHT `a.toDateString() === b.toDateString()`
 * ============================================================================
 * Das waere kuerzer und funktioniert - es erzeugt aber zwei Zeichenketten je
 * Vergleich, und der Kalender vergleicht bei jedem Rendern 42 Tage gegen jeden
 * Termin. Drei Zahlenvergleiche sind hier das Naheliegende, nicht die
 * Optimierung.
 *
 * ============================================================================
 * WARUM DIESE FUNKTION KEINE UHR KENNT
 * ============================================================================
 * "Ist das heute?" waere die bequemere Signatur. Sie haette aber `new Date()`
 * im Inneren - und damit einen Test, dessen Ergebnis vom Tag des Laufs
 * abhaengt. Die Lehre steht seit Sprint 3 dreimal im Projekt: Ein Test darf
 * die Bedingung nicht abwarten, er muss sie herstellen. Wer "heute" braucht,
 * reicht es hinein.
 */
export function amSelbenTag(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Die Uhrzeit, mit der ein neu angelegter Termin vorbelegt wird.
 *
 * Nicht Mitternacht: Ein Termin um 00:00 liest sich wie "kein Zeitpunkt
 * angegeben", und der Nutzer muesste ihn fast immer aendern. 09:00 ist ein
 * Arbeitsbeginn und damit die Vorgabe, die am seltensten falsch ist.
 *
 * Sie steht hier und nicht im Dialog, weil sie zur Datumsrechnung gehoert -
 * und weil ein Test sie so ohne React pruefen kann.
 */
export const VORGABE_STUNDE = 9;

/**
 * Formatiert einen Zeitpunkt fuer ein `<input type="datetime-local">`.
 *
 * ============================================================================
 * DIE FALLE: `toISOString().slice(0, 16)`
 * ============================================================================
 * Das ist der Einzeiler, den man an dieser Stelle fast immer zuerst schreibt,
 * und er ist falsch. `toISOString()` liefert **UTC**. Im Berliner Sommer
 * stuende im Feld also 07:00, obwohl 09:00 gemeint ist - zwei Stunden zu
 * frueh, und zwar still.
 *
 * Der Fehler ist besonders unangenehm, weil er im Winter nur eine Stunde
 * betraegt und in London gar nicht auftritt. Er verschwindet also genau dort,
 * wo man ihn sucht.
 *
 * `datetime-local` ist ausdruecklich ein Feld OHNE Zone: Es zeigt und nimmt
 * genau das entgegen, was der Nutzer auf seiner Uhr sieht. Also wird hier aus
 * den lokalen Bestandteilen zusammengesetzt, nicht umgerechnet.
 */
export function fuerEingabefeld(datum: Date): string {
  const zweistellig = (wert: number) => String(wert).padStart(2, '0');

  return (
    `${datum.getFullYear()}-${zweistellig(datum.getMonth() + 1)}-` +
    `${zweistellig(datum.getDate())}T${zweistellig(datum.getHours())}:` +
    `${zweistellig(datum.getMinutes())}`
  );
}

/**
 * Der Zeitpunkt, mit dem der Anlege-Dialog startet, wenn jemand auf einen Tag
 * klickt.
 *
 * Der geklickte Tag, aber nicht seine Uhrzeit - `Kalendertag.datum` ist immer
 * Mitternacht. Ohne diese Funktion muesste der Dialog das selbst wissen.
 */
export const vorgabeFuerTag = (tag: Date): Date =>
  new Date(
    tag.getFullYear(),
    tag.getMonth(),
    tag.getDate(),
    VORGABE_STUNDE,
    0,
    0,
    0,
  );

/**
 * Der Tagesname fuer eine Beschriftung - "Dienstag, 15. September 2026".
 *
 * Gebraucht fuer den `aria-label` der Anlege-Flaeche und die Ueberschrift des
 * Dialogs. Ein Knopf, der nur "+" heisst, ist fuer einen Screenreader 42 mal
 * derselbe Knopf.
 */
export const langesDatum = (datum: Date, sprache = 'de-DE'): string =>
  datum.toLocaleDateString(sprache, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * Der angezeigte Monatsname.
 *
 * `Intl` statt einer eigenen Liste mit zwoelf Namen: Die Liste waere schnell
 * geschrieben und dann fuer immer deutsch. `Intl` kennt die Sprache des
 * Browsers - und liefert die richtige Beugung, was bei "1. Januar" gegen
 * "Januar 2026" in manchen Sprachen ein Unterschied ist.
 */
export const monatsName = (
  { jahr, monat }: Monatszeiger,
  sprache = 'de-DE',
): string =>
  new Date(jahr, monat, 1).toLocaleDateString(sprache, {
    month: 'long',
    year: 'numeric',
  });

/** Die Kopfzeile des Rasters - Montag bis Sonntag, kurz. */
export const wochentagsNamen = (sprache = 'de-DE'): string[] =>
  // Der 05.01.1970 war ein Montag. Ein fester Bezugspunkt statt "heute minus
  // Wochentag": Die Namen sollen nicht davon abhaengen, wann jemand die Seite
  // aufruft.
  Array.from({ length: TAGE_JE_WOCHE }, (_, index) =>
    new Date(1970, 0, 5 + index).toLocaleDateString(sprache, {
      weekday: 'short',
    }),
  );
